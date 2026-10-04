import { describe, expect, test } from "bun:test";

import { GridVals, TeamVals, type IDamageStatistic } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import { PixiGameManager } from "../pixi/PixiGameManager";
import { releaseBoardMirror } from "../pixi/boardMirror";
import type { SandboxReplay } from "../replay/sandbox_replay";
import { DamageStatisticHolder } from "./DamageStats";
import { RankedPlayScene } from "./RankedPlayScene";
import type { SandboxSceneState } from "./Sandbox";

interface DamageScene {
    sc_damageStatsUpdateNeeded: boolean;
    getDamageStatisics(): IDamageStatistic[];
    applyRankedFightStats(snapshot: AuthoritativeGameSnapshot, units: []): void;
    resetRankedReplayPresentation(): void;
}

const snapshotWith = (overrides: Partial<AuthoritativeGameSnapshot> = {}): AuthoritativeGameSnapshot => ({
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
    damageStats: [],
    ...overrides,
});

const totals = (left: number, right: number): IDamageStatistic[] => [
    { unitName: "Angel", damage: right, team: TeamVals.RIGHT, lap: 1 },
    { unitName: "Angel", damage: left, team: TeamVals.LEFT, lap: 1 },
];

const createScene = (): DamageScene => {
    // Only board rendering is omitted. Replay presentation, damage publication and the playback loop
    // below use the real implementations. Event-only playback leaves the local damage holder empty.
    const localDamage = new DamageStatisticHolder();
    return Object.assign(Object.create(RankedPlayScene.prototype), {
        attackHandler: { getDamageStatisticHolder: () => localDamage },
        rankedStatsGameId: "",
        rankedDamageStatistics: [],
        rankedStatsAliveCreatureGroups: new Map(),
        rankedStatsLeftRoster: new Map(),
        rankedStatsRightRoster: new Map(),
        rankedStatsCountedUnitIds: new Set(),
        sc_visibleState: undefined,
        sc_damageStatsUpdateNeeded: false,
        sc_damageForAnimation: { render: false },
        sc_sceneLog: {
            hasBeenUpdated: () => false,
            isSuppressed: () => false,
            setSuppressed: () => undefined,
            clear: () => undefined,
        },
        RunStep: () => undefined,
        isSceneDestroyed: () => false,
        hydrateSceneState: () => undefined,
        setReplayPlaybackActive: () => undefined,
        playSandboxReplayRecord: async () => true,
        onReplayRecordSettling: () => undefined,
        processDebuffPops: () => undefined,
        applyAuthoritativeSceneLog: () => undefined,
        renderNewlyAppliedMorale: () => undefined,
        renderNewlyAppliedPoison: () => undefined,
        renderNewlyAppliedArmageddon: () => undefined,
        reconcileAuraEffectsFromSnapshot: () => undefined,
        applyRankedTimer: () => undefined,
    }) as DamageScene;
};

const createManager = (scene: DamageScene): PixiGameManager => {
    const manager = new PixiGameManager();
    Object.assign(manager, {
        m_scene: scene,
        m_fpsCalculator: { addFrame: () => 1, getFps: () => 60 },
        lastTime: 1000,
    });
    return manager;
};

const createReplay = (): SandboxReplay => {
    const initialState: SandboxSceneState = {
        gridType: GridVals.NORMAL,
        currentLap: 0,
        fightStarted: false,
        fightFinished: false,
        units: [],
    };
    return {
        version: 1,
        kind: "sandbox",
        id: "ranked:replay-game",
        createdAtMs: 0,
        updatedAtMs: 3,
        initialState,
        actions: [[], totals(120, 35), totals(210, 80)].map((damageStats, index) => ({
            sequence: index + 1,
            clientTimeMs: index + 1,
            action: index === 0 ? { type: "start_fight" } : { type: "wait_turn", unitId: "angel" },
            events: [],
            stateAfter: { ...initialState, currentLap: 1, fightStarted: true },
            authoritativeSnapshot: snapshotWith({ latestSequence: index + 1, damageStats }),
        })),
    };
};

