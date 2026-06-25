import { describe, expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";

import { PlayPhase, type PlaySnapshot } from "../api/play_protocol";
import type { LocalModelOpponentConfig } from "../scenes/LocalModelOpponent";
import {
    resolveEffectiveLocalModelOpponentConfig,
    shouldApplyActionResponseSnapshotToViewer,
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
    currentTurnStartMs: 0,
    currentTurnEndMs: 0,
    units: [],
    players: [],
    readyPlayerIds: [],
    journalTail: [],
    maxLowerUnits: 0,
    maxUpperUnits: 0,
    narrowingLayers: 0,
    centerDried: false,
    upNext: [],
    damageStats: [],
    ...overrides,
});

describe("ranked action response snapshots", () => {
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
            modelTeam: TeamVals.UPPER,
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
                            team: TeamVals.UPPER,
                            connected: true,
                            aiControlled: false,
                            lastSeenMs: 0,
                        },
                        {
                            playerId: "model-player",
                            team: TeamVals.LOWER,
                            connected: false,
                            aiControlled: false,
                            lastSeenMs: 0,
                        },
                    ],
                }),
            ).modelTeam,
        ).toBe(TeamVals.LOWER);
    });
});
