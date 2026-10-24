import type { GameAction, GameEvent, IGameActionResult } from "@heroesofcrypto/common";

import { isQuotaExceededError, reserveStorageHeadroom } from "../api/local_storage_quota";
import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import type { SandboxSceneState } from "../scenes/Sandbox";
import { shareReplaySnapshot } from "./shareReplaySnapshot";

export const SANDBOX_REPLAY_VERSION = 1;
export const SANDBOX_REPLAY_STORAGE_KEY = "hoc:sandbox-replays:v1";
export const MAX_SAVED_SANDBOX_REPLAYS = 20;

export interface ReplayStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface SandboxReplayActionRecord {
    sequence: number;
    clientTimeMs: number;
    action: GameAction;
    events: GameEvent[];
    stateAfter: SandboxSceneState;
    /**
     * Ranked only: the authoritative snapshot this action settled on, kept whole beside the narrowed scene
     * state. The scene state is what the BOARD is rebuilt from; this is what the ranked presentation layer
     * (combat log, fight stats, turn clock, journal-driven VFX) is fed, because those read fields — the
     * journal tail, damage stats, server clocks — that a scene state deliberately does not carry.
     */
    authoritativeSnapshot?: AuthoritativeGameSnapshot;
}

export interface SandboxReplay {
    version: typeof SANDBOX_REPLAY_VERSION;
    kind: "sandbox";
    id: string;
    createdAtMs: number;
    updatedAtMs: number;
    initialState: SandboxSceneState;
    actions: SandboxReplayActionRecord[];
}

export const cloneReplayData = <T>(value: T): T => {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
};

const getBrowserStorage = (): ReplayStorage | undefined => {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
        return undefined;
    }
    return window.localStorage;
};

