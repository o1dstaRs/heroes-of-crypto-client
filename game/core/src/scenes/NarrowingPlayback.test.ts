import { expect, spyOn, test } from "bun:test";
import { FightStateManager, type GameEvent } from "@heroesofcrypto/common";
import type { SandboxReplayActionRecord } from "../replay/sandbox_replay";
import { RankedPlayScene } from "./RankedPlayScene";
import { Sandbox } from "./Sandbox";

const flush = async () => {
    for (let index = 0; index < 30; index++) await Promise.resolve();
};

function fixture(terrainDuration = 0) {
    let now = 0;
    let destroyed = false;
    let foregroundUntil = 400;
    let terrainUntil = 0;
    const timers: { due: number; resolve(): void }[] = [];
    const timeline: { name: string; at: number }[] = [];
    const actionEvents: GameEvent[][] = [];
    const mapEvents: GameEvent[][] = [];
    const unit = {
        getId: () => "a",
        isDead: () => false,
        isPlayingOneShotAnimation: () => now < foregroundUntil,
    };
    const units = new Map([["a", unit]]);
    const delay = (ms: number) => new Promise<void>((resolve) => timers.push({ due: now + ms, resolve }));
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_isAnimating: false,
        replayPlaybackActive: true,
        narrowingPlaybackEpoch: 0,
        drawnNarrowingLaps: new Set<number>(),
        dyingVisualUnits: new Set(),
        unitsHolder: { getAllUnits: () => units },
        moveAnimManager: { isMoving: () => false },
        isSceneDestroyed: () => destroyed,
        delayReplay: delay,
        attachToWorldRoot: () => {},
        occupyNarrowingLayer: () => {},
        moveFiresInward: () => {},
        dungeonVisuals: {
            getHoleContainer: () => ({}),
            spawnHoleLayer: () => {
                terrainUntil = now + terrainDuration;
            },
            setNarrowingLayers: () => timeline.push({ name: "map", at: now }),
            hasActiveTerrainAnimations: () => now < terrainUntil,
            isCenterDried: () => false,
        },
        playReplayActionRecord: async (record: SandboxReplayActionRecord) => {
            actionEvents.push(record.events);
            await delay(100);
            timeline.push({ name: "action-finished", at: now });
            return true;
        },
        applyReplayEvents: (events: GameEvent[]) => {
            mapEvents.push(events);
            scene.renderNarrowingLayers(1, { animate: true });
        },
    });
    const advance = async (ms: number) => {
        await flush();
        const end = now + ms;
        for (;;) {
            timers.sort((a, b) => a.due - b.due);
            const next = timers[0];
            if (!next || next.due > end) break;
            timers.shift();
            now = next.due;
            next.resolve();
            await flush();
        }
        now = end;
        await flush();
    };
    return {
        scene,
        unit,
        timeline,
        actionEvents,
        mapEvents,
        advance,
        now: () => now,
        destroy: () => {
            destroyed = true;
        },
        setForegroundUntil: (until: number) => {
            foregroundUntil = until;
        },
    };
}

function record(type = "end_turn"): SandboxReplayActionRecord {
    return {
        sequence: 1,
        clientTimeMs: 0,
        action: { type, unitId: "a", attackerId: "a", targetId: "b", casterId: "a" },
        events: [
            { type: "turn_completed", unitId: "a", team: 1, hourglass: false },
            { type: "lap_flipped", previousLap: 2, currentLap: 3 },
            { type: "narrowing_applied", lap: 3, layers: 1, encounterCurrent: false },
            { type: "unit_moved_by_system", unitId: "a", position: { x: 2, y: 2 }, reason: "narrowing" },
        ],
        stateAfter: { units: [] },
    } as unknown as SandboxReplayActionRecord;
}

test.each(["melee_attack", "range_attack", "move_unit", "cast_spell", "end_turn"])(
    "%s finishes before narrowing; the record owns the complete border collapse",
    async (type) => {
        const f = fixture(1400);
        const action = record(type);
        let completed = false;
        const pending = f.scene.playSandboxReplayRecord(action).then((played: boolean) => {
            completed = true;
            return played;
        });
        await f.advance(399);
        expect(f.actionEvents).toEqual([[action.events[0]]]);
        expect(f.timeline).toEqual([{ name: "action-finished", at: 100 }]);
        expect(f.mapEvents).toEqual([]);
        await f.advance(17);
        expect(f.mapEvents).toEqual([action.events.slice(1)]);
        expect(f.timeline[1].at).toBeGreaterThanOrEqual(400);
        expect(f.scene.isAnimating()).toBe(true);
        await f.advance(700);
        expect(completed).toBe(false);
        await f.advance(750);
        expect(await pending).toBe(true);
        expect(f.scene.isAnimating()).toBe(false);
        expect(f.scene.sc_isAnimating).toBe(false);
    },
);

