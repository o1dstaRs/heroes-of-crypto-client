import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { FightStateManager, GridVals, TeamVals } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import { releaseBoardMirror } from "../pixi/boardMirror";
import type { SandboxReplay, SandboxReplayActionRecord } from "../replay/sandbox_replay";
import { RankedPlayScene } from "./RankedPlayScene";
import { Sandbox, type SandboxSceneState } from "./Sandbox";

/**
 * What a replay SHOWS beyond the board: the combat log, the fight-stats graph, the turn clock, the
 * journal-driven VFX (armageddon, lap morale, poison) and the buff/debuff pops.
 *
 * None of those can travel inside a SandboxSceneState — they are built from the snapshot's journal tail,
 * damage stats and server clocks. Live play runs them around every snapshot; a replay only ever hydrated
 * scene states, so it played a silent fight. The fix keeps each record's whole snapshot beside its scene
 * state and hands it to the ranked scene through two hooks on the replay loop.
 */
const originalFight = FightStateManager.getInstance().getFightProperties();
beforeEach(() => FightStateManager.getInstance().reset());
afterEach(() => FightStateManager.getInstance().setFightProperties(originalFight));

const sceneState = (currentLap: number): SandboxSceneState => ({
    units: [],
    gridType: GridVals.NORMAL,
    currentLap,
    fightStarted: currentLap > 0,
    fightFinished: false,
});

const snapshotFor = (overrides: Partial<AuthoritativeGameSnapshot> = {}): AuthoritativeGameSnapshot => ({
    gameId: "replay-game",
    phase: 1,
    gridType: GridVals.NORMAL,
    currentLap: 1,
    fightStarted: true,
    fightFinished: false,
    currentUnitId: "",
    currentTurnTeam: TeamVals.LEFT,
    latestSequence: 1,
    narrowingLayers: 0,
    centerDried: false,
    units: [],
    ...overrides,
});

const recordFor = (
    sequence: number,
    action: SandboxReplayActionRecord["action"],
    authoritativeSnapshot?: AuthoritativeGameSnapshot,
): SandboxReplayActionRecord => ({
    sequence,
    clientTimeMs: sequence,
    action,
    events: [],
    stateAfter: sceneState(sequence),
    authoritativeSnapshot,
});

const replayOf = (actions: SandboxReplayActionRecord[]): SandboxReplay => ({
    version: 1,
    kind: "sandbox",
    id: "presentation",
    createdAtMs: 0,
    updatedAtMs: 0,
    initialState: sceneState(0),
    actions,
});

