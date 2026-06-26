import type { GameAction, GameEvent, IGameActionResult } from "@heroesofcrypto/common";

import type { SandboxSceneState } from "../scenes/Sandbox";

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
        return normalizeReplays(JSON.parse(raw)).map(cloneReplayData);
    } catch {
        return [];
    }
};

export const loadSandboxReplay = (id: string, storage = getBrowserStorage()): SandboxReplay | undefined =>
    listSandboxReplays(storage).find((replay) => replay.id === id);

export const saveSandboxReplay = (replay: SandboxReplay, storage = getBrowserStorage()): void => {
    if (!storage) {
        return;
    }

    // No defensive clone: the replay is JSON.stringify'd synchronously below, so the stored snapshot
    // is detached regardless. Cloning the whole (growing) replay here was pure per-save overhead.
    const replays = listSandboxReplays(storage).filter((existing) => existing.id !== replay.id);
    replays.unshift(replay);
    storage.setItem(
        SANDBOX_REPLAY_STORAGE_KEY,
        JSON.stringify(replays.sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, MAX_SAVED_SANDBOX_REPLAYS)),
    );
};

export const deleteSandboxReplay = (id: string, storage = getBrowserStorage()): void => {
    if (!storage) {
        return;
    }

    const replays = listSandboxReplays(storage).filter((replay) => replay.id !== id);
    storage.setItem(SANDBOX_REPLAY_STORAGE_KEY, JSON.stringify(replays));
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
    private static readonly PERSIST_DEBOUNCE_MS = 750;
    public constructor(
        private readonly captureSceneState: () => SandboxSceneState,
        private readonly storage = getBrowserStorage(),
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
        this.schedulePersist();
    }
    public getCurrentReplay(): SandboxReplay | undefined {
        return this.replay ? cloneReplayData(this.replay) : undefined;
    }
    public reset(): void {
        // Persist any debounced write before discarding the finished replay.
        this.flush();
        this.replay = undefined;
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
