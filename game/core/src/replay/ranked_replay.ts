import type { GameAction, GameEvent } from "@heroesofcrypto/common";

import type { PlayEvent, PlayJournalEntry, PlaySnapshot } from "../api/play_protocol";

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

export const parseRankedReplayAction = (entry: PlayJournalEntry): RankedReplayActionRecord | undefined => {
    const action = parseJson<GameAction>(entry.actionJson);
    if (!action) {
        return undefined;
    }

    const parsedEvents = parseJson<GameEvent[]>(entry.eventsJson);
    return {
        sequence: entry.sequence,
        actionId: entry.actionId,
        playerId: entry.playerId,
        team: entry.team,
        action,
        events: Array.isArray(parsedEvents) ? parsedEvents : [],
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