const createSandboxReplayId = (): string => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `sandbox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

type ReplayIdleScheduler = (work: (hasTime: () => boolean) => void) => () => void;

interface ReplayCompaction {
    state: SandboxSceneState;
    previous?: SandboxSceneState;
    units: Map<string, SandboxSceneState["units"][number]>;
    unitIndex: number;
}

const scheduleReplayIdleWork: ReplayIdleScheduler = (work) => {
    if (typeof requestIdleCallback === "function") {
        const handle = requestIdleCallback((deadline) => {
            const until = performance.now() + 3;
            work(() => performance.now() < until && deadline.timeRemaining() > 1);
        });
        return () => cancelIdleCallback(handle);
    }
    const handle = setTimeout(() => {
        const until = performance.now() + 2;
        work(() => performance.now() < until);
    }, 16);
    return () => clearTimeout(handle);
};

const isSandboxReplay = (value: unknown): value is SandboxReplay => {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value as Partial<SandboxReplay>;
    return (
        candidate.version === SANDBOX_REPLAY_VERSION &&
        candidate.kind === "sandbox" &&
        typeof candidate.id === "string" &&
        typeof candidate.createdAtMs === "number" &&
        typeof candidate.updatedAtMs === "number" &&
        !!candidate.initialState &&
        Array.isArray(candidate.actions)
    );
};

const normalizeReplays = (value: unknown): SandboxReplay[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter(isSandboxReplay).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
};

export const listSandboxReplays = (storage = getBrowserStorage()): SandboxReplay[] => {
    if (!storage) {
        return [];
    }

    try {
        const raw = storage.getItem(SANDBOX_REPLAY_STORAGE_KEY);
        if (!raw) {
            return [];
        }
        return normalizeReplays(JSON.parse(raw));
    } catch {
        return [];
    }
};

export const loadSandboxReplay = (id: string, storage = getBrowserStorage()): SandboxReplay | undefined =>
    listSandboxReplays(storage).find((replay) => replay.id === id);

/**
 * Store the newest replays that fit. A long fight snapshots the whole board per action and can outgrow the
 * browser's storage quota; a throwing save used to surface as an uncaught error on every action (37 error
 * reports from one spectator tab). Older replays are dropped until the write fits and still leaves room for
 * the session token. If even the newest alone does not, the save is skipped: a local replay is a convenience,
 * never worth an error or a failed login.
 */
export const saveSandboxReplay = (replay: SandboxReplay, storage = getBrowserStorage()): void => {
    if (!storage) {
        return;
    }

    // No defensive clone: the replay is JSON.stringify'd synchronously below, so the stored snapshot
    // is detached regardless. Cloning the whole (growing) replay here was pure per-save overhead.
    const replays = listSandboxReplays(storage).filter((existing) => existing.id !== replay.id);
    replays.unshift(replay);
    let kept = replays.sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, MAX_SAVED_SANDBOX_REPLAYS);
    while (kept.length > 0) {
        try {
            storage.setItem(SANDBOX_REPLAY_STORAGE_KEY, JSON.stringify(kept));
        } catch (err) {
            if (!isQuotaExceededError(err)) {
                throw err;
            }
            kept = kept.slice(0, -1);
            continue;
        }
        // Leave room for the session token. Packing replays to the last byte makes the next login throw.
        if (reserveStorageHeadroom(storage)) {
            return;
        }
        kept = kept.slice(0, -1);
    }
    storage.removeItem(SANDBOX_REPLAY_STORAGE_KEY);
};

export const deleteSandboxReplay = (id: string, storage = getBrowserStorage()): void => {
    if (!storage) {
        return;
    }

    const replays = listSandboxReplays(storage).filter((replay) => replay.id !== id);
    try {
        storage.setItem(SANDBOX_REPLAY_STORAGE_KEY, JSON.stringify(replays));
    } catch {
        // A smaller list than the one already stored cannot exceed the quota; nothing useful to do if it did.
    }
};

export const clearSandboxReplays = (storage = getBrowserStorage()): void => {
    storage?.removeItem(SANDBOX_REPLAY_STORAGE_KEY);
};

export class SandboxReplayRecorder {
    private replay?: SandboxReplay;
    // Persisting the whole (growing) replay to localStorage on every action made the move/attack
    // landing-frame hitch worse as a match went on. The in-memory replay stays current synchronously;
    // the expensive serialize + write is coalesced behind a short debounce and flushed on reset.
    private persistHandle?: ReturnType<typeof setTimeout>;
    private cancelCompaction?: () => void;
    private compactedThrough = -1;
    private compaction?: ReplayCompaction;
    private static readonly PERSIST_DEBOUNCE_MS = 750;
    public constructor(
        private readonly captureSceneState: () => SandboxSceneState,
        private readonly storage = getBrowserStorage(),
        private readonly scheduleIdleWork: ReplayIdleScheduler = scheduleReplayIdleWork,
    ) {}
    public beginAction(now = Date.now()): void {
        this.ensureReplay(now);
    }
    public recordAction(action: GameAction, result: IGameActionResult, now = Date.now()): void {
        if (!result.completed) {
            return;
        }

        const replay = this.ensureReplay(now);
        replay.actions.push({
            sequence: replay.actions.length + 1,
            clientTimeMs: now,
            action: cloneReplayData(action),
            events: cloneReplayData(result.events),
            // captureSceneState() already returns a detached deep copy (getAllProperties()
            // structuredClone's each unit), so an outer clone here just deep-cloned the board twice.
            stateAfter: this.captureSceneState(),
        });
        replay.updatedAtMs = now;
        this.scheduleCompaction();
        this.schedulePersist();
    }
    public getCurrentReplay(): SandboxReplay | undefined {
        if (!this.replay) return undefined;
        // Export each checkpoint independently: callers may edit one without changing another that
        // shared its immutable branches inside the recorder. JSON storage already expands them this way.
        return {
            ...this.replay,
            initialState: cloneReplayData(this.replay.initialState),
            actions: this.replay.actions.map((record) => cloneReplayData(record)),
        };
    }
    public hasActions(): boolean {
        return !!this.replay?.actions.length;
    }
    public reset(): void {
        this.cancelCompaction?.();
        this.cancelCompaction = undefined;
        this.compactedThrough = -1;
        this.compaction = undefined;
        // Persist any debounced write before discarding the finished replay.
        this.flush();
        this.replay = undefined;
    }
    public dispose(): void {
        try {
            this.reset();
        } catch {
            // A storage failure must not retain the retired scene or prevent leaving the battle.
            this.replay = undefined;
        }
    }
    private scheduleCompaction(): void {
        if (this.cancelCompaction) return;
        const replay = this.replay;
        this.cancelCompaction = this.scheduleIdleWork((hasTime) => {
            if (!replay || replay !== this.replay) return;
            this.cancelCompaction = undefined;
            // Capture stays on the action path; sharing runs only in short background slices.
            while (hasTime() && this.compactedThrough < replay.actions.length) {
                if (!this.compaction) {
                    const previous =
                        this.compactedThrough < 0
                            ? undefined
                            : this.compactedThrough > 0
                              ? replay.actions[this.compactedThrough - 1].stateAfter
                              : replay.initialState;
                    this.compaction = {
                        state:
                            this.compactedThrough < 0
                                ? replay.initialState
                                : replay.actions[this.compactedThrough].stateAfter,
                        previous,
                        units: new Map(previous?.units.map((unit) => [unit.properties.id, unit])),
                        unitIndex: 0,
                    };
                }
                const pending = this.compaction;
                if (pending.unitIndex < pending.state.units.length) {
                    const unit = pending.state.units[pending.unitIndex];
                    pending.state.units[pending.unitIndex++] = shareReplaySnapshot(
                        unit,
                        pending.units.get(unit.properties.id),
                    );
                    continue;
                }
                const shared = shareReplaySnapshot(pending.state, pending.previous);
                if (this.compactedThrough < 0) {
                    replay.initialState = shared;
                } else {
                    replay.actions[this.compactedThrough].stateAfter = shared;
                }
                this.compaction = undefined;
                this.compactedThrough++;
            }
            if (this.compactedThrough < replay.actions.length) this.scheduleCompaction();
        });
    }
    /** Persist the current replay to storage now, cancelling any pending debounced write. */
    public flush(): void {
        if (this.persistHandle !== undefined) {
            clearTimeout(this.persistHandle);
            this.persistHandle = undefined;
        }
        if (this.replay) {
            saveSandboxReplay(this.replay, this.storage);
        }
    }
    private schedulePersist(): void {
        if (this.persistHandle !== undefined) {
            return; // a trailing flush is already queued; it will pick up the latest state
        }
        if (typeof setTimeout !== "function") {
            this.flush();
            return;
        }
        this.persistHandle = setTimeout(() => {
            this.persistHandle = undefined;
            if (this.replay) {
                saveSandboxReplay(this.replay, this.storage);
            }
        }, SandboxReplayRecorder.PERSIST_DEBOUNCE_MS);
    }
    private ensureReplay(now: number): SandboxReplay {
        if (!this.replay) {
            this.replay = {
                version: SANDBOX_REPLAY_VERSION,
                kind: "sandbox",
                id: createSandboxReplayId(),
                createdAtMs: now,
                updatedAtMs: now,
                // captureSceneState() is already a detached snapshot — see recordAction.
                initialState: this.captureSceneState(),
                actions: [],
            };
        }
        return this.replay;
    }
}
