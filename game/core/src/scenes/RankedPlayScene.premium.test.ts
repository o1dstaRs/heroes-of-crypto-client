import { expect, spyOn, test } from "bun:test";

import type { PremiumTurnPreview } from "../api/premium_client";
import { PlayPhase } from "../api/play_protocol";
import { RankedPlayScene } from "./RankedPlayScene";
import { Sandbox } from "./Sandbox";

test("suggestions wait for the matching board, hide during actions and never survive a turn or viewer change", () => {
    const step = spyOn(Sandbox.prototype, "Step").mockImplementation(() => {});
    let visible = false;
    let draws = 0;
    let animating = false;
    const turn: PremiumTurnPreview = {
        gameId: "fight",
        sequence: 8,
        lap: 2,
        unitId: "actor",
        status: "ready",
        options: [],
    };
    const state = {
        viewerTeam: 2,
        premiumSnapshot: {
            gameId: "fight",
            latestSequence: 8,
            currentLap: 2,
            currentUnitId: "actor",
            phase: PlayPhase.PLAY,
            fightFinished: false,
        },
        lastAuthoritativeSequence: 7,
        premiumTurnOverlay: {
            setVisible: (next: boolean) => {
                visible = next;
            },
            draw: () => {
                draws++;
            },
        },
        getCurrentActiveUnit: () => ({ getId: () => "actor", getTeam: () => 2, isDead: () => false }),
        isPlayingActionAnimation: () => animating,
        unitsHolder: { getAllUnits: () => new Map() },
        sc_sceneSettings: { getGridSettings: () => ({}) },
        fullReplayPlaybackActive: false,
        replayViewingActive: false,
        sc_isAIActive: false,
    };
    const scene = Object.create(RankedPlayScene.prototype) as RankedPlayScene;
    Object.assign(scene, state);
    try {
        scene.setPremiumTurnPreview(turn);
        scene.Step(0);
        expect(visible).toBe(false);
        Object.assign(scene, { lastAuthoritativeSequence: 8 });
        scene.Step(0);
        expect(visible).toBe(true);
        expect(draws).toBe(1);
        animating = true;
        scene.Step(0);
        expect(visible).toBe(false);
        animating = false;
        scene.Step(0);
        expect(visible).toBe(true);
        expect(draws).toBe(1);
        for (const changed of [
            { premiumSnapshot: { ...state.premiumSnapshot, latestSequence: 9 } },
            { premiumSnapshot: { ...state.premiumSnapshot, currentUnitId: "next" } },
            { premiumSnapshot: { ...state.premiumSnapshot, currentLap: 3 } },
            { premiumSnapshot: { ...state.premiumSnapshot, gameId: "another" } },
            { premiumSnapshot: { ...state.premiumSnapshot, fightFinished: true } },
            { viewerTeam: 1 },
            { fullReplayPlaybackActive: true },
            { replayViewingActive: true },
            { sc_isAIActive: true },
        ]) {
            Object.assign(scene, state, { lastAuthoritativeSequence: 8 }, changed);
            scene.Step(0);
            expect(visible).toBe(false);
        }
        Object.assign(scene, state, { lastAuthoritativeSequence: 8 });
        scene.Step(0);
        expect(visible).toBe(true);
        scene.setPremiumTurnPreview(undefined);
        expect(visible).toBe(false);
    } finally {
        step.mockRestore();
    }
});
