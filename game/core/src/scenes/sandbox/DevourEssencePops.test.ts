import { describe, expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";
import { isUnitAnimationAtlasKey } from "../../pixi/unitAtlasKeys";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../../pixi/productionImageAssetPolicy";
import { DevourEssencePops, devourEssenceFrameAt } from "./DevourEssencePops";
import { CombatVisuals } from "./CombatVisuals";

describe("painted Devour Essence flag cue", () => {
    test("plays all authored cels inside one real second and remains a production VFX asset", () => {
        const meta = animationAtlases["Vfx Devour Essence"].short;
        expect(meta.frameCount).toBe(16);
        expect(meta.frameWidth).toBe(384);
        expect(meta.frameHeight).toBe(384);
        expect(meta.loopDurationMs).toBe(1000);
        expect(meta.pauseMs).toBe(0);
        let time = 0;
        for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
            expect(devourEssenceFrameAt(time)).toBe(frame);
            expect(devourEssenceFrameAt(time + duration - 0.01)).toBe(frame);
            time += duration;
        }
        expect(time).toBe(1000);
        expect(devourEssenceFrameAt(-1)).toBe(0);
        expect(devourEssenceFrameAt(1000)).toBeUndefined();
        expect(devourEssenceFrameAt(2000)).toBeUndefined();
        expect(isUnitAnimationAtlasKey("vfx_devour_essence_short_atlas")).toBe(false);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey("vfx_devour_essence_short_atlas")).toBe(false);
    });

    test("coalesces repeated healing entries, follows the flag, keeps exact peer VFX scale, and expires with paused scene time", async () => {
        const atlas = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
        const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        root.scale.set(0.8, -0.5);
        let now = 0;
        let anchor: { x: number; y: number } | undefined = { x: 100, y: 200 };
        const layer = new DevourEssencePops(
            (container) => root.addChild(container),
            () => now,
        );
        try {
            await Promise.all([
                layer.spawn("enemy", anchor, 64, () => anchor),
                layer.spawn("enemy", anchor, 64, () => anchor),
            ]);
            expect(load).toHaveBeenCalledTimes(1);
            expect<unknown>(load.mock.calls[0][0]).toBe(images.vfx_devour_essence_short_atlas);
            expect(root.children).toHaveLength(1);
            const pop = root.children[0];
            const sprite = pop.children[0] as Sprite;
            expect(sprite.width).toBeCloseTo(64 * 1.45 * 0.9);
            const scale = { x: sprite.scale.x, y: sprite.scale.y };
            anchor = { x: 150, y: 250 };
            now = 500;
            layer.update(0);
            expect(pop.x).toBe(150);
            expect(pop.y).toBeCloseTo(250 + 64 * 0.07);
            expect(pop.scale.y).toBeCloseTo(-1.6);
            expect(sprite.scale.x).toBe(scale.x);
            expect(sprite.scale.y).toBe(scale.y);
            expect(pop.alpha).toBe(1); // Pixel-authored appearance/fade, no engine deformation.
            now = 1800;
            layer.update(0);
            expect(layer.active).toBe(false);
            expect(pop.destroyed).toBe(true);
            expect(atlas.destroyed).toBe(false);
            await layer.spawn("enemy", anchor, 64, () => anchor);
            anchor = undefined;
            layer.update(0);
            expect(layer.active).toBe(false);
        } finally {
            layer.clear();
            await Promise.resolve();
            load.mockRestore();
            unload.mockRestore();
        }
    });

    test("teardown cancels pending loads; a failed load can retry", async () => {
        let resolve!: (texture: Texture) => void;
        const load = spyOn(Assets, "load").mockReturnValue(
            new Promise<Texture>((done) => {
                resolve = done;
            }) as unknown as Promise<Record<string, unknown>>,
        );
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        const layer = new DevourEssencePops((container) => root.addChild(container));
        try {
            const pending = layer.spawn("enemy", { x: 0, y: 0 }, 64);
            layer.clear();
            resolve(Texture.WHITE);
            await pending;
            expect(root.children).toHaveLength(0);
            load.mockRejectedValueOnce(new Error("decode failed"));
            await layer.spawn("enemy", { x: 0, y: 0 }, 64);
            expect(layer.active).toBe(false);
            load.mockResolvedValueOnce(
                new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) }) as unknown as Record<
                    string,
                    unknown
                >,
            );
            await layer.spawn("enemy", { x: 0, y: 0 }, 64);
            expect(layer.active).toBe(true);
        } finally {
            layer.clear();
            await Promise.resolve();
            load.mockRestore();
            unload.mockRestore();
        }
    });

    test("ranked hydration preserves the cue and reacquires the rebuilt recipient", async () => {
        let now = 0;
        const clock = spyOn(performance, "now").mockImplementation(() => now);
        const atlas = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
        const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        const makeUnit = (x: number, y: number, dead = false) => ({
            getId: () => "enemy",
            isDead: () => dead,
            getFlagEffectAnchor: () => ({ x, y }),
        });
        const units = new Map([["enemy", makeUnit(100, 200)]]);
        const visuals = new CombatVisuals({
            getGridSettings: () => ({ getCellSize: () => 64 }) as GridSettings,
            getUnitsHolder: () => ({ getAllUnits: () => units }) as unknown as UnitsHolder,
            attachToWorldRoot: (container: Container) => root.addChild(container),
            getSelectedUnitProperties: () => undefined,
            updateSelectedUnitProperties: () => undefined,
            setUnitPropertiesUpdateNeeded: () => undefined,
        });
        try {
            visuals.spawnDevourEssencePop(
                units.get("enemy")! as unknown as Parameters<CombatVisuals["spawnDevourEssencePop"]>[0],
            );
            await Promise.resolve();
            await Promise.resolve();
            expect(root.children).toHaveLength(1);
            const pop = root.children[0];
            visuals.clear({ keepDetachedOverlays: true });
            units.set("enemy", makeUnit(150, 250));
            now = 500;
            visuals.update(0);
            expect(pop.destroyed).toBe(false);
            expect(pop.x).toBe(150);
            expect(pop.y).toBeCloseTo(250 + 6);
            units.set("enemy", makeUnit(150, 250, true));
            visuals.update(0);
            expect(pop.destroyed).toBe(true);
            expect(root.children).toHaveLength(0);
        } finally {
            visuals.clear();
            await Promise.resolve();
            load.mockRestore();
            unload.mockRestore();
            clock.mockRestore();
        }
    });
});
