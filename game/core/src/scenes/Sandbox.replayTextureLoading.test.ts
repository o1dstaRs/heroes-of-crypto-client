import { expect, mock, test } from "bun:test";

import type { SandboxReplay } from "../replay/sandbox_replay";
import { approvedAnimationAssetKeysForUnit } from "../pixi/creatureAnimationSettings";
import { TextureType, unitToTextureName } from "../pixi/PixiUnitsFactory";
import { Sandbox } from "./Sandbox";

const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

function fixture() {
    const textures = deferred();
    const pending = deferred();
    let destroyed = false;
    const scene = Object.create(Sandbox.prototype);
    scene.isSceneDestroyed = () => destroyed;
    scene.setReplayPlaybackActive = mock(() => {});
    scene.preloadTextureKeys = mock(() => textures.promise);
    scene.prepareMapTextures = mock(() => pending.promise);
    scene.waitForPendingTextures = mock(() => new Promise(() => {}));
    scene.hydrateSceneState = mock(() => {});
    scene.onSupplementaryTexturesLoaded = mock(() => {});
    scene.sc_sceneLog = { clear: mock(() => {}) };
    const replay = { initialState: { units: [] }, actions: [] } as unknown as SandboxReplay;
    return {
        scene,
        replay,
        textures,
        pending,
        destroy: () => {
            destroyed = true;
        },
    };
}

test("replay waits for opening art and map textures without draining optional animation downloads", async () => {
    const { scene, replay, textures, pending } = fixture();
    const playback = scene.playSandboxReplay(replay);
    expect(scene.hydrateSceneState).not.toHaveBeenCalled();
    textures.resolve();
    await textures.promise;
    await Promise.resolve();
    expect(scene.hydrateSceneState).toHaveBeenCalledTimes(1);
    expect(scene.sc_sceneLog.clear).not.toHaveBeenCalled();
    pending.resolve();
    expect(await playback).toBe(true);
    expect(scene.onSupplementaryTexturesLoaded).toHaveBeenCalledTimes(1);
    expect(scene.sc_sceneLog.clear).toHaveBeenCalledTimes(1);
    expect(scene.waitForPendingTextures).not.toHaveBeenCalled();
    expect(scene.setReplayPlaybackActive).toHaveBeenLastCalledWith(false);
});

test("the first turn starts while a later creature's combat sheets are still downloading", async () => {
    const { scene, replay, textures, pending } = fixture();
    const later = deferred();
    const firstTurn = deferred();
    const firstStarted = deferred();
    const secondRequested = deferred();
    const units = ["Wolf", "Orc"].map((name) => ({ properties: { id: name, name } }));
    replay.initialState.units = units as typeof replay.initialState.units;
    replay.actions = ["Wolf", "Orc"].map((unitId, index) => ({
        sequence: index + 1,
        clientTimeMs: index,
        action: { type: "move_unit", unitId, path: [{ x: 1, y: 1 }] },
        events: [],
        stateAfter: replay.initialState,
    }));
    scene.onReplayRecordSettling = mock(() => {});
    scene.onReplayRecordPresented = mock(() => {});
    scene.delayReplay = () => Promise.resolve();
    scene.playSandboxReplayRecord = mock(() => {
        firstStarted.resolve();
        return firstTurn.promise.then(() => true);
    });
    const orcWalk = approvedAnimationAssetKeysForUnit("Orc").find((key) => key.includes("_walk_"))!;
    scene.preloadTextureKeys = mock((keys: string[], options?: { priority?: string }) => {
        if (keys.includes(orcWalk)) {
            if (options?.priority === "visible") secondRequested.resolve();
            return later.promise;
        }
        return textures.promise;
    });
    const playback = scene.playSandboxReplay(replay);
    textures.resolve();
    pending.resolve();
    await firstStarted.promise;
    expect(scene.playSandboxReplayRecord).toHaveBeenCalledTimes(1);
    expect(scene.playSandboxReplayRecord.mock.calls[0][0]).toBe(replay.actions[0]);
    expect(scene.preloadTextureKeys.mock.calls[0][0]).toContain(unitToTextureName("Orc", TextureType.SMALL));
    expect(scene.preloadTextureKeys.mock.calls[0][0]).not.toContain(orcWalk);
    firstTurn.resolve();
    await secondRequested.promise;
    expect(scene.playSandboxReplayRecord).toHaveBeenCalledTimes(1);
    later.resolve();
    expect(await playback).toBe(true);
    expect(scene.playSandboxReplayRecord).toHaveBeenCalledTimes(2);
});

test("leaving the scene while textures load cancels replay before hydration", async () => {
    const { scene, replay, textures, destroy } = fixture();
    const playback = scene.playSandboxReplay(replay);
    destroy();
    textures.resolve();
    expect(await playback).toBe(false);
    expect(scene.hydrateSceneState).not.toHaveBeenCalled();
    expect(scene.setReplayPlaybackActive).toHaveBeenLastCalledWith(false);
});

test("a texture failure does not start a partially loaded replay and releases playback state", async () => {
    const { scene, replay } = fixture();
    scene.preloadTextureKeys = () => Promise.reject(new Error("texture unavailable"));
    await expect(scene.playSandboxReplay(replay)).rejects.toThrow("texture unavailable");
    expect(scene.hydrateSceneState).not.toHaveBeenCalled();
    expect(scene.setReplayPlaybackActive).toHaveBeenLastCalledWith(false);
    expect(scene.replayRecordingSuspended).toBe(false);
});

