import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { HoCLib } from "@heroesofcrypto/common";
import { BlurFilter, Container, DOMAdapter, Sprite, Texture } from "pixi.js";

import { Sandbox } from "./Sandbox";

interface LifecycleScene {
    spellBookBlurFilter?: BlurFilter;
    spellBookBackground?: Sprite;
    setSpellBookWorldBlur(active: boolean): void;
    updateVisibleTurnTimerIfDue(): void;
    Destroy(): void;
}

// BlurFilter probes shader precision through a canvas; headless tests have none to offer.
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const roots: Container[] = [];
afterEach(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
    for (const root of roots.splice(0)) root.destroy({ children: true });
});

const fixture = () => {
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: { removeEventListener: () => undefined },
    });
    const [worldRoot, camera, cursorOverlay, ui] = Array.from({ length: 4 }, () => new Container());
    roots.push(worldRoot, camera, cursorOverlay, ui);
    const collaborators = {
        aiController: { destroy: mock() },
        replayRecorder: { dispose: mock() },
        moveAnimManager: { cancel: mock() },
        placementManager: { releaseVisuals: mock() },
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        ...collaborators,
        atlasTexturePrewarmer: { destroy: () => undefined },
        clearSandboxPremiumGuidance: () => undefined,
        combatVisuals: { clear: () => undefined },
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
    }) as LifecycleScene;
    return { scene, worldRoot, collaborators };
};

describe("Sandbox lifecycle", () => {
    test("refreshes the visible turn clock at most every 500 ms", () => {
        let now = 10_000;
        const clock = spyOn(HoCLib, "getTimeMillis").mockImplementation(() => now);
        const updateVisibleTurnTimer = mock();
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            nextVisibleTurnTimerUpdateMs: 0,
            updateVisibleTurnTimer,
        }) as LifecycleScene;
        try {
            for (const [advance, calls] of [
                [0, 1],
                [499, 1],
                [1, 2],
                [250, 2],
                [250, 3],
            ]) {
                now += advance;
                scene.updateVisibleTurnTimerIfDue();
                expect(updateVisibleTurnTimer).toHaveBeenCalledTimes(calls);
            }
        } finally {
            clock.mockRestore();
        }
    });

    test("routes delayed work through the scene-owned timer registry so a replaced scene cannot fire", () => {
        // Raw timers outlive Destroy(); scheduleSceneTimeout/delayForScene are cancelled with the scene.
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        expect(source).not.toMatch(/\b(?:globalThis\.)?setTimeout\(/);
        expect(source).not.toMatch(/\b(?:globalThis\.)?clearTimeout\(/);
        expect(source).not.toMatch(/\b(?:globalThis\.)?setInterval\(|HoCLib\.interval\(/);
    });

    test("toggles one reused spellbook blur filter on the world root", () => {
        const { scene, worldRoot } = fixture();
        scene.setSpellBookWorldBlur(true);
        const filter = scene.spellBookBlurFilter;
        expect(filter).toBeInstanceOf(BlurFilter);
        expect(worldRoot.filters).toEqual([filter!]);
        scene.setSpellBookWorldBlur(true);
        expect(worldRoot.filters).toEqual([filter!]);
        scene.setSpellBookWorldBlur(false);
        expect(worldRoot.filters ?? []).toEqual([]);
        scene.setSpellBookWorldBlur(true);
        expect(scene.spellBookBlurFilter).toBe(filter);
        expect(worldRoot.filters).toEqual([filter!]);
        filter!.destroy();
    });

    test("Destroy releases the scene's collaborators, spellbook artwork and a detached blur filter", () => {
        const { scene, collaborators } = fixture();
        const background = new Sprite(Texture.WHITE);
        scene.spellBookBackground = background;
        // Closed book: the filter is retained but no longer installed, so the root cannot release it.
        scene.setSpellBookWorldBlur(true);
        scene.setSpellBookWorldBlur(false);
        const filter = scene.spellBookBlurFilter!;
        const destroyFilter = spyOn(filter, "destroy");

        scene.Destroy();

        for (const collaborator of Object.values(collaborators)) {
            for (const release of Object.values(collaborator)) expect(release).toHaveBeenCalledTimes(1);
        }
        expect(background.destroyed).toBe(true);
        expect(scene.spellBookBackground).toBeUndefined();
        expect(destroyFilter).toHaveBeenCalledTimes(1);
        expect(scene.spellBookBlurFilter).toBeUndefined();
    });
});
