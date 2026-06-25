import type { GameAction, GameEvent } from "@heroesofcrypto/common";

import { createGameActionFromPlayAction } from "../api/game_action_play_codec";
import {
    PlayActionType,
    type PlayAction,
    type PlayEvent,
    type PlayJournalEntry,
    type PlaySnapshot,
} from "../api/play_protocol";
import type { SandboxSceneState } from "../scenes/Sandbox";
import { SANDBOX_REPLAY_VERSION, type SandboxReplay } from "./sandbox_replay";

export const RANKED_REPLAY_VERSION = 1;

const cloneReplayData = <T>(value: T): T => {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
};

export interface RankedReplayActionRecord {
    sequence: number;
    actionId: string;
    playerId: string;
    team: number;
    action: GameAction;
    events: GameEvent[];
    acceptedAtMs: number;
    journalEntry: PlayJournalEntry;
}

export interface RankedReplay {
    version: typeof RANKED_REPLAY_VERSION;
    kind: "ranked";
    gameId: string;
    latestSequence: number;
    completeJournal: boolean;
    initialSnapshot?: PlaySnapshot;
    currentSnapshot?: PlaySnapshot;
    events: PlayEvent[];
    actions: RankedReplayActionRecord[];
}

export interface RankedReplayPayload {
    gameId: string;
    latestSequence: number;
    completeReplay: boolean;
    currentSnapshot: PlaySnapshot;
    events: PlayEvent[];
    journal: PlayJournalEntry[];
}

const parseJson = <T>(raw: string): T | undefined => {
    if (!raw.trim()) {
        return undefined;
    }

    try {
        return JSON.parse(raw) as T;
    } catch {
        return undefined;
    }
};

const isCommonGameAction = (value: unknown): value is GameAction =>
    !!value &&
    typeof value === "object" &&
    typeof (value as { type?: unknown }).type === "string";

const parseRankedJournalGameAction = (entry: PlayJournalEntry): GameAction | undefined => {
    const parsed = parseJson<unknown>(entry.actionJson);
    if (!parsed || typeof parsed !== "object") {
        return undefined;
    }
    if (isCommonGameAction(parsed)) {
        return parsed;
    }
    return createGameActionFromPlayAction(parsed as Partial<PlayAction>);
};

export const parseRankedReplayAction = (entry: PlayJournalEntry): RankedReplayActionRecord | undefined => {
    const parsedEvents = parseJson<GameEvent[]>(entry.eventsJson);
    const events = Array.isArray(parsedEvents) ? parsedEvents : [];
    const action =
        parseRankedJournalGameAction(entry) ??
        (entry.actionType === PlayActionType.READY_PLACEMENT && events.some((event) => event.type === "fight_started")
            ? ({ type: "start_fight" } satisfies GameAction)
            : undefined);
    if (!action) {
        return undefined;
    }

    return {
        sequence: entry.sequence,
        actionId: entry.actionId,
        playerId: entry.playerId,
        team: entry.team,
        action,
        events,
        acceptedAtMs: entry.acceptedAtMs,
        journalEntry: cloneReplayData(entry),
    };
};

export const mergeRankedJournalEntries = (
    existing: PlayJournalEntry[],
    incoming: PlayJournalEntry[],
): PlayJournalEntry[] => {
    const bySequence = new Map<number, PlayJournalEntry>();
    for (const entry of existing) {
        bySequence.set(entry.sequence, entry);
    }
    for (const entry of incoming) {
        bySequence.set(entry.sequence, entry);
    }
    return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
};

export const createRankedReplayFromJournal = ({
    completeJournal,
    entries,
    events = [],
    gameId,
    initialSnapshot,
    currentSnapshot,
}: {
    gameId: string;
    entries: PlayJournalEntry[];
    completeJournal: boolean;
    initialSnapshot?: PlaySnapshot;
    currentSnapshot?: PlaySnapshot;
    events?: PlayEvent[];
}): RankedReplay => {
    const sortedEntries = [...entries].sort((a, b) => a.sequence - b.sequence);
    const sortedEvents = [...events].sort((a, b) => a.sequence - b.sequence);
    return {
        version: RANKED_REPLAY_VERSION,
        kind: "ranked",
        gameId,
        latestSequence:
            currentSnapshot?.latestSequence ??
            sortedEvents.at(-1)?.sequence ??
            sortedEntries.at(-1)?.sequence ??
            initialSnapshot?.latestSequence ??
            0,
        completeJournal,
        initialSnapshot,
        currentSnapshot,
        events: sortedEvents,
        actions: sortedEntries.flatMap((entry) => {
            const record = parseRankedReplayAction(entry);
            return record ? [record] : [];
        }),
    };
};

