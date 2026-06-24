import { describe, expect, it } from "bun:test";

import { TeamVals } from "@heroesofcrypto/common";

import {
    PlayActionType,
    PlayEventKind,
    PlayPhase,
    type PlayJournalEntry,
    type PlaySnapshot,
} from "../api/play_protocol";
import {
    createRankedReplayFromJournal,
    createRankedReplayFromPayload,
    createRankedReplayFromSnapshot,
    mergeRankedJournalEntries,
    parseRankedReplayAction,
} from "./ranked_replay";

const createEntry = (sequence: number): PlayJournalEntry => ({
    sequence,
    actionId: `action-${sequence}`,
    playerId: "player-1",
    team: TeamVals.LOWER,
    actionType: PlayActionType.WAIT_TURN,
    actionJson: JSON.stringify({ type: "wait_turn", unitId: "u1" }),
    eventsJson: JSON.stringify([{ type: "unit_waited", unitId: "u1", team: TeamVals.LOWER }]),
    acceptedAtMs: 1000 + sequence,
});

const createSnapshot = (journalTail: PlayJournalEntry[], latestSequence: number): PlaySnapshot => ({
    gameId: "game-1",
    phase: PlayPhase.PLAY,
    gridType: 1,
    currentLap: 1,
    fightStarted: true,
    fightFinished: false,
    currentUnitId: "u1",
    currentTurnTeam: TeamVals.LOWER,
    latestSequence,
    serverTimeMs: 2000,
    placementDeadlineMs: 0,
    units: [],
    players: [],
    readyPlayerIds: [],
    journalTail,
});

describe("ranked replay helpers", () => {
    it("parses a ranked journal entry into replay action data", () => {
        const record = parseRankedReplayAction(createEntry(1));

        expect(record?.sequence).toBe(1);
        expect(record?.action).toEqual({ type: "wait_turn", unitId: "u1" });
        expect(record?.events).toEqual([{ type: "unit_waited", unitId: "u1", team: TeamVals.LOWER }]);
    });

    it("merges journal entries by sequence", () => {
        const merged = mergeRankedJournalEntries([createEntry(2), createEntry(1)], [createEntry(2), createEntry(3)]);

        expect(merged.map((entry) => entry.sequence)).toEqual([1, 2, 3]);
    });

    it("marks snapshot replay as partial when it only has a journal tail", () => {
        const replay = createRankedReplayFromSnapshot(createSnapshot([createEntry(9), createEntry(10)], 10));

        expect(replay.completeJournal).toBe(false);
        expect(replay.actions.map((action) => action.sequence)).toEqual([9, 10]);
    });

    it("can mark a full-journal snapshot as complete from the response metadata", () => {
        const replay = createRankedReplayFromSnapshot(createSnapshot([createEntry(2), createEntry(3)], 3), {
            completeJournal: true,
        });

        expect(replay.completeJournal).toBe(true);
        expect(replay.actions.map((action) => action.sequence)).toEqual([2, 3]);
    });

    it("builds a complete replay from a server-provided full journal", () => {
        const replay = createRankedReplayFromJournal({
            gameId: "game-1",
            entries: [createEntry(2), createEntry(1)],
            completeJournal: true,
        });

        expect(replay.completeJournal).toBe(true);
        expect(replay.latestSequence).toBe(2);
        expect(replay.actions.map((action) => action.sequence)).toEqual([1, 2]);
    });

    it("builds replay state from the server replay payload", () => {
        const currentSnapshot = createSnapshot([createEntry(2)], 4);
        const initialSnapshot = createSnapshot([], 1);
        const replay = createRankedReplayFromPayload({
            gameId: "game-1",
            latestSequence: 4,
            completeReplay: true,
            currentSnapshot,
            journal: [createEntry(2)],
            events: [
                {
                    sequence: 1,
                    kind: PlayEventKind.SNAPSHOT,
                    gameId: "game-1",
                    playerId: "",
                    snapshot: initialSnapshot,
                    rejectionReason: "",
                    message: "snapshot",
                    serverTimeMs: 1000,
                },
            ],
        });

        expect(replay.completeJournal).toBe(true);
        expect(replay.latestSequence).toBe(4);
        expect(replay.initialSnapshot).toBe(initialSnapshot);
        expect(replay.currentSnapshot).toBe(currentSnapshot);
        expect(replay.events).toHaveLength(1);
    });
});
