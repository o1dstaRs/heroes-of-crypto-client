import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, spyOn, test } from "bun:test";
import { Assets, Container, Texture } from "pixi.js";
import { PixiScene } from "./PixiScene";
import { boardFirstTextureLoads, type TextureLoadOptions } from "./boardFirstTextureLoads";

const SceneConstructor = PixiScene as unknown as new (settings: object) => {
    textures: Record<string, Texture>;
    texAny(key: string, options?: TextureLoadOptions): Texture | undefined;
    sc_destroyed: boolean;
    onSupplementaryTexturesLoaded?: () => void;
    scheduleSupplementaryTextureRefresh(): void;
    scheduleBoardImageRetry(url: string): void;
    pixiApp: {
        getWorldRoot(): Container;
        getCamera(): Container;
        getUIContainer(): Container;
        getCursorOverlayRoot(): Container;
    };
    Destroy(): void;
};

test("loads deferred full-body portraits on demand and reuses their decoded textures", async () => {
    const scene = new SceneConstructor({});
    scene.textures = {};
    const load = spyOn(Assets, "load").mockImplementation((async () => Texture.WHITE) as typeof Assets.load);
    const keys = ["orc_model_full", "manticore_left_screen_x2_green_cleanup_v2"];
    try {
        expect(load).not.toHaveBeenCalled();
        for (const key of keys) {
            expect(scene.texAny(key, { priority: "visible" })).toBeUndefined();
            expect(scene.texAny(key, { priority: "visible" })).toBeUndefined();
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(load).toHaveBeenCalledTimes(keys.length);
        for (const key of keys) expect(scene.texAny(key, { priority: "visible" })).toBe(Texture.WHITE);
        expect(load).toHaveBeenCalledTimes(keys.length);
    } finally {
        scene.sc_destroyed = true;
        load.mockRestore();
    }
});

test("a new scene promotes a shared visible texture without restarting its queued download", async () => {
    const first = new SceneConstructor({});
    const second = new SceneConstructor({});
    first.textures = {};
    second.textures = {};
    const releases: Array<() => void> = [];
    const blockers = [0, 1].map(() =>
        boardFirstTextureLoads.load("optional blocker", () => new Promise<void>((resolve) => releases.push(resolve))),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const load = spyOn(Assets, "load").mockImplementation((async () => Texture.WHITE) as typeof Assets.load);
    try {
        expect(first.texAny("units_overlay_toggle_square_v1")).toBeUndefined();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(load).not.toHaveBeenCalled();
        expect(second.texAny("units_overlay_toggle_square_v1", { priority: "visible", group: {} })).toBeUndefined();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(load).toHaveBeenCalledTimes(1);
        expect(first.texAny("units_overlay_toggle_square_v1")).toBe(Texture.WHITE);
        expect(second.texAny("units_overlay_toggle_square_v1")).toBe(Texture.WHITE);
    } finally {
        releases.forEach((release) => release());
        await Promise.all(blockers);
        first.sc_destroyed = true;
        second.sc_destroyed = true;
        load.mockRestore();
    }
});

test("publishes arriving textures immediately but coalesces refreshes and retries into one owned frame", async () => {
    const originalRequest = globalThis.requestAnimationFrame;
    const originalCancel = globalThis.cancelAnimationFrame;
    const frames = new Map<number, FrameRequestCallback>();
    const cancelled: number[] = [];
    let nextFrame = 0;
    globalThis.requestAnimationFrame = (callback) => {
        const handle = ++nextFrame;
        frames.set(handle, callback);
        return handle;
    };
    globalThis.cancelAnimationFrame = (handle) => {
        cancelled.push(handle);
        frames.delete(handle);
    };
    const scene = new SceneConstructor({});
    scene.textures = {};
    const containers = Array.from({ length: 4 }, () => new Container());
    scene.pixiApp = {
        getWorldRoot: () => containers[0],
        getCamera: () => containers[1],
        getUIContainer: () => containers[2],
        getCursorOverlayRoot: () => containers[3],
    };
    let refreshes = 0;
    scene.onSupplementaryTexturesLoaded = () => {
        refreshes++;
    };
    const load = spyOn(Assets, "load").mockImplementation((async () => Texture.WHITE) as typeof Assets.load);
    try {
        for (const key of ["wolf_512", "griffin_512", "skeleton_512"]) {
            expect(scene.texAny(key, { priority: "visible" })).toBeUndefined();
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(load).toHaveBeenCalledTimes(3);
        expect(Object.values(scene.textures)).toEqual([Texture.WHITE, Texture.WHITE, Texture.WHITE]);
        expect(refreshes).toBe(0);
        expect(frames.size).toBe(1);
        frames.get(1)!(0);
        frames.delete(1);
        expect(refreshes).toBe(1);
        scene.scheduleBoardImageRetry("first retry");
        scene.scheduleBoardImageRetry("second retry");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(frames.size).toBe(1);
        const retiredCallback = frames.get(2)!;
        scene.Destroy();
        expect(cancelled).toEqual([2]);
        expect(frames.size).toBe(0);
        retiredCallback(0);
        expect(refreshes).toBe(1);
    } finally {
        scene.Destroy();
        load.mockRestore();
        globalThis.requestAnimationFrame = originalRequest;
        globalThis.cancelAnimationFrame = originalCancel;
        containers.forEach((container) => container.destroy());
    }
});

test("refreshes synchronously when no browser frame scheduler is available", () => {
    const originalRequest = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = undefined as unknown as typeof requestAnimationFrame;
    const scene = new SceneConstructor({});
    let refreshes = 0;
    scene.onSupplementaryTexturesLoaded = () => {
        refreshes++;
    };
    try {
        scene.scheduleSupplementaryTextureRefresh();
        scene.scheduleSupplementaryTextureRefresh();
        expect(refreshes).toBe(2);
        scene.sc_destroyed = true;
        scene.scheduleSupplementaryTextureRefresh();
        expect(refreshes).toBe(2);
    } finally {
        scene.sc_destroyed = true;
        globalThis.requestAnimationFrame = originalRequest;
    }
});

describe("PixiScene teardown", () => {
    test("reuses one viewport result on the 240 Hz visual path", () => {
        const source = readFileSync(join(import.meta.dir, "PixiScene.ts"), "utf8");
        const viewportGetter = source.slice(
            source.indexOf("public getViewportSize()"),
            source.indexOf("// ------- Drawer"),
        );

        expect(source).toContain("private readonly sc_viewportSize");
        expect(viewportGetter).toContain("return this.sc_viewportSize");
        expect(viewportGetter).not.toContain("return { width:");
    });

    test("releases scene-owned children from both persistent app overlay roots", () => {
        const source = readFileSync(join(import.meta.dir, "PixiScene.ts"), "utf8");
        const destroy = source.slice(source.indexOf("public Destroy()"), source.indexOf("// ------- Delegates"));

        expect(destroy).toContain("destroyContainerChildren(this.pixiApp.getCursorOverlayRoot())");
        expect(destroy).toContain("destroyContainerChildren(this.pixiApp.getUIContainer())");
        expect(destroy.indexOf("getUIContainer()")).toBeLessThan(destroy.indexOf("this.drawer.destroy()"));
    });

    test("hands a board it mirrored back, so the next scene starts with the true sides", () => {
        const source = readFileSync(join(import.meta.dir, "PixiScene.ts"), "utf8");
        const destroy = source.slice(source.indexOf("public Destroy()"), source.indexOf("// ------- Delegates"));

        expect(destroy).toContain("releaseBoardMirror(this)");
    });

    test("cancels scene-owned delayed work before tearing down Pixi resources", () => {
        const source = readFileSync(join(import.meta.dir, "PixiScene.ts"), "utf8");
        const destroy = source.slice(source.indexOf("public Destroy()"), source.indexOf("// ------- Delegates"));

        expect(source).toContain("private readonly sc_sceneTimeouts");
        expect(source).toContain("protected scheduleSceneTimeout(");
        expect(source).toContain("protected delayForScene(");
        expect(destroy).toContain("this.cancelSceneTimeouts()");
        expect(destroy.indexOf("cancelSceneTimeouts()")).toBeLessThan(destroy.indexOf("releaseLazyTextures()"));
    });

    test("releases scene-leased creature, map, effect, ability, and spell textures before persistent roots are cleared", () => {
        const source = readFileSync(join(import.meta.dir, "PixiScene.ts"), "utf8");
        const destroy = source.slice(source.indexOf("public Destroy()"), source.indexOf("// ------- Delegates"));

        expect(destroy).toContain("this.releaseLazyTextures()");
        expect(destroy.indexOf("releaseLazyTextures()")).toBeLessThan(destroy.indexOf("destroyContainerChildren"));
        expect(source).toContain("isLazyBattlefieldCreatureAssetKey(key)");
        expect(source).toContain("isLazyCombatEffectAssetKey(key)");
        expect(source).toContain("isLazyMapTextureAssetKey(key)");
        expect(source).toContain("isLazyAbilityAssetKey(key)");
        expect(source).toContain("isLazySpellAssetKey(key)");
        expect(source).toContain("this.releaseLateUnclaimedTexture(key, url)");
    });
});
