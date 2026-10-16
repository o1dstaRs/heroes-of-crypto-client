import { describe, expect, test } from "bun:test";
import { GridConstants, GridVals, TeamVals } from "@heroesofcrypto/common";

import { toAuthoritativeGameSnapshot } from "../api/ranked_play_client";
import {
    PlayActionType,
    PlayEventKind,
    PlayPhase,
    PlayTransientCellKind,
    type PlaySnapshot,
} from "../api/play_protocol";
import { authoritativeSnapshotToSandboxSceneState } from "../scenes/RankedPlayScene";
import {
    collectRankedReplaySnapshots,
    createRankedReplayFromPayload,
    createSandboxReplayFromRankedReplay,
    type RankedReplayPayload,
    type RankedReplaySnapshotPayload,
} from "./ranked_replay";

const packed = (x: number, y: number): number => x * GridConstants.GRID_SIZE + y;
const snapshot = (
    latestSequence: number,
    fields: Partial<RankedReplaySnapshotPayload> = {},
): RankedReplaySnapshotPayload => ({
    gameId: "barrel-replay",
    phase: PlayPhase.PLAY,
    gridType: GridVals.BLOCK_CENTER,
    currentLap: 1,
    fightStarted: true,
    fightFinished: false,
    currentUnitId: "attacker",
    currentTurnTeam: TeamVals.LEFT,
    latestSequence,
    serverTimeMs: 2000,
    placementDeadlineMs: 0,
    placementStage: 1,
    placementSplit: false,
    hideOpponentRosterDuringSetup: false,
    currentTurnStartMs: 0,
    currentTurnEndMs: 0,
    units: [],
    players: [],
    readyPlayerIds: [],
    journalTail: [],
    upNext: [],
    maxLeftUnits: 0,
    maxRightUnits: 0,
    narrowingLayers: 0,
    centerDried: false,
    damageStats: [],
    ...fields,
});
const payload = (...snapshots: RankedReplaySnapshotPayload[]): RankedReplayPayload => ({
    gameId: "barrel-replay",
    latestSequence: snapshots.at(-1)!.latestSequence,
    completeReplay: true,
    currentSnapshot: snapshots.at(-1)!,
    events: snapshots.map((state) => ({
        sequence: state.latestSequence,
        kind: PlayEventKind.SNAPSHOT,
        gameId: state.gameId,
        playerId: "",
        snapshot: state,
        rejectionReason: "",
        message: "snapshot",
        serverTimeMs: state.serverTimeMs,
    })),
    journal: snapshots.slice(1).map((state) => ({
        sequence: state.latestSequence,
        actionId: `action-${state.latestSequence}`,
        playerId: "player",
        team: TeamVals.LEFT,
        actionType: PlayActionType.MELEE_ATTACK,
        actionJson: JSON.stringify({ type: "obstacle_attack", attackerId: "attacker", targetPosition: { x: 0, y: 0 } }),
        eventsJson: "[]",
        acceptedAtMs: state.serverTimeMs,
    })),
});
const sceneState = (state: PlaySnapshot | RankedReplaySnapshotPayload) =>
    authoritativeSnapshotToSandboxSceneState(toAuthoritativeGameSnapshot(state as PlaySnapshot, TeamVals.RIGHT));