export const createRankedReplayFromSnapshot = (
    snapshot: PlaySnapshot,
    opts: { completeJournal?: boolean } = {},
): RankedReplay =>
    createRankedReplayFromJournal({
        gameId: snapshot.gameId,
        entries: snapshot.journalTail,
        completeJournal: opts.completeJournal ?? false,
        initialSnapshot: snapshot,
        currentSnapshot: snapshot,
        events: [],
    });

export const createRankedReplayFromPayload = (payload: RankedReplayPayload): RankedReplay => {
    const initialSnapshot =
        payload.events.filter((event) => event.snapshot).sort((a, b) => a.sequence - b.sequence)[0]?.snapshot ??
        payload.currentSnapshot;
    return createRankedReplayFromJournal({
        gameId: payload.gameId,
        entries: payload.journal,
        completeJournal: payload.completeReplay,
        initialSnapshot,
        currentSnapshot: payload.currentSnapshot,
        events: payload.events,
    });
};

export const collectRankedReplaySnapshots = (replay: RankedReplay): PlaySnapshot[] => {
    const bySequence = new Map<number, PlaySnapshot>();
    const addSnapshot = (snapshot?: PlaySnapshot): void => {
        if (snapshot) {
            bySequence.set(snapshot.latestSequence, cloneReplayData(snapshot));
        }
    };

    addSnapshot(replay.initialSnapshot);
    for (const event of replay.events) {
        addSnapshot(event.snapshot);
    }
    addSnapshot(replay.currentSnapshot);

    return [...bySequence.values()].sort((a, b) => a.latestSequence - b.latestSequence);
};

export const createSandboxReplayFromRankedReplay = (
    replay: RankedReplay,
    options: {
        snapshotToState: (snapshot: PlaySnapshot) => SandboxSceneState | undefined;
        nowMs?: number;
    },
): SandboxReplay | undefined => {
    if (!replay.actions.length) {
        return undefined;
    }

    const snapshots = collectRankedReplaySnapshots(replay);
    if (!snapshots.length) {
        return undefined;
    }

    const snapshotBySequence = new Map(snapshots.map((snapshot) => [snapshot.latestSequence, snapshot]));
    const firstActionSequence = replay.actions[0]?.sequence ?? Number.MAX_SAFE_INTEGER;
    const initialSnapshot =
        snapshots.filter((snapshot) => snapshot.latestSequence < firstActionSequence).at(-1) ?? snapshots[0];
    const initialState = options.snapshotToState(initialSnapshot);
    if (!initialState) {
        return undefined;
    }

    const nowMs = options.nowMs ?? Date.now();
    const actions: SandboxReplay["actions"] = [];
    for (const actionRecord of replay.actions) {
        if (actionRecord.sequence <= initialSnapshot.latestSequence) {
            continue;
        }

        const stateAfterSnapshot = snapshotBySequence.get(actionRecord.sequence);
        if (!stateAfterSnapshot) {
            return undefined;
        }

        const stateAfter = options.snapshotToState(stateAfterSnapshot);
        if (!stateAfter) {
            return undefined;
        }

        actions.push({
            sequence: actionRecord.sequence,
            clientTimeMs: actionRecord.acceptedAtMs || nowMs + actions.length,
            action: cloneReplayData(actionRecord.action),
            events: cloneReplayData(actionRecord.events),
            stateAfter: cloneReplayData(stateAfter),
        });
    }

    if (!actions.length) {
        return undefined;
    }

    return {
        version: SANDBOX_REPLAY_VERSION,
        kind: "sandbox",
        id: `ranked:${replay.gameId}`,
        createdAtMs: actions[0]?.clientTimeMs ?? nowMs,
        updatedAtMs: actions.at(-1)?.clientTimeMs ?? nowMs,
        initialState: cloneReplayData(initialState),
        actions,
    };
};