describe("replay damage statistics in the right sidebar", () => {
    test("publishes cumulative server totals for both teams without recounting repeated snapshots", () => {
        const scene = createScene();
        const snapshot = snapshotWith({ damageStats: totals(120, 35) });

        scene.applyRankedFightStats(snapshot, []);
        scene.applyRankedFightStats(snapshot, []);

        expect(scene.getDamageStatisics()).toEqual([...totals(120, 35)].reverse());
        expect(scene.sc_damageStatsUpdateNeeded).toBe(true);
        // Replay presentation must never mutate the recorded snapshot or its original ordering.
        scene.getDamageStatisics()[0].damage = 999;
        expect(snapshot.damageStats).toEqual(totals(120, 35));
    });

    test("placement and replay restarts clear the previous fight's damage", () => {
        const scene = createScene();
        scene.applyRankedFightStats(snapshotWith({ damageStats: totals(210, 80) }), []);
        scene.sc_damageStatsUpdateNeeded = false;
        scene.resetRankedReplayPresentation();
        expect(scene.getDamageStatisics()).toEqual([]);
        expect(scene.sc_damageStatsUpdateNeeded).toBe(true);

        scene.applyRankedFightStats(snapshotWith({ damageStats: totals(210, 80) }), []);
        scene.applyRankedFightStats(snapshotWith({ gameId: "next-game", fightStarted: false }), []);
        expect(scene.getDamageStatisics()).toEqual([]);
    });

    test("full event playback emits each action's totals and rewinding replaces them", async () => {
        const scene = createScene();
        const manager = createManager(scene);
        const published: IDamageStatistic[][] = [];
        const connection = manager.onDamageStatisticsUpdated.connect((stats) => published.push(stats));
        let nowMs = 1000;
        const tick = () => manager.SimulationLoop((nowMs += 17));
        Object.assign(scene, {
            hydrateSceneState: tick,
            delayReplay: async () => tick(),
        });
        try {
            const replay = createReplay();
            expect(await manager.PlaySandboxReplay(replay)).toBe(true);
            expect(published).toContainEqual([...totals(120, 35)].reverse());
            expect(published.at(-1)).toEqual([...totals(210, 80)].reverse());
            expect(manager.GetCurrentDamageStatistics()).toEqual([...totals(210, 80)].reverse());

            expect(await manager.PlaySandboxReplay(replay, 2)).toBe(true);
            expect(published.at(-1)).toEqual([...totals(120, 35)].reverse());

            expect(await manager.PlaySandboxReplay(replay, 0)).toBe(true);
            expect(published.at(-1)).toEqual([]);
        } finally {
            connection.disconnect();
            releaseBoardMirror(scene);
        }
    });

    test("a sidebar opened after an update can read totals without waiting for another attack", () => {
        const scene = createScene();
        const manager = createManager(scene);
        scene.applyRankedFightStats(snapshotWith({ damageStats: totals(120, 35) }), []);
        manager.SimulationLoop(1017);
        expect(scene.sc_damageStatsUpdateNeeded).toBe(false);

        const displayed = manager.GetCurrentDamageStatistics();
        expect(displayed).toEqual([...totals(120, 35)].reverse());
        displayed[0].damage = 0;
        expect(manager.GetCurrentDamageStatistics()[0].damage).toBe(120);
    });

    test("a live terminal snapshot cannot overwrite damage at the moment being replayed", () => {
        const scene = createScene();
        const manager = createManager(scene);
        scene.applyRankedFightStats(snapshotWith({ damageStats: totals(120, 35) }), []);
        Object.assign(scene, { fullReplayPlaybackActive: true });
        const published: IDamageStatistic[][] = [];
        const connection = manager.onDamageStatisticsUpdated.connect((stats) => published.push(stats));
        try {
            manager.ApplyAuthoritativeSnapshot(
                snapshotWith({ latestSequence: 20, fightFinished: true, damageStats: totals(210, 80) }),
            );

            expect(published.at(-1)).toEqual([...totals(120, 35)].reverse());
            expect(manager.GetCurrentDamageStatistics()).toEqual([...totals(120, 35)].reverse());
        } finally {
            connection.disconnect();
        }
    });
});