describe("barrels from the server's JSON replay", () => {
    test("decodes the opening board and every later board without changing the downloaded data", () => {
        const downloaded = payload(
            snapshot(1, {
                scatteredStandingCellsPlus1: [1, packed(7, 6) + 1],
                scatteredStandingCountPlus1: 3,
            }),
            snapshot(2, {
                scatteredStandingCellsPlus1: [packed(7, 6) + 1],
                scatteredStandingCountPlus1: 2,
            }),
            snapshot(3, { scatteredStandingCountPlus1: 1 }),
        );
        const original = structuredClone(downloaded);
        const replay = createRankedReplayFromPayload(downloaded);
        const boards = collectRankedReplaySnapshots(replay);

        expect(boards.map((board) => board.scatteredStandingCells)).toEqual([[0, packed(7, 6)], [packed(7, 6)], []]);
        expect(boards.map((board) => board.scatteredStandingCount)).toEqual([2, 1, 0]);
        expect(replay.initialSnapshot?.scatteredStandingCount).toBe(2);
        expect(replay.currentSnapshot?.scatteredStandingCount).toBe(0);
        expect(downloaded).toEqual(original);
    });

    test("restores barrel positions through the real replay-to-scene conversion, including the (0,0) cell", () => {
        const replay = createRankedReplayFromPayload(
            payload(
                snapshot(1, {
                    scatteredStandingCellsPlus1: [1, packed(7, 6) + 1],
                    scatteredStandingCountPlus1: 3,
                }),
                snapshot(2, {
                    scatteredStandingCellsPlus1: [packed(7, 6) + 1],
                    scatteredStandingCountPlus1: 2,
                }),
                snapshot(3, { scatteredStandingCountPlus1: 1 }),
            ),
        );
        const playable = createSandboxReplayFromRankedReplay(replay, { snapshotToState: sceneState });

        expect(playable?.initialState.scatteredMountains).toEqual([
            { x: 0, y: 0, variant: expect.any(Number) },
            { x: 7, y: 6, variant: expect.any(Number) },
        ]);
        expect(playable?.actions[0]?.stateAfter.scatteredMountains).toEqual([
            { x: 7, y: 6, variant: expect.any(Number) },
        ]);
        expect(playable?.actions[1]?.stateAfter.scatteredMountains).toEqual([]);
    });

    test("restores player-deployed barrels on a normal map and their ownership", () => {
        const raw = snapshot(1, {
            gridType: GridVals.NORMAL,
            scatteredStandingCellsPlus1: [packed(8, 7) + 1],
            scatteredStandingCountPlus1: 2,
            artifactBarrelsCountPlus1: 2,
            artifactBarrels: [{ team: TeamVals.RIGHT, index: 0, cell: { x: 8, y: 7 } }],
        });
        const replay = createRankedReplayFromPayload(payload(raw));
        const state = sceneState(replay.currentSnapshot!);

        expect(replay.currentSnapshot?.artifactBarrelsCount).toBe(1);
        expect(state.scatteredMountains).toEqual([{ x: 8, y: 7, variant: expect.any(Number) }]);
        expect(state.artifactBarrels).toEqual([{ team: TeamVals.RIGHT, index: 0, cell: { x: 8, y: 7 } }]);
    });

    test("decodes each barrel's indexPlus1 — an undecoded index kills Cemetery replays after turn 1", () => {
        // The real replay endpoint ships barrels exactly like this (production game 75c5eb2e): the index
        // rides the same +1 wire encoding as every count. Undecoded, the barrel reports index undefined,
        // the scattered-mountain art derives variant NaN (NaN is not nullish, so the caller's fallback
        // never fires) and rebuildScatteredMountainSprites dies reading tiles[NaN] — which aborted the
        // whole replay onto the final screen right after the first turn.
        const raw = snapshot(1, {
            gridType: GridVals.BLOCK_CENTER,
            scatteredStandingCellsPlus1: [packed(3, 1) + 1, packed(3, 2) + 1],
            scatteredStandingCountPlus1: 3,
            artifactBarrelsCountPlus1: 3,
            artifactBarrels: [
                { team: TeamVals.RIGHT, indexPlus1: 2, cell: { x: 3, y: 1 } },
                { team: TeamVals.LEFT, indexPlus1: 1, cell: { x: 12, y: 1 } },
            ],
        });
        const replay = createRankedReplayFromPayload(payload(raw));
        const state = sceneState(replay.currentSnapshot!);

        expect(replay.currentSnapshot?.artifactBarrels).toEqual([
            expect.objectContaining({ team: TeamVals.RIGHT, index: 1, cell: { x: 3, y: 1 } }),
            expect.objectContaining({ team: TeamVals.LEFT, index: 0, cell: { x: 12, y: 1 } }),
        ]);
        // Every restored stone carries a FINITE art variant — the exact property whose absence crashed
        // the Cemetery replay of the real game.
        for (const rock of state.scatteredMountains ?? []) {
            expect(Number.isFinite(rock.variant)).toBe(true);
        }
    });

    test("restores related terrain counts and destroyed mountain HP from the same JSON encoding", () => {
        const replay = createRankedReplayFromPayload(
            payload(
                snapshot(1, {
                    centerObstacleHitsLeftPlus1: 1,
                    centerObstacleHitsRightPlus1: 4,
                    transientCellsCountPlus1: 2,
                    transientCells: [{ kind: PlayTransientCellKind.FIRE_WALL, x: 6, y: 7, lapsRemaining: 2, team: 0 }],
                    additionalTimeMsPlus1: 5001,
                    artifactBarrelsCountPlus1: 1,
                }),
            ),
        );
        const decoded = replay.currentSnapshot!;

        expect(decoded.centerObstacleHitsLeft).toBe(0);
        expect(decoded.centerObstacleHitsRight).toBe(3);
        expect(decoded.transientCellsCount).toBe(1);
        expect(decoded.additionalTimeMs).toBe(5000);
        expect(decoded.artifactBarrelsCount).toBe(0);
        expect(decoded.artifactBarrels).toEqual([]);
        expect(sceneState(decoded).terrainCells).toEqual([
            { kind: "fire_wall", x: 6, y: 7, lapsRemaining: 2, team: 0 },
        ]);
    });

    test("an older replay with no scattered state keeps the classic mountain layout", () => {
        const raw = snapshot(1);
        const replay = createRankedReplayFromPayload(payload(raw));

        expect(replay.currentSnapshot).toBe(raw as unknown as typeof replay.currentSnapshot);
        expect(sceneState(raw).scatteredMountains).toBeUndefined();
    });

    test("already decoded replays stay decoded when loaded again", () => {
        const downloaded = payload(
            snapshot(1, { scatteredStandingCellsPlus1: [packed(7, 6) + 1], scatteredStandingCountPlus1: 2 }),
        );
        const first = createRankedReplayFromPayload(downloaded);
        const second = createRankedReplayFromPayload({
            ...downloaded,
            currentSnapshot: first.currentSnapshot!,
            events: first.events,
        });

        expect(second.currentSnapshot?.scatteredStandingCells).toEqual([packed(7, 6)]);
        expect(second.currentSnapshot?.scatteredStandingCount).toBe(1);
        expect(second.currentSnapshot).toBe(first.currentSnapshot);
    });
});
