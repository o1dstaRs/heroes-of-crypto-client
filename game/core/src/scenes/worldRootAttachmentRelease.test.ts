/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { Container, Graphics } from "pixi.js";

import { Sandbox } from "./Sandbox";

/**
 * A replaced scene must take its world-root children with it.
 *
 * The world root belongs to the pixiApp, and LoadGame destroys the scene while building the replacement
 * against that SAME app — so anything parented there outlives its owner. An orphan keeps painting its
 * last frame while the fresh scene clears only its own graphics, which is how a finished sandbox fight
 * left its movement area drawn over the next battle's placement board.
 *
 * Two of these were disposed by hand (dungeonVisuals, combatVisuals) and the other dozen were not — a
 * list kept by hand falls behind. Release is now driven from the single attach choke point.
 */
interface AttachingScene {
    attachToWorldRoot(obj: Container, zIndex: number): void;
    Destroy(): void;
}

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const roots: Container[] = [];
afterEach(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
    for (const root of roots.splice(0)) root.destroy({ children: true });
});

describe("world-root attachments are released with the scene", () => {
    test("Destroy detaches and frees every attached layer, tolerating one its own disposer already freed", () => {
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            writable: true,
            value: { removeEventListener: () => undefined },
        });
        const [worldRoot, camera, cursorOverlay, ui] = Array.from({ length: 4 }, () => new Container());
        roots.push(worldRoot, camera, cursorOverlay, ui);
        const movementSheet = new Graphics();
        const rangeOverlay = new Container();
        const terrain = new Container();
        const unrelated = new Container();
        worldRoot.addChild(unrelated);
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            aiController: { destroy: () => undefined },
            moveAnimManager: { cancel: () => undefined },
            placementManager: { releaseVisuals: () => undefined },
            atlasTexturePrewarmer: { destroy: () => undefined },
            clearSandboxPremiumGuidance: () => undefined,
            combatVisuals: { clear: () => undefined },
            // DungeonVisuals disposes its own layers before the shared release runs.
            dungeonVisuals: { destroy: () => terrain.destroy() },
            worldRootAttachments: new Set<Container>(),
            pixiApp: {
                getWorldRoot: () => worldRoot,
                getCamera: () => camera,
                getCursorOverlayRoot: () => cursorOverlay,
                getUIContainer: () => ui,
            },
            textures: {},
            sc_destroyed: false,
            sc_boardImageRetryTimers: new Set(),
            sc_sceneTimeouts: new Map(),
            sc_lazyTextureUrls: new Map(),
            sc_pendingLazyTextureKeys: new Set(),
        }) as AttachingScene;

        scene.attachToWorldRoot(movementSheet, 55);
        scene.attachToWorldRoot(rangeOverlay, 56);
        scene.attachToWorldRoot(terrain, 20);
        scene.attachToWorldRoot(movementSheet, 57);
        expect(worldRoot.children).toEqual([unrelated, movementSheet, rangeOverlay, terrain]);

        expect(() => scene.Destroy()).not.toThrow();

        expect(worldRoot.children).toEqual([unrelated]);
        for (const layer of [movementSheet, rangeOverlay, terrain]) expect(layer.destroyed).toBe(true);
        expect(unrelated.destroyed).toBe(false);
    });

    test("no world-root child is left to a hand-maintained disposal list", () => {
        // If someone adds a layer, attachToWorldRoot records it automatically. The guard here is that the
        // helper stays the ONLY way anything reaches the root, so nothing can bypass the bookkeeping.
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const direct = source.match(/getWorldRoot\(\)\.addChild\(/g) ?? [];
        // The single permitted addChild lives inside attachToWorldRoot itself.
        const insideHelper =
            source
                .slice(
                    source.indexOf("private attachToWorldRoot("),
                    source.indexOf("private releaseWorldRootAttachments("),
                )
                .match(/worldRoot\.addChild\(/g) ?? [];
        expect(direct.length).toBe(0);
        expect(insideHelper.length).toBe(1);
    });
});
