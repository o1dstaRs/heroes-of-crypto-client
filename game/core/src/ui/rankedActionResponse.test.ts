import { describe, expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";

import { PlayActionType, PlayPhase, type PlaySnapshot } from "../api/play_protocol";
import type { LocalModelOpponentConfig } from "../scenes/LocalModelOpponent";
import {
    acceptedActionSound,
    hasOffGridSubmitCell,
    isPlacementMutationAction,
    placementActionSkipsSubmitSpinner,
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
        expect(placementActionSkipsSubmitSpinner(PlayActionType.PLACE_UNIT)).toBe(true);
        expect(placementActionSkipsSubmitSpinner(PlayActionType.SPLIT_UNIT)).toBe(true);
        expect(placementActionSkipsSubmitSpinner(PlayActionType.DELETE_UNIT)).toBe(true);
        expect(placementActionSkipsSubmitSpinner(PlayActionType.UNPLACE_UNIT)).toBe(true);
        expect(placementActionSkipsSubmitSpinner(PlayActionType.PLACE_BARREL)).toBe(true);
        expect(placementActionSkipsSubmitSpinner(PlayActionType.UNPLACE_BARREL)).toBe(true);
        expect(placementActionSkipsSubmitSpinner(PlayActionType.MOVE_UNIT)).toBe(false);
    });

    test.each([
        // ACTION_ACCEPTED carries the raw action-type name as its message; it is never an error.
        ["a bare informational message", { rejectionReason: "", message: "RANGE_ATTACK" }, ""],
        ["an end-turn notice", { rejectionReason: "", message: "END_TURN" }, ""],
        ["an empty event", { rejectionReason: "", message: "" }, ""],
        ["a real rejection reason", { rejectionReason: "attack_not_available", message: "" }, "attack_not_available"],
        // A summon refused for room says so, instead of the raw reason code.
        [
            "a no-space summon refusal",
            { rejectionReason: "spell_not_available", message: "No space next to Satyr. Wolf needs 2×1 free cells." },
            "No space next to Satyr. Wolf needs 2×1 free cells.",
        ],
        ["a reason with no message", { rejectionReason: "spell_not_available", message: "" }, "spell_not_available"],
    ])("surfaces the right error for %s", (_, event, expected) => {
        expect(rejectionErrorFromPlayEvent(event)).toBe(expected);
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

    test.each([
        ["withholds a model-authorized placement snapshot", snapshot({ phase: PlayPhase.PLACEMENT }), true, false],
        ["applies a human placement snapshot", snapshot({ phase: PlayPhase.PLACEMENT }), false, true],
        [
            "applies a model fight snapshot",
            snapshot({ phase: PlayPhase.PLAY, fightStarted: true, currentLap: 1 }),
            true,
            true,
        ],
    ])("%s to the viewer", (_, response, isModelSubmission, applied) => {
        expect(shouldApplyActionResponseSnapshotToViewer(response, { isModelSubmission })).toBe(applied);
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
                TeamVals.RIGHT,
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

    test("never lets a spectator tab (no viewer team) drive a model for either seat", () => {
        const config: LocalModelOpponentConfig = {
            enabled: true,
            modelTeam: TeamVals.RIGHT,
            apiBase: "/hoc-local-model",
            modelName: "auto",
            authorization: "Bearer player-token",
            playerId: "human-player",
            style: "balanced",
        };
        const players = [
            { playerId: "human-player", team: TeamVals.LEFT, connected: true, aiControlled: false, lastSeenMs: 0 },
            { playerId: "other-player", team: TeamVals.RIGHT, connected: true, aiControlled: false, lastSeenMs: 0 },
        ];

        expect(resolveEffectiveLocalModelOpponentConfig(config, snapshot({ players })).enabled).toBe(false);
        expect(
            resolveEffectiveLocalModelOpponentConfig({ ...config, playerId: undefined }, snapshot({ players })).enabled,
        ).toBe(false);
        expect(resolveEffectiveLocalModelOpponentConfig(config, null).enabled).toBe(false);
    });
});

describe("acceptedActionSound", () => {
    test("a split is heard once the server accepts it, and never on a rejection", () => {
        expect(acceptedActionSound(PlayActionType.SPLIT_UNIT, true)).toBe("split");
        expect(acceptedActionSound(PlayActionType.SPLIT_UNIT, false)).toBeUndefined();
    });

    test("other accepted actions keep their own sounds in the scene", () => {
        for (const type of [PlayActionType.PLACE_UNIT, PlayActionType.DELETE_UNIT, PlayActionType.MOVE_UNIT]) {
            expect(acceptedActionSound(type, true)).toBeUndefined();
        }
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

    test("a shot at a chosen stack is bounds-checked: its targetCell is the aim cell on the grid", () => {
        const targeted = { type: PlayActionType.RANGE_ATTACK, targetUnitId: "target-1" };
        expect(hasOffGridSubmitCell({ ...targeted, targetCell: { x: -320, y: 960 } })).toBe(true);
        expect(hasOffGridSubmitCell({ ...targeted, targetCell: { x: 3, y: 15 } })).toBe(false);
    });

    test("a free-aimed Through Shot's targetCell is exempt — it carries the Tsar Cannon's world aim point", () => {
        // A ranked cannon click aimed through the Hydra and the Valkyrie: no target stack, the world point rides
        // targetCell. Bounds-checking it dropped every free-aimed shot before it was sent — the line was drawn,
        // the click did nothing, and the server never saw a request.
        const freeAim = {
            type: PlayActionType.RANGE_ATTACK,
            targetCell: { x: -514.1474726208248, y: 1013.3117908038705 },
        };
        expect(hasOffGridSubmitCell(freeAim)).toBe(false);
        expect(hasOffGridSubmitCell({ ...freeAim, targetUnitId: "" })).toBe(false);
        // Its real grid fields are still validated.
        expect(hasOffGridSubmitCell({ ...freeAim, attackFrom: { x: 16, y: 2 } })).toBe(true);
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
