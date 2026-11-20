import { describe, expect, spyOn, test } from "bun:test";
import { Assets, Container, Texture, TextureSource } from "pixi.js";
import { PixiScene } from "./PixiScene";
import { isBoardMirrored, releaseBoardMirror, setBoardMirror } from "./boardMirror";
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
    const sceneWithApp = () => {
        const scene = new SceneConstructor({});
        scene.textures = {};
        const [world, camera, ui, cursor] = Array.from({ length: 4 }, () => new Container());
        const order: string[] = [];
        scene.pixiApp = {
            getWorldRoot: () => world,
            getCamera: () => camera,
            getUIContainer: () => ui,
            getCursorOverlayRoot: () => cursor,
        };
        const owned = scene as unknown as {
            drawer: { destroy(): void };
            scheduleSceneTimeout(callback: () => void, delayMs: number, onCancel?: () => void): unknown;
            delayForScene(delayMs: number): Promise<void>;
            sc_lazyTextureUrls: Map<string, string>;
        };
        owned.drawer = { destroy: () => order.push("drawer") };
        const dispose = () => {
            scene.Destroy();
            [world, camera, ui, cursor].forEach((container) => container.destroy({ children: true }));
        };
        return { scene, owned, ui, cursor, order, dispose };
    };
    const ownedChild = (host: Container, label: string, order: string[]) => {
        const child = host.addChild(new Container());
        const destroy = child.destroy.bind(child);
        child.destroy = (options) => {
            order.push(label);
            destroy(options);
        };
        return child;
    };

    test("reuses one viewport result on the 240 Hz visual path", () => {
        const scene = new SceneConstructor({});
        const renderer = { width: 800, height: 600 };
        (scene.pixiApp as unknown as { getApplication(): unknown }) = { getApplication: () => ({ renderer }) };
        const viewport = (scene as unknown as { getViewportSize(): { width: number; height: number } }).getViewportSize;
        try {
            const first = viewport.call(scene);
            expect(first).toEqual({ width: 800, height: 600 });
            renderer.width = 1024;
            const second = viewport.call(scene);
            expect(second).toBe(first);
            expect(second).toEqual({ width: 1024, height: 600 });
        } finally {
            scene.sc_destroyed = true;
        }
    });

    test("releases scene-owned children from both persistent app overlay roots before the drawer", () => {
        const { scene, ui, cursor, order, dispose } = sceneWithApp();
        try {
            ownedChild(cursor, "cursor overlay child", order);
            ownedChild(ui, "ui child", order);
            scene.Destroy();
            expect(cursor.children).toHaveLength(0);
            expect(ui.children).toHaveLength(0);
            expect(order).toEqual(["cursor overlay child", "ui child", "drawer"]);
        } finally {
            dispose();
        }
    });

    test("hands a board it mirrored back, so the next scene starts with the true sides", () => {
        const owner = sceneWithApp();
        const bystander = sceneWithApp();
        try {
            setBoardMirror(owner.scene, true);
            // A scene that never took the board over leaves the owner's mirror alone.
            bystander.scene.Destroy();
            expect(isBoardMirrored()).toBe(true);
            owner.scene.Destroy();
            expect(isBoardMirrored()).toBe(false);
        } finally {
            releaseBoardMirror(owner.scene);
            owner.dispose();
            bystander.dispose();
        }
    });

    test("cancels scene-owned delayed work before tearing down Pixi resources", async () => {
        const { scene, owned, order, dispose } = sceneWithApp();
        const unload = spyOn(Assets, "unload").mockImplementation((async () => {}) as typeof Assets.unload);
        try {
            owned.sc_lazyTextureUrls.set("leased", "leased.webp");
            let fired = false;
            owned.scheduleSceneTimeout(
                () => (fired = true),
                0,
                () => order.push(`timeout cancelled with ${owned.sc_lazyTextureUrls.size} lease`),
            );
            let delayed = false;
            const delay = owned.delayForScene(0).then(() => (delayed = true));
            scene.Destroy();
            expect(order[0]).toBe("timeout cancelled with 1 lease");
            expect(owned.sc_lazyTextureUrls.size).toBe(0);
            await delay;
            expect(delayed).toBe(true);
            await new Promise((resolve) => setTimeout(resolve, 5));
            expect(fired).toBe(false);
            // A retired scene runs no new delayed work either.
            let late = false;
            owned.scheduleSceneTimeout(
                () => (late = true),
                0,
                () => order.push("late cancelled"),
            );
            expect(order.at(-1)).toBe("late cancelled");
            await new Promise((resolve) => setTimeout(resolve, 5));
            expect(late).toBe(false);
        } finally {
            dispose();
            unload.mockRestore();
        }
    });

    test("releases scene-leased textures before persistent roots are cleared", async () => {
        const { scene, owned, ui, order, dispose } = sceneWithApp();
        const unload = spyOn(Assets, "unload").mockImplementation((async () => {}) as typeof Assets.unload);
        try {
            owned.sc_lazyTextureUrls.set("leased", "leased.webp");
            const child = ui.addChild(new Container());
            child.destroy = () => order.push(`ui child with ${owned.sc_lazyTextureUrls.size} leases`);
            scene.Destroy();
            expect(order).toEqual(["ui child with 0 leases", "drawer"]);
            await Promise.resolve();
            expect(unload).toHaveBeenCalledWith("leased.webp");
        } finally {
            dispose();
            unload.mockRestore();
        }
    });

    test("a scene-leased load that lands after teardown is unloaded", async () => {
        const key = "troll_board_128";
        const { scene, dispose } = sceneWithApp();
        let release: (texture: Texture) => void = () => undefined;
        const load = spyOn(Assets, "load").mockImplementation(
            (() => new Promise<Texture>((resolve) => (release = resolve))) as unknown as typeof Assets.load,
        );
        const unload = spyOn(Assets, "unload").mockImplementation((async () => {}) as typeof Assets.unload);
        try {
            expect(scene.texAny(key, { priority: "visible" })).toBeUndefined();
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(load).toHaveBeenCalledTimes(1);
            scene.Destroy();
            release(Texture.WHITE);
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(unload).toHaveBeenCalledTimes(1);
            expect(scene.textures[key]).toBeUndefined();
        } finally {
            dispose();
            load.mockRestore();
            unload.mockRestore();
        }
    });
});

