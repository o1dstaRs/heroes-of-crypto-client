import { describe, expect, test } from "bun:test";

import { FightProperties, FightStateManager } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import { RankedPlayScene } from "./RankedPlayScene";
import type { IVisibleState } from "./VisibleState";

interface ReplayVisibleScene {
    sc_visibleState: IVisibleState;
    sc_visibleStateUpdateNeeded: boolean;
    refreshVisibleStateIfNeeded(force?: boolean): void;
    setReplayPlaybackActive(active: boolean): void;
    publishReplayFightChrome(snapshot: Pick<AuthoritativeGameSnapshot, "fightStarted">): void;
}

const withScene = (run: (scene: ReplayVisibleScene) => void): void => {
    const manager = FightStateManager.getInstance();
    const previous = manager.getFightProperties();
    manager.setFightProperties(new FightProperties());
    try {
        const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
            replayPlaybackActive: false,
            fullReplayPlaybackActive: true,
            replayViewingActive: false,
            sc_visibleStateUpdateNeeded: false,
        }) as ReplayVisibleScene;
        scene.refreshVisibleStateIfNeeded();
        run(scene);
    } finally {
        manager.setFightProperties(previous);
    }
};

describe("replay sidebar visibility across board rebuilds", () => {
    test("keeps playback active while hydrating the opening placement board", () => {
        withScene((scene) => {
            scene.setReplayPlaybackActive(true);
            scene.publishReplayFightChrome({ fightStarted: false });

            scene.refreshVisibleStateIfNeeded(true);

            expect(scene.sc_visibleState.replayPlaybackActive).toBe(true);
            expect(scene.sc_visibleState.replayFightVisible).toBe(false);
        });
    });

    test("keeps the battle log visible through successive combat rebuilds", () => {
        withScene((scene) => {
            scene.setReplayPlaybackActive(true);
            scene.publishReplayFightChrome({ fightStarted: true });

            for (let index = 0; index < 4; index += 1) {
                const previous = scene.sc_visibleState;
                scene.sc_visibleStateUpdateNeeded = false;

                scene.refreshVisibleStateIfNeeded(true);

                expect(scene.sc_visibleState).not.toBe(previous);
                expect(scene.sc_visibleState.replayPlaybackActive).toBe(true);
                expect(scene.sc_visibleState.replayFightVisible).toBe(true);
                expect(scene.sc_visibleStateUpdateNeeded).toBe(true);
            }
        });
    });

    test("keeps playback stopped when the final board is rebuilt", () => {
        withScene((scene) => {
            scene.setReplayPlaybackActive(true);
            scene.publishReplayFightChrome({ fightStarted: true });
            scene.setReplayPlaybackActive(false);

            scene.refreshVisibleStateIfNeeded(true);

            expect(scene.sc_visibleState.replayPlaybackActive).toBe(false);
        });
    });
});
