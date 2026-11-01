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