// One key per scene-leased family: environment, combat effect, battlefield creature, map, ability and spell art.
test.each([
    "ambient_fire_video_torch_left_natural_v4_64_atlas",
    "book_1024_clean_pages_v1",
    "troll_board_128",
    "lava_center_anim_atlas",
    "limited_supply_256",
    "armor_augment_256",
])("Start over transfers the %s lease before the old scene evicts its texture", async (key) => {
    const first = new SceneConstructor({});
    const second = new SceneConstructor({});
    first.textures = {};
    second.textures = first.textures;
    const containers = Array.from({ length: 4 }, () => new Container());
    const app = {
        getWorldRoot: () => containers[0],
        getCamera: () => containers[1],
        getUIContainer: () => containers[2],
        getCursorOverlayRoot: () => containers[3],
    };
    first.pixiApp = app;
    second.pixiApp = app;
    const texture = new Texture({ source: new TextureSource({ width: 64, height: 64 }) });
    const load = spyOn(Assets, "load").mockImplementation((async () => texture) as typeof Assets.load);
    const unload = spyOn(Assets, "unload").mockImplementation((async () => {}) as typeof Assets.unload);
    try {
        first.texAny(key, { priority: "visible" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(first.texAny(key)).toBe(texture);
        first.Destroy();
        expect(second.texAny(key)).toBe(texture);
        await Promise.resolve();
        expect(unload).not.toHaveBeenCalled();
        second.Destroy();
        await Promise.resolve();
        expect(unload).toHaveBeenCalledTimes(1);
        expect(second.textures[key]).toBeUndefined();
    } finally {
        first.Destroy();
        second.Destroy();
        load.mockRestore();
        unload.mockRestore();
        texture.destroy(true);
        containers.forEach((container) => container.destroy());
    }
});
