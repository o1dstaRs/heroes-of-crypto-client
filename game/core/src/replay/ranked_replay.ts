import type { GameAction, GameEvent } from "@heroesofcrypto/common";

import { createGameActionFromPlayAction } from "../api/game_action_play_codec";
import {
    PlayActionType,
    type PlayAction,
    type PlayCell,
    type PlayEvent,
    type PlayJournalEntry,
    type PlaySnapshot,
} from "../api/play_protocol";
import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import type { SandboxSceneState } from "../scenes/Sandbox";
import { SANDBOX_REPLAY_VERSION, type SandboxReplay } from "./sandbox_replay";
import { shareReplaySnapshot } from "./shareReplaySnapshot";

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
    /**
     * The whole journal. Stored replays strip `journalTail` off every snapshot (the tail is a live-view
     * window, and duplicating it into each snapshot blows the record up), so this list is what a replay
     * has to put back before the battle log can read a snapshot.
     */
    journal: PlayJournalEntry[];
    actions: RankedReplayActionRecord[];
}

/** JSON replays carry the server's 1-based fields; live protobuf snapshots are already decoded. */
export interface RankedReplaySnapshotPayload extends Omit<PlaySnapshot, "artifactBarrels"> {
    centerObstacleHitsLeftPlus1?: number;
    centerObstacleHitsRightPlus1?: number;
    scatteredStandingCellsPlus1?: number[];
    scatteredStandingCountPlus1?: number;
    transientCellsCountPlus1?: number;
    additionalTimeMsPlus1?: number;
    artifactBarrelsCountPlus1?: number;
    /** Raw wire barrels: the index arrives as indexPlus1, exactly like every count field. */
    artifactBarrels?: Array<{ team: number; cell: PlayCell; index?: number; indexPlus1?: number }>;
}

export interface RankedReplayPayload {
    gameId: string;
    latestSequence: number;
    completeReplay: boolean;
    currentSnapshot: RankedReplaySnapshotPayload;
    events: (Omit<PlayEvent, "snapshot"> & { snapshot?: RankedReplaySnapshotPayload })[];
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
    !!value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string";

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
    const hasFightStarted = events.some((event) => event.type === "fight_started");
    // Split Setup now uses START_FIGHT as its augment-lock command, with no fight_started event. Replay
    // parsing must therefore treat BOTH placement completion opcodes as event-authoritative checkpoints:
    // only the journal row that actually started combat becomes common's start_fight action.
    const isPlacementCompletion =
        entry.actionType === PlayActionType.START_FIGHT || entry.actionType === PlayActionType.READY_PLACEMENT;
    const action = isPlacementCompletion
        ? hasFightStarted
            ? ({ type: "start_fight" } satisfies GameAction)
            : undefined
        : parseRankedJournalGameAction(entry);
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
        journal: sortedEntries,
        actions: sortedEntries.flatMap((entry) => {
            const record = parseRankedReplayAction(entry);
            return record ? [record] : [];
        }),
    };
};

/**
 * Fill empty snapshot tails from the replay journal.
 *
 * The first empty snapshot gets every entry up to its sequence: playback clears the log after the opening
 * board, so the first presented snapshot has to carry the history or those lines never come back. Each
 * later snapshot gets only the entries since the previous one — appending, not copying the whole journal
 * onto every record.
 */
