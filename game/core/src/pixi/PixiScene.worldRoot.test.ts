import { describe, expect, test } from "bun:test";
import { Container } from "pixi.js";

import { PixiScene } from "./PixiScene";

describe("shared battlefield root on scene replacement", () => {
    test("clears an interrupted screen shake before the next ranked board uses the root", () => {
        const worldRoot = new Container();
        worldRoot.scale.set(1, -1);
        worldRoot.position.set(12, -8);
        const camera = new Container();
        const cursorOverlay = new Container();
        const ui = new Container();
        const scene = Object.assign(Object.create(PixiScene.prototype), {
            sc_destroyed: false,
            sc_boardImageRetryTimers: new Set(),
            sc_sceneTimeouts: new Map(),
            sc_lazyTextureUrls: new Map(),
            sc_pendingLazyTextureKeys: new Set(),
            pixiApp: {
                getCamera: () => camera,
                getWorldRoot: () => worldRoot,
                getCursorOverlayRoot: () => cursorOverlay,
                getUIContainer: () => ui,
            },
        });

        scene.Destroy();

        expect(worldRoot.x).toBe(0);
        expect(worldRoot.y).toBe(0);
        expect(worldRoot.scale.y).toBe(-1);
        expect(worldRoot.destroyed).toBe(false);
        // Teardown is idempotent and cannot move a root already acquired by a replacement scene.
        worldRoot.position.set(3, 4);
        scene.Destroy();
        expect(worldRoot.x).toBe(3);
        expect(worldRoot.y).toBe(4);
        for (const container of [worldRoot, camera, cursorOverlay, ui]) container.destroy();
    });
});
