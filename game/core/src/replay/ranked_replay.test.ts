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
    collectRankedReplaySnapshots,
    createRankedReplayFromJournal,
    createRankedReplayFromPayload,
    createRankedReplayFromSnapshot,
    createSandboxReplayFromRankedReplay,
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

const createProtocolEntry = (sequence: number): PlayJournalEntry => ({
    ...createEntry(sequence),
    actionType: PlayActionType.MELEE_ATTACK,
    actionJson: JSON.stringify({
        actionId: `action-${sequence}`,
        gameId: "game-1",
        playerId: "player-1",
        expectedSequence: sequence - 1,
        type: PlayActionType.MELEE_ATTACK,
        unitId: "attacker-1",
        targetUnitId: "target-1",
        attackFrom: { x: 2, y: 3 },
        path: [{ x: 2, y: 2 }],
    }),
    eventsJson: JSON.stringify([
        {
            type: "unit_attacked",
            attackType: "melee",
            attackerId: "attacker-1",
            targetId: "target-1",
            unitIdsDied: [],
            damage: { render: true, amount: 12, unitPosition: { x: 3, y: 3 }, unitIsSmall: true },
            animations: [],
        },
    ]),
});

const createReadyStartEntry = (sequence: number): PlayJournalEntry => ({
    ...createEntry(sequence),
    actionType: PlayActionType.READY_PLACEMENT,
    actionJson: JSON.stringify({
        actionId: `ready-${sequence}`,
        gameId: "game-1",
        playerId: "player-1",
        expectedSequence: sequence - 1,
        type: PlayActionType.READY_PLACEMENT,
    }),
    eventsJson: JSON.stringify([
        { type: "fight_started", lowerUnitsAlive: 1, upperUnitsAlive: 1 },
        { type: "next_unit_selected", unitId: "attacker-1", team: TeamVals.LOWER },
    ]),
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
    currentTurnStartMs: 0,
    currentTurnEndMs: 0,
    units: [],
    players: [],
    readyPlayerIds: [],
    journalTail,
    upNext: [],
    maxLowerUnits: 0,
    maxUpperUnits: 0,
    narrowingLayers: 0,
    centerDried: false,
    damageStats: [],
});

describe("ranked replay helpers", () => {
    it("parses a ranked journal entry into replay action data", () => {
        const record = parseRankedReplayAction(createEntry(1));

        expect(record?.sequence).toBe(1);
        expect(record?.action).toEqual({ type: "wait_turn", unitId: "u1" });
        expect(record?.events).toEqual([{ type: "unit_waited", unitId: "u1", team: TeamVals.LOWER }]);
    });

    it("parses protocol-shaped journal action data into common replay action data", () => {
        const record = parseRankedReplayAction(createProtocolEntry(2));

        expect(record?.action).toEqual({
            type: "melee_attack",
            attackerId: "attacker-1",
            targetId: "target-1",
            attackFrom: { x: 2, y: 3 },
            path: [{ x: 2, y: 2 }],
            hasLavaCell: undefined,
            hasWaterCell: undefined,
        });
    });

    it("turns a ready-placement journal row that starts the fight into a replay checkpoint", () => {
        const record = parseRankedReplayAction(createReadyStartEntry(2));

        expect(record?.action).toEqual({ type: "start_fight" });
        expect(record?.events.map((event) => event.type)).toEqual(["fight_started", "next_unit_selected"]);
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

    it("collects ranked replay snapshots by sequence", () => {
        const initialSnapshot = createSnapshot([], 1);
        const currentSnapshot = createSnapshot([], 3);
        const replay = createRankedReplayFromPayload({
            gameId: "game-1",
            latestSequence: 3,
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

        expect(collectRankedReplaySnapshots(replay).map((snapshot) => snapshot.latestSequence)).toEqual([1, 3]);
    });

    it("converts a ranked replay into a sandbox replay with animated action records", () => {
        const initialSnapshot = createSnapshot([], 1);
        const fightStartedSnapshot = createSnapshot([], 2);
        const afterAttackSnapshot = createSnapshot([], 3);
        const replay = createRankedReplayFromPayload({
            gameId: "game-1",
            latestSequence: 3,
            completeReplay: true,
            currentSnapshot: afterAttackSnapshot,
            journal: [createReadyStartEntry(2), createProtocolEntry(3)],
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
                {
                    sequence: 2,
                    kind: PlayEventKind.ACTION_ACCEPTED,
                    gameId: "game-1",
                    playerId: "player-1",
                    snapshot: fightStartedSnapshot,
                    journalEntry: createReadyStartEntry(2),
                    rejectionReason: "",
                    message: "ready_placement",
                    serverTimeMs: 1050,
                },
                {
                    sequence: 3,
                    kind: PlayEventKind.ACTION_ACCEPTED,
                    gameId: "game-1",
                    playerId: "player-1",
                    snapshot: afterAttackSnapshot,
                    journalEntry: createProtocolEntry(3),
                    rejectionReason: "",
                    message: "melee_attack",
                    serverTimeMs: 1100,
                },
            ],
        });
        const sandboxReplay = createSandboxReplayFromRankedReplay(replay, {
            nowMs: 5000,
            snapshotToState: (snapshot) => ({
                gridType: snapshot.gridType,
                currentLap: snapshot.currentLap,
                fightStarted: snapshot.fightStarted,
                fightFinished: snapshot.fightFinished,
                currentUnitId: snapshot.currentUnitId || undefined,
                units: [],
            }),
        });

        expect(sandboxReplay?.kind).toBe("sandbox");
        expect(sandboxReplay?.initialState.currentLap).toBe(1);
        expect(sandboxReplay?.actions).toHaveLength(2);
        expect(sandboxReplay?.actions[0]?.sequence).toBe(2);
        expect(sandboxReplay?.actions[0]?.action.type).toBe("start_fight");
        expect(sandboxReplay?.actions[1]?.sequence).toBe(3);
        expect(sandboxReplay?.actions[1]?.action.type).toBe("melee_attack");
        expect(sandboxReplay?.actions[1]?.events[0]?.type).toBe("unit_attacked");
    });

    it("does not build a sandbox replay when a post-action snapshot is missing", () => {
        const replay = createRankedReplayFromJournal({
            gameId: "game-1",
            entries: [createProtocolEntry(2)],
            completeJournal: true,
            initialSnapshot: createSnapshot([], 1),
        });

        expect(
            createSandboxReplayFromRankedReplay(replay, {
                snapshotToState: (snapshot) => ({
                    gridType: snapshot.gridType,
                    currentLap: snapshot.currentLap,
                    fightStarted: snapshot.fightStarted,
                    fightFinished: snapshot.fightFinished,
                    currentUnitId: snapshot.currentUnitId || undefined,
                    units: [],
                }),
            }),
        ).toBeUndefined();
    });
});