export const withReplayJournalTails = (
    snapshots: readonly PlaySnapshot[],
    journal: readonly PlayJournalEntry[],
): PlaySnapshot[] => {
    const sorted = journal.length > 1 ? [...journal].sort((left, right) => left.sequence - right.sequence) : journal;
    let coveredThrough = -1;
    let seeded = false;
    return snapshots.map((snapshot) => {
        const end = snapshot.latestSequence;
        if (snapshot.journalTail.length > 0 || sorted.length === 0) {
            seeded = true;
            coveredThrough = Math.max(coveredThrough, end);
            return snapshot;
        }
        const from = seeded ? coveredThrough : -1;
        seeded = true;
        coveredThrough = Math.max(coveredThrough, end);
        const journalTail = sorted.filter((entry) => entry.sequence > from && entry.sequence <= end);
        return journalTail.length > 0 ? { ...snapshot, journalTail } : snapshot;
    });
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

const decodeReplaySnapshot = (snapshot: RankedReplaySnapshotPayload): PlaySnapshot => {
    let decoded: PlaySnapshot | undefined;
    // Raw wire barrels arrive with indexPlus1; every other consumer of a decoded snapshot reads `index`.
    // Undecoded, a replayed barrel reports index undefined: the Cemetery scattered-mountain art then
    // derives variant NaN (NaN is not nullish, so the ?? fallback in getArtifactBarrelVariant does not
    // fire), the NaN spreads into the tile index, and rebuildScatteredMountainSprites dies reading
    // tiles[NaN] — which killed the whole replay onto the final screen right after the first turn
    // (production game 75c5eb2e).
    const needsBarrelDecode =
        Array.isArray(snapshot.artifactBarrels) &&
        snapshot.artifactBarrels.some((barrel) => barrel?.indexPlus1 !== undefined);
    const barrelsDecoded = needsBarrelDecode
        ? (snapshot.artifactBarrels!.map((barrel) =>
              barrel && barrel.index === undefined && barrel.indexPlus1 !== undefined
                  ? { ...barrel, index: Math.max(0, barrel.indexPlus1 - 1) }
                  : barrel,
          ) as PlaySnapshot["artifactBarrels"])
        : undefined;
    const base = (): PlaySnapshot =>
        ({ ...snapshot, artifactBarrels: barrelsDecoded ?? snapshot.artifactBarrels }) as PlaySnapshot;
    for (const [encodedKey, decodedKey] of [
        ["centerObstacleHitsLeftPlus1", "centerObstacleHitsLeft"],
        ["centerObstacleHitsRightPlus1", "centerObstacleHitsRight"],
        ["scatteredStandingCountPlus1", "scatteredStandingCount"],
        ["transientCellsCountPlus1", "transientCellsCount"],
        ["additionalTimeMsPlus1", "additionalTimeMs"],
        ["artifactBarrelsCountPlus1", "artifactBarrelsCount"],
    ] as const) {
        if (snapshot[decodedKey] === undefined && snapshot[encodedKey] !== undefined) {
            decoded ??= base();
            decoded[decodedKey] = Math.max(0, snapshot[encodedKey] - 1);
        }
    }
    if (snapshot.scatteredStandingCells === undefined && snapshot.scatteredStandingCellsPlus1 !== undefined) {
        decoded ??= base();
        decoded.scatteredStandingCells = snapshot.scatteredStandingCellsPlus1.map((cell) => Math.max(0, cell - 1));
    }
    if (decoded?.scatteredStandingCount !== undefined) {
        decoded.scatteredStandingCells ??= [];
    }
    if (decoded?.artifactBarrelsCount !== undefined) {
        decoded.artifactBarrels ??= [];
    }
    // An already-decoded snapshot with no wire barrels is returned UNCHANGED — replays round-trip
    // through this decoder again, and identity keeps that path free of copies.
    if (decoded) {
        if (needsBarrelDecode) decoded.artifactBarrels = barrelsDecoded!;
        return decoded;
    }
    return needsBarrelDecode ? base() : (snapshot as PlaySnapshot);
};

export const createRankedReplayFromPayload = (payload: RankedReplayPayload): RankedReplay => {
    // The replay endpoint serializes server snapshots directly as JSON. Unlike live snapshots, these
    // never passed through decodePlaySnapshot, so restore the same true counts and packed cells here.
    const currentSnapshot = decodeReplaySnapshot(payload.currentSnapshot);
    const events = payload.events.map((event): PlayEvent =>
        event.snapshot
            ? ({ ...event, snapshot: decodeReplaySnapshot(event.snapshot) } as PlayEvent)
            : (event as PlayEvent),
    );
    const initialSnapshot =
        events.filter((event) => event.snapshot).sort((a, b) => a.sequence - b.sequence)[0]?.snapshot ??
        currentSnapshot;
    return createRankedReplayFromJournal({
        gameId: payload.gameId,
        entries: payload.journal,
        completeJournal: payload.completeReplay,
        initialSnapshot,
        currentSnapshot,
        events,
    });
};

const rankedReplaySnapshotReferences = (replay: RankedReplay): PlaySnapshot[] => {
    const bySequence = new Map<number, PlaySnapshot>();
    const addSnapshot = (snapshot?: PlaySnapshot): void => {
        if (snapshot) {
            bySequence.set(snapshot.latestSequence, snapshot);
        }
    };

    addSnapshot(replay.initialSnapshot);
    for (const event of replay.events) {
        addSnapshot(event.snapshot);
    }
    addSnapshot(replay.currentSnapshot);

    return [...bySequence.values()].sort((a, b) => a.latestSequence - b.latestSequence);
};

export const collectRankedReplaySnapshots = (replay: RankedReplay): PlaySnapshot[] =>
    rankedReplaySnapshotReferences(replay).map(cloneReplayData);

/** Select the opening checkpoint without copying the rest of the battle just to read [0]. */
export const getRankedReplayInitialSnapshot = (replay: RankedReplay): PlaySnapshot | undefined => {
    let initial: PlaySnapshot | undefined;
    const consider = (snapshot?: PlaySnapshot) => {
        if (snapshot && (!initial || snapshot.latestSequence <= initial.latestSequence)) initial = snapshot;
    };
    consider(replay.initialSnapshot);
    for (const event of replay.events) consider(event.snapshot);
    consider(replay.currentSnapshot);
    return initial ? cloneReplayData(initial) : undefined;
};

export const createSandboxReplayFromRankedReplay = (
    replay: RankedReplay,
    options: {
        snapshotToState: (snapshot: PlaySnapshot) => SandboxSceneState | undefined;
        /**
         * The same snapshot, unnarrowed. A replayed record carries it so the ranked scene can run its
         * presentation steps (log, stats, clock, journal VFX) per action — none of which can be expressed
         * as a scene state. Optional: without it a replay simply plays the board, as it always did.
         */
        snapshotToAuthoritative?: (snapshot: PlaySnapshot) => AuthoritativeGameSnapshot | undefined;
        /** Transfer detached converter results to the renderer as shared, frozen checkpoints. */
        shareSnapshots?: boolean;
        nowMs?: number;
    },
): SandboxReplay | undefined => {
    if (!replay.actions.length) {
        return undefined;
    }

    const snapshots = rankedReplaySnapshotReferences(replay);
    if (!snapshots.length) {
        return undefined;
    }

    const snapshotBySequence = new Map(snapshots.map((snapshot) => [snapshot.latestSequence, snapshot]));
    const firstActionSequence = replay.actions[0]?.sequence ?? Number.MAX_SAFE_INTEGER;
    const initialSnapshot =
        snapshots.filter((snapshot) => snapshot.latestSequence < firstActionSequence).at(-1) ?? snapshots[0];
    const initialState = options.snapshotToState(cloneReplayData(initialSnapshot));
    if (!initialState) {
        return undefined;
    }

    const nowMs = options.nowMs ?? Date.now();
    const pending: {
        action: RankedReplayActionRecord;
        snapshot: PlaySnapshot;
    }[] = [];
    for (const actionRecord of replay.actions) {
        if (actionRecord.sequence <= initialSnapshot.latestSequence) {
            continue;
        }

        const stateAfterSnapshot = snapshotBySequence.get(actionRecord.sequence);
        if (!stateAfterSnapshot) {
            return undefined;
        }

        pending.push({ action: actionRecord, snapshot: stateAfterSnapshot });
    }

    const stamped = withReplayJournalTails(
        pending.map((item) => item.snapshot),
        replay.journal,
    );
    const actions: SandboxReplay["actions"] = [];
    let previousState = cloneReplayData(initialState);
    if (options.shareSnapshots) previousState = shareReplaySnapshot(previousState);
    const replayInitialState = previousState;
    let previousAuthoritative: AuthoritativeGameSnapshot | undefined;
    for (let index = 0; index < pending.length; index += 1) {
        const item = pending[index];
        const reference = stamped[index];
        if (!item || !reference) {
            continue;
        }
        // Converters historically receive detached snapshots and may mutate them. Keep that boundary,
        // but only one checkpoint's working copy needs to be live during preparation.
        const snapshot = cloneReplayData(item.snapshot);
        const convertedState = options.snapshotToState(snapshot);
        if (!convertedState) return undefined;
        const stateAfter = options.shareSnapshots ? convertedState : cloneReplayData(convertedState);
        if (reference !== item.snapshot) snapshot.journalTail = cloneReplayData(reference.journalTail);
        const authoritativeSnapshot = options.snapshotToAuthoritative?.(snapshot);
        const authoritative =
            authoritativeSnapshot && !options.shareSnapshots
                ? cloneReplayData(authoritativeSnapshot)
                : authoritativeSnapshot;
        previousState = options.shareSnapshots ? shareReplaySnapshot(stateAfter, previousState) : stateAfter;
        previousAuthoritative =
            options.shareSnapshots && authoritative
                ? shareReplaySnapshot(authoritative, previousAuthoritative)
                : authoritative;
        actions.push({
            sequence: item.action.sequence,
            clientTimeMs: item.action.acceptedAtMs || nowMs + actions.length,
            action: cloneReplayData(item.action.action),
            events: cloneReplayData(item.action.events),
            stateAfter: previousState,
            ...(previousAuthoritative ? { authoritativeSnapshot: previousAuthoritative } : {}),
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
        initialState: replayInitialState,
        actions,
    };
};