test("a replay opens on the fight-start board built once, then holds it before the first move", async () => {
    const { scene, replay, textures, pending } = fixture();
    const placementStates = Array.from({ length: 40 }, (_, index) => ({ units: [], currentLap: 0, step: index }));
    const fightStart = { units: [], currentLap: 1, fightStarted: true };
    const afterMove = { units: [], currentLap: 1, fightStarted: true, moved: true };
    replay.actions = [
        // Game 9208870e opened with about forty placement records: unit drops, barrel moves and augments.
        ...placementStates.map((stateAfter, index) => ({
            sequence: index + 1,
            clientTimeMs: index,
            action:
                index % 2
                    ? { type: "place_barrel", team: 1, barrelIndex: 0, cell: { x: 1, y: index % 3 } }
                    : { type: "place_unit", unitId: "a", team: 1, cells: [{ x: 1, y: 1 }] },
            events: [],
            stateAfter,
        })),
        { sequence: 41, clientTimeMs: 41, action: { type: "start_fight" }, events: [], stateAfter: fightStart },
        {
            sequence: 42,
            clientTimeMs: 42,
            action: { type: "move_unit", unitId: "a", path: [{ x: 2, y: 1 }] },
            events: [],
            stateAfter: afterMove,
        },
    ] as unknown as SandboxReplay["actions"];
    const hold = deferred();
    let delays = 0;
    scene.delayReplay = mock(() => (delays++ === 0 ? hold.promise : Promise.resolve()));
    scene.onReplayRecordSettling = mock(() => {});
    scene.onReplayRecordPresented = mock(() => {});
    scene.onReplayCompleted = mock(() => {});
    scene.playSandboxReplayRecord = mock(async () => true);
    const opened = deferred();
    const onOpeningShown = mock(() => opened.resolve());

    const playback = scene.playSandboxReplay(replay, undefined, { onOpeningShown });
    textures.resolve();
    await textures.promise;
    await Promise.resolve();
    // The board is built, but its map art is still loading: the cover stays up.
    expect(scene.hydrateSceneState).toHaveBeenCalledTimes(1);
    expect(onOpeningShown).not.toHaveBeenCalled();
    pending.resolve();
    await opened.promise;

    // One build, of the board the fight began on; none of the forty placement boards is ever drawn.
    expect(scene.hydrateSceneState).toHaveBeenCalledTimes(1);
    expect(scene.hydrateSceneState.mock.calls[0][0]).toEqual(fightStart);
    expect(scene.preloadTextureKeys.mock.calls[0][1]).toEqual({ priority: "visible" });
    expect(scene.onReplayRecordPresented).toHaveBeenCalledTimes(1);
    expect(scene.onReplayRecordPresented.mock.calls[0][0]).toBe(replay.actions[40]);
    expect(scene.playSandboxReplayRecord).not.toHaveBeenCalled();

    hold.resolve();
    expect(await playback).toBe(true);
    // The first move plays on the opening board as it stands, without another rebuild.
    expect(scene.playSandboxReplayRecord).toHaveBeenCalledTimes(1);
    expect(scene.playSandboxReplayRecord.mock.calls[0][0]).toBe(replay.actions[41]);
    expect(scene.hydrateSceneState.mock.calls.map(([state]: [unknown]) => state)).toEqual([
        fightStart,
        afterMove,
        afterMove,
    ]);
});

test("the cover lifts only once the first exchange's sheets are loaded, so the board never stands frozen", async () => {
    const { scene, replay, textures, pending } = fixture();
    const units = ["Wolf", "Orc"].map((name) => ({ properties: { id: name, name } }));
    const fightStart = { units, currentLap: 1, fightStarted: true };
    replay.initialState.units = units as typeof replay.initialState.units;
    replay.actions = [
        { sequence: 1, clientTimeMs: 1, action: { type: "start_fight" }, events: [], stateAfter: fightStart },
        {
            sequence: 2,
            clientTimeMs: 2,
            action: { type: "move_unit", unitId: "Wolf", path: [{ x: 2, y: 1 }] },
            events: [],
            stateAfter: fightStart,
        },
    ] as unknown as SandboxReplay["actions"];
    const wolfWalk = approvedAnimationAssetKeysForUnit("Wolf").find((key) => key.includes("_walk_"))!;
    const firstExchange = deferred();
    scene.preloadTextureKeys = mock((keys: string[]) =>
        keys.includes(wolfWalk) ? firstExchange.promise : textures.promise,
    );
    scene.delayReplay = mock(() => Promise.resolve());
    scene.onReplayRecordSettling = mock(() => {});
    scene.onReplayRecordPresented = mock(() => {});
    scene.onReplayCompleted = mock(() => {});
    scene.playSandboxReplayRecord = mock(async () => true);
    const onOpeningShown = mock(() => {});

    const playback = scene.playSandboxReplay(replay, undefined, { onOpeningShown });
    textures.resolve();
    pending.resolve();
    await new Promise((done) => setTimeout(done, 0));
    // Board and map are ready, but the first move's sheets are not: still covered, and the battle log is empty
    // (a log with entries shows "Copy battle log", which the deploy smoke check takes as "playback started").
    expect(scene.hydrateSceneState).toHaveBeenCalledTimes(1);
    expect(scene.preloadTextureKeys.mock.calls[1][1]).toEqual({ priority: "visible" });
    expect(onOpeningShown).not.toHaveBeenCalled();
    expect(scene.onReplayRecordPresented).not.toHaveBeenCalled();
    expect(scene.sc_sceneLog.clear).not.toHaveBeenCalled();

    firstExchange.resolve();
    expect(await playback).toBe(true);
    expect(onOpeningShown).toHaveBeenCalledTimes(1);
    expect(scene.onReplayRecordPresented.mock.calls[0][0]).toBe(replay.actions[0]);
    expect(scene.playSandboxReplayRecord.mock.calls[0][0]).toBe(replay.actions[1]);
});