test("ordinary records retain their completion timing", async () => {
    const f = fixture();
    const action = record();
    action.events = action.events.slice(0, 1);
    const pending = f.scene.playSandboxReplayRecord(action);
    await f.advance(100);
    expect(await pending).toBe(true);
    expect(f.mapEvents).toEqual([]);
    expect(f.scene.isAnimating()).toBe(false);
});

test("a new ring gets a visible beat; duplicate events and checkpoint restoration do not replay it", async () => {
    const f = fixture();
    f.scene.renderNarrowingLayers(1, { animate: true });
    await f.advance(640);
    expect(f.scene.isAnimating()).toBe(true);
    await f.advance(16);
    expect(f.scene.isAnimating()).toBe(false);
    f.scene.renderNarrowingLayers(1, { animate: true });
    expect(f.scene.isAnimating()).toBe(false);
    f.scene.renderNarrowingLayers(2, { regrid: true });
    expect(f.scene.isAnimating()).toBe(false);
});

test("a stalled terrain effect cannot leave the animation lock stuck", async () => {
    const f = fixture(Number.POSITIVE_INFINITY);
    f.scene.renderNarrowingLayers(1, { animate: true });
    await f.advance(3010);
    expect(f.scene.isAnimating()).toBe(false);
});

test("recovery invalidates a pending map phase before it can move any units", async () => {
    const f = fixture();
    const pending = f.scene.playSandboxReplayRecord(record());
    await f.advance(150);
    f.scene.narrowingPlaybackEpoch++;
    await f.advance(32);
    expect(await pending).toBe(false);
    expect(f.mapEvents).toEqual([]);
});

test("destroying the scene releases an in-flight narrowing wait", async () => {
    const f = fixture(1400);
    const pending = f.scene.playSandboxReplayRecord(record());
    await f.advance(416);
    f.destroy();
    await f.advance(32);
    expect(await pending).toBe(false);
    expect(f.scene.isAnimating()).toBe(false);
});

test.each([false, true])("a future narrowing snapshot cannot interrupt playback, skip rebuild=%p", (skip) => {
    const f = fixture();
    f.scene.lastAuthoritativeSequence = 7;
    f.scene.rememberStatusSnapshot = () => {
        throw new Error("snapshot crossed the presentation barrier");
    };
    RankedPlayScene.prototype.applyAuthoritativeSnapshot.call(
        f.scene,
        { narrowingLayers: 1, latestSequence: 8 } as Parameters<RankedPlayScene["applyAuthoritativeSnapshot"]>[0],
        { skipBoardRebuild: skip },
    );
    expect(f.scene.lastAuthoritativeSequence).toBe(7);
});

test("local round handoff waits for the old reaction, then for narrowing, before activating the next unit", async () => {
    const f = fixture(1400);
    f.scene.replayPlaybackActive = false;
    const fight = FightStateManager.getInstance().getFightProperties();
    const spies = [
        spyOn(fight, "hasFightStarted").mockReturnValue(true),
        spyOn(fight, "hasFightFinished").mockReturnValue(false),
        spyOn(fight, "hasAlreadyMadeTurn").mockReturnValue(true),
        spyOn(performance, "now").mockImplementation(f.now),
    ];
    let advances = 0;
    f.scene.snapshotRenderableUnits = () => new Map();
    f.scene.createTurnEngine = () => ({
        advanceAfterNoActiveUnit: () => {
            advances++;
            return { events: [], nextUnit: f.unit };
        },
    });
    f.scene.applyTurnEngineEvents = () => f.scene.renderNarrowingLayers(1, { animate: true });
    f.scene.handleNextUnitActivation = () => f.timeline.push({ name: "next-unit", at: f.now() });
    try {
        f.scene.advanceAfterNoActiveUnitIfNeeded();
        expect(advances).toBe(0);
        await f.advance(400);
        f.scene.advanceAfterNoActiveUnitIfNeeded();
        expect(advances).toBe(1);
        f.scene.advanceAfterNoActiveUnitIfNeeded();
        expect(advances).toBe(1);
        expect(f.timeline.some((entry) => entry.name === "next-unit")).toBe(false);
        await f.advance(1410);
        expect(f.timeline.at(-1)?.name).toBe("next-unit");
    } finally {
        for (const spy of spies) spy.mockRestore();
    }
});
