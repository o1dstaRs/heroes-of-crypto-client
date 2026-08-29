import { describe, expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";

import { PlayActionType, PlayPhase, type PlaySnapshot } from "../api/play_protocol";
import type { LocalModelOpponentConfig } from "../scenes/LocalModelOpponent";
import {
    hasOffGridSubmitCell,
    isPlacementMutationAction,
    rejectionErrorFromPlayEvent,
    resolveEffectiveLocalModelOpponentConfig,
    shouldApplyActionResponseSnapshotToViewer,
    shouldPlayAuthoritativeAction,
    shouldRecoverRejectedMoveFollowUp,
} from "./rankedActionResponse";

const snapshot = (overrides: Partial<PlaySnapshot>): PlaySnapshot => ({
    gameId: "game-1",
    phase: PlayPhase.PLACEMENT,
    gridType: 1,
    currentLap: 0,
    fightStarted: false,
    fightFinished: false,
    currentUnitId: "",
    currentTurnTeam: 0,
    latestSequence: 1,
    serverTimeMs: 0,
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
    maxLeftUnits: 0,
    maxRightUnits: 0,
    narrowingLayers: 0,
    centerDried: false,
    upNext: [],
    damageStats: [],
    ...overrides,
});

describe("ranked action response snapshots", () => {
    test("reconciles placement mutations from snapshots instead of replaying them through the animation queue", () => {
        for (const type of ["place_unit", "delete_unit", "split_unit"] as const) {
            expect(isPlacementMutationAction({ type })).toBe(true);
            expect(shouldPlayAuthoritativeAction({ type })).toBe(false);
        }
        expect(isPlacementMutationAction({ type: "move_unit" })).toBe(false);
        expect(shouldPlayAuthoritativeAction({ type: "move_unit" })).toBe(true);
    });

    test("never surfaces a bare informational message (e.g. ACTION_ACCEPTED's raw action-type name) as an error", () => {
        expect(rejectionErrorFromPlayEvent({ rejectionReason: "", message: "RANGE_ATTACK" })).toBe("");
        expect(rejectionErrorFromPlayEvent({ rejectionReason: "", message: "END_TURN" })).toBe("");
        expect(rejectionErrorFromPlayEvent({ rejectionReason: "", message: "" })).toBe("");
    });

    test("surfaces a real rejection reason as the error", () => {
        expect(rejectionErrorFromPlayEvent({ rejectionReason: "attack_not_available", message: "" })).toBe(
            "attack_not_available",
        );
    });

    test("recovers a rejected continued-move follow-up but not its move, ping, or recovery end", () => {
        expect(
            shouldRecoverRejectedMoveFollowUp("unit-1", {
                type: PlayActionType.CAST_SPELL,
                unitId: "unit-1",
            }),
        ).toBe(true);
        expect(
            shouldRecoverRejectedMoveFollowUp("unit-1", {
                type: PlayActionType.AREA_THROW_ATTACK,
                unitId: "unit-1",
            }),
        ).toBe(true);
        expect(
            [PlayActionType.MOVE_UNIT, PlayActionType.PING, PlayActionType.END_TURN].some((type) =>
                shouldRecoverRejectedMoveFollowUp("unit-1", { type, unitId: "unit-1" }),
            ),
        ).toBe(false);
        expect(
            shouldRecoverRejectedMoveFollowUp("unit-1", {
                type: PlayActionType.CAST_SPELL,
                unitId: "other-unit",
            }),
        ).toBe(false);
    });

    test("does not apply model-authorized placement snapshots to the viewer", () => {
        expect(
            shouldApplyActionResponseSnapshotToViewer(snapshot({ phase: PlayPhase.PLACEMENT }), {
                isModelSubmission: true,
            }),
        ).toBe(false);
    });

    test("applies human placement snapshots and model fight snapshots", () => {
        expect(
            shouldApplyActionResponseSnapshotToViewer(snapshot({ phase: PlayPhase.PLACEMENT }), {
                isModelSubmission: false,
            }),
        ).toBe(true);
        expect(
            shouldApplyActionResponseSnapshotToViewer(
                snapshot({ phase: PlayPhase.PLAY, fightStarted: true, currentLap: 1 }),
                { isModelSubmission: true },
            ),
        ).toBe(true);
    });

    test("uses model player id to resolve the actual server-side model team", () => {
        const config: LocalModelOpponentConfig = {
            enabled: true,
            modelTeam: TeamVals.RIGHT,
            apiBase: "/hoc-local-model",
            modelName: "auto",
            authorization: "Bearer model-token",
            playerId: "model-player",
            style: "balanced",
        };

        expect(
            resolveEffectiveLocalModelOpponentConfig(
                config,
                snapshot({
                    players: [
                        {
                            playerId: "human-player",
                            team: TeamVals.RIGHT,
                            connected: true,
                            aiControlled: false,
                            lastSeenMs: 0,
                        },
                        {
                            playerId: "model-player",
                            team: TeamVals.LEFT,
                            connected: false,
                            aiControlled: false,
                            lastSeenMs: 0,
                        },
                    ],
                }),
            ).modelTeam,
        ).toBe(TeamVals.LEFT);
    });

    test("disables local model control if the resolved model player is the viewer team", () => {
        const config: LocalModelOpponentConfig = {
            enabled: true,
            modelTeam: TeamVals.RIGHT,
            apiBase: "/hoc-local-model",
            modelName: "auto",
            authorization: "Bearer model-token",
            playerId: "human-player",
            style: "balanced",
        };

        const resolved = resolveEffectiveLocalModelOpponentConfig(
            config,
            snapshot({
                players: [
                    {
                        playerId: "human-player",
                        team: TeamVals.LEFT,
                        connected: true,
                        aiControlled: false,
                        lastSeenMs: 0,
                    },
                    {
                        playerId: "model-player",
                        team: TeamVals.RIGHT,
                        connected: false,
                        aiControlled: false,
                        lastSeenMs: 0,
                    },
                ],
            }),
            TeamVals.LEFT,
        );

        expect(resolved.enabled).toBe(false);
        expect(resolved.modelTeam).toBe(TeamVals.LEFT);
    });
});

describe("hasOffGridSubmitCell", () => {
    test("OBSTACLE_ATTACK's targetCell is exempt — it carries a world position, not a grid cell", () => {
        // Real strike on the left mountain: world (-320, 960) rides the targetCell wire field.
        // Bounds-checking it dropped every ranked mountain attack ("off-grid cell" toast).
        expect(
            hasOffGridSubmitCell({
                type: PlayActionType.OBSTACLE_ATTACK,
                targetCell: { x: -320, y: 960 },
                attackFrom: { x: 4, y: 6 },
                path: [
                    { x: 2, y: 4 },
                    { x: 3, y: 5 },
                    { x: 4, y: 6 },
                ],
            }),
        ).toBe(false);
    });

    test("OBSTACLE_ATTACK's attackFrom and path are still real grid cells and stay validated", () => {
        expect(
            hasOffGridSubmitCell({
                type: PlayActionType.OBSTACLE_ATTACK,
                targetCell: { x: -320, y: 960 },
                attackFrom: { x: 16, y: 6 },
            }),
        ).toBe(true);
        expect(
            hasOffGridSubmitCell({
                type: PlayActionType.OBSTACLE_ATTACK,
                targetCell: { x: -320, y: 960 },
                attackFrom: { x: 4, y: 6 },
                path: [{ x: 2.5, y: 4 }],
            }),
        ).toBe(true);
    });

    test("every other action's targetCell is bounds-checked", () => {
        expect(hasOffGridSubmitCell({ type: PlayActionType.RANGE_ATTACK, targetCell: { x: -320, y: 960 } })).toBe(true);
        expect(hasOffGridSubmitCell({ type: PlayActionType.RANGE_ATTACK, targetCell: { x: 3, y: 15 } })).toBe(false);
    });

    test("in-bounds cells across all fields pass", () => {
        expect(
            hasOffGridSubmitCell({
                type: PlayActionType.MELEE_ATTACK,
                attackFrom: { x: 0, y: 0 },
                path: [{ x: 15, y: 15 }],
                targetCells: [{ x: 7, y: 8 }],
                cells: [{ x: 1, y: 1 }],
            }),
        ).toBe(false);
    });
});