describe("replay presentation", () => {
    test("the replay loop presents checkpoints and fires both hooks around the state each action lands on", async () => {
        const timeline: string[] = [];
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            isSceneDestroyed: () => false,
            sc_visibleState: {},
            sc_sceneLog: { clear: () => {} },
            preloadTextureKeys: async () => {},
            prepareMapTextures: async () => {},
            onSupplementaryTexturesLoaded: () => {},
            hydrateSceneState: (state: SandboxSceneState) => timeline.push(`hydrate ${state.currentLap}`),
            playSandboxReplayRecord: async (record: SandboxReplayActionRecord) => {
                timeline.push(`play ${record.sequence}`);
                return true;
            },
            onReplayRecordSettling: (record: SandboxReplayActionRecord) => timeline.push(`settle ${record.sequence}`),
            onReplayRecordPresented: (record: SandboxReplayActionRecord) => timeline.push(`present ${record.sequence}`),
            delayReplay: async () => {},
            onReplayCompleted: () => {},
        });
        const replay = replayOf([
            recordFor(1, { type: "start_fight" }),
            recordFor(2, { type: "wait_turn", unitId: "a" }),
        ]);

        expect(await scene.playSandboxReplay(replay)).toBe(true);
        expect(timeline).toEqual([
            // The placement-era checkpoints open the replay as ONE board, the one the fight began on, and the
            // last of them is presented so its log lines are not lost. Rebuilding the board for each of them
            // flashed every placement drop at the start of a replay.
            "hydrate 1",
            "present 1",
            // An action plays on the board it started from, which here is the opening board already standing;
            // settling runs while that board still stands (a death with no event of its own has no other
            // moment to be seen), presenting once the new state is in.
            "play 2",
            "settle 2",
            "hydrate 2",
            "present 2",
            "hydrate 2",
        ]);
    });

    test("ranked settles and presents every live step that is not the board itself", () => {
        const steps = [
            "processDebuffPops",
            "applyAuthoritativeSceneLog",
            "renderNewlyAppliedMorale",
            "renderNewlyAppliedPoison",
            "renderNewlyAppliedArmageddon",
            "reconcileAuraEffectsFromSnapshot",
            "applyRankedTimer",
            "applyRankedFightStats",
            "shatterNewlyDeadUnits",
        ] as const;
        const calls = Object.fromEntries(steps.map((step) => [step, mock((..._args: unknown[]) => {})]));
        const scene = Object.assign(Object.create(RankedPlayScene.prototype), calls, {
            rememberStatusSnapshot: () => {},
            rememberStatusApplications: () => {},
            flushEffectPops: () => {},
            renderNewlyAppliedPyre: () => {},
        });
        const snapshot = snapshotFor();
        const record = recordFor(1, { type: "wait_turn", unitId: "a" }, snapshot);

        // A record without a journal has nothing to present beyond the board.
        scene.onReplayRecordSettling(recordFor(1, { type: "wait_turn", unitId: "a" }));
        scene.onReplayRecordPresented(recordFor(1, { type: "wait_turn", unitId: "a" }));
        for (const step of steps) expect(calls[step]).not.toHaveBeenCalled();

        // A death the events never announced is shattered before the rebuild hides it.
        scene.onReplayRecordSettling(record);
        expect(calls.shatterNewlyDeadUnits).toHaveBeenCalledWith(snapshot);
        expect(calls.applyAuthoritativeSceneLog).not.toHaveBeenCalled();

        scene.onReplayRecordPresented(record);
        for (const step of steps) expect(calls[step].mock.calls[0]?.[0]).toBe(snapshot);
        expect(calls.applyRankedFightStats).toHaveBeenCalledWith(snapshot, record.stateAfter.units);
    });

    test("playback re-baselines presentation and mutes the engine log only while a journal replaces it", async () => {
        const suppressedDuringPlayback: boolean[] = [];
        let suppressed = false;
        const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
            resetRankedReplayPresentation: mock(() => {}),
            sc_sceneLog: {
                isSuppressed: () => suppressed,
                setSuppressed: (value: boolean) => (suppressed = value),
            },
        });
        let failPlayback = false;
        const play = spyOn(Sandbox.prototype, "playSandboxReplay").mockImplementation(async () => {
            suppressedDuringPlayback.push(suppressed);
            if (failPlayback) throw new Error("playback failed");
            return true;
        });
        try {
            const journal = replayOf([recordFor(1, { type: "start_fight" }, snapshotFor())]);
            expect(await scene.playSandboxReplay(journal)).toBe(true);
            // A sandbox replay (no snapshots) keeps the engine channel — muting it would leave an empty log.
            expect(await scene.playSandboxReplay(replayOf([recordFor(1, { type: "start_fight" })]))).toBe(true);
            // And the channel is always put back, whatever the playback did.
            failPlayback = true;
            await expect(scene.playSandboxReplay(journal)).rejects.toThrow("playback failed");

            expect(suppressedDuringPlayback).toEqual([true, false, true]);
            expect(suppressed).toBe(false);
            // Otherwise a replay started from a live fight continues that fight's log and graph.
            expect(scene.resetRankedReplayPresentation).toHaveBeenCalledTimes(3);
        } finally {
            play.mockRestore();
            releaseBoardMirror(scene);
        }
    });

    test("snapshot-by-snapshot replay re-baselines a new playback but continues one already running", () => {
        const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
            replayViewingActive: false,
            rankedSceneLogGameId: "",
            rankedSceneLogSequence: -1,
            lastPlacementStateByUnitId: new Map(),
            resetRankedReplayPresentation: mock(() => {}),
            applyAuthoritativeSnapshot: mock(() => {}),
        });

        scene.applyAuthoritativeReplaySnapshot(snapshotFor({ latestSequence: 3 }));
        expect(scene.resetRankedReplayPresentation).toHaveBeenCalledTimes(1);
        Object.assign(scene, { rankedSceneLogGameId: "replay-game", rankedSceneLogSequence: 3 });
        scene.applyAuthoritativeReplaySnapshot(snapshotFor({ latestSequence: 4 }));
        expect(scene.resetRankedReplayPresentation).toHaveBeenCalledTimes(1);
        scene.applyAuthoritativeReplaySnapshot(snapshotFor({ latestSequence: 2 }));
        expect(scene.resetRankedReplayPresentation).toHaveBeenCalledTimes(2);
        expect(scene.applyAuthoritativeSnapshot).toHaveBeenCalledTimes(3);
    });

    test("a snapshot skipped mid-animation still updates the battle log", () => {
        const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
            fullReplayPlaybackActive: false,
            lastAuthoritativeSequence: 1,
            sandboxCoop: false,
            sc_visibleState: undefined,
            rememberStatusSnapshot: () => {},
            processDebuffPops: () => {},
            applyRankedDamageStatistics: () => {},
            applyAuthoritativeSceneLog: mock(() => {}),
            isPlayingActionAnimation: () => true,
            shatterNewlyDeadUnits: () => {},
            hydrateSceneState: mock(() => {}),
        });
        const snapshot = snapshotFor({ latestSequence: 2 });

        scene.applyAuthoritativeSnapshot(snapshot);

        expect(scene.applyAuthoritativeSceneLog).toHaveBeenCalledWith(snapshot);
        expect(scene.hydrateSceneState).not.toHaveBeenCalled();
    });

    test("replay playback opens the fight chrome once the fight is on screen, and only during playback", () => {
        const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
            fullReplayPlaybackActive: false,
            replayViewingActive: false,
            sc_visibleState: { replayFightVisible: false },
            sc_visibleStateUpdateNeeded: false,
            resetStatusApplicationOrder: () => {},
            resetRankedFightStats: () => {},
        });

        scene.publishReplayFightChrome(snapshotFor());
        expect(scene.sc_visibleState.replayFightVisible).toBe(false);

        scene.fullReplayPlaybackActive = true;
        scene.publishReplayFightChrome(snapshotFor({ fightStarted: false }));
        expect(scene.sc_visibleState.replayFightVisible).toBe(false);
        scene.publishReplayFightChrome(snapshotFor());
        expect(scene.sc_visibleState.replayFightVisible).toBe(true);
        expect(scene.sc_visibleStateUpdateNeeded).toBe(true);

        // A new playback starts on the opening board with the chrome closed again.
        scene.resetRankedReplayPresentation();
        expect(scene.sc_visibleState.replayFightVisible).toBe(false);
    });
});
