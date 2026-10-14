import { expect, mock, test } from "bun:test";

import type { SandboxReplay } from "../replay/sandbox_replay";
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
    scene.waitForPendingTextures = mock(() => pending.promise);
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

test("replay waits for creature/effect textures, then hydration textures, before presenting", async () => {
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
    expect(scene.setReplayPlaybackActive).toHaveBeenLastCalledWith(false);
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
