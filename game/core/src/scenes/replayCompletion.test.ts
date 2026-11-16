import { expect, test } from "bun:test";
import { GridVals, TeamVals } from "@heroesofcrypto/common";

import type { SandboxReplay, SandboxReplayActionRecord } from "../replay/sandbox_replay";
import { Sandbox, type SandboxSceneState } from "./Sandbox";

test("the final report is restored after the last board hydrate and before playback releases the results UI", async () => {
    const timeline: string[] = [];
    const initialState: SandboxSceneState = {
        units: [],
        gridType: GridVals.NORMAL,
        currentLap: 0,
        fightStarted: true,
        fightFinished: false,
    };
    const replay: SandboxReplay = {
        version: 1,
        kind: "sandbox",
        id: "completed",
        createdAtMs: 0,
        updatedAtMs: 0,
        initialState,
        actions: [false, true].map((fightFinished, index) => ({
            sequence: index + 1,
            clientTimeMs: 0,
            action: { type: "end_turn", unitId: "a" },
            events: fightFinished ? [{ type: "fight_finished", winningTeam: TeamVals.LEFT }] : [],
            stateAfter: { ...initialState, currentLap: index + 1, fightFinished },
        })),
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        isSceneDestroyed: () => false,
        sc_visibleState: {},
        sc_sceneLog: { clear: () => {} },
        preloadTextureKeys: async () => {},
        prepareMapTextures: async () => {},
        onSupplementaryTexturesLoaded: () => {},
        hydrateSceneState: (state: SandboxSceneState) => {
            timeline.push(`hydrate ${state.currentLap}`);
            scene.sc_visibleState.hasFinished = false;
        },
        playSandboxReplayRecord: async () => true,
        onReplayRecordPresented: (record: SandboxReplayActionRecord) => timeline.push(`present ${record.sequence}`),
        onReplayRecordSettling: () => {},
        delayReplay: async () => {},
        finishFight: (winner: number) => {
            expect(winner).toBe(TeamVals.LEFT);
            expect(scene.sc_visibleState.replayPlaybackActive).toBe(true);
            timeline.push("finish");
        },
        onReplayCompleted: (record: SandboxReplayActionRecord) => {
            expect(scene.sc_visibleState.replayPlaybackActive).toBe(true);
            scene.sc_visibleState.hasFinished = record.stateAfter.fightFinished;
            timeline.push(`complete ${record.sequence}`);
        },
    });
    expect(await scene.playSandboxReplay(replay)).toBe(true);
    expect(timeline.slice(-4)).toEqual(["present 2", "hydrate 2", "finish", "complete 2"]);
    expect(scene.sc_visibleState.hasFinished).toBe(true);
    expect(scene.sc_visibleState.replayPlaybackActive).toBe(false);

    timeline.length = 0;
    expect(await scene.playSandboxReplay(replay, 1)).toBe(true);
    expect(timeline.at(-1)).toBe("complete 1");
    expect(timeline).not.toContain("finish");
    expect(scene.sc_visibleState.hasFinished).toBe(false);
    expect(scene.sc_visibleState.replayPlaybackActive).toBe(false);
});
