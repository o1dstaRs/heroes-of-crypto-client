import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../../pixi/imageAssetTiers";
import { commonFlagFrameAt } from "./CommonFlagPops";
import { ParalysisPops } from "./ParalysisPops";

const meta = animationAtlases["Vfx Paralysis"].pop;

test("paralysis uses nine icon-derived cels, exact one-second timing and lazy production assets", () => {
    expect(images.vfx_paralysis_pop_atlas).toBeString();
    expect(meta.frameCount).toBe(9);
    expect(meta.frameWidth).toBe(384);
    expect(meta.frameHeight).toBe(384);
    let elapsed = 0;
    for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
        expect(commonFlagFrameAt("paralysis", elapsed)).toBe(frame);
        expect(commonFlagFrameAt("paralysis", elapsed + duration - 0.01)).toBe(frame);
        elapsed += duration;
    }
    expect(elapsed).toBe(1000);
    expect(commonFlagFrameAt("paralysis", elapsed)).toBeUndefined();
    for (const key of ["vfx_paralysis_pop_atlas", "vfx_paralysis_pop_atlas_quarter"]) {
        expect(isLazyCombatEffectAssetKey(key)).toBe(true);
        expect(isProductionOmittedAssetKey(key)).toBe(false);
    }
});

test("paralysis follows the live flag, coalesces hits and expires using Ogre Mage's atlas playback", async () => {
    const root = new Container();
    root.scale.set(0.8, -0.5);
    const atlas = new Texture({ source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    let now = 0;
    let anchor: { x: number; y: number } | undefined = { x: 120, y: 300 };
    const pops = new ParalysisPops(
        (node) => {
            root.addChild(node);
        },
        () => now,
    );
    try {
        await Promise.all([pops.spawn("victim", 64, () => anchor), pops.spawn("victim", 64, () => anchor)]);
        expect(load.mock.calls[0][0] as unknown).toBe(images.vfx_paralysis_pop_atlas);
        expect(root.children).toHaveLength(1);
        const pop = root.children[0];
        const sprite = pop.children[0] as Sprite;
        const first = sprite.texture;
        expect(sprite.anchor.y).toBe(1);
        expect(sprite.width).toBeCloseTo(64 * 1.45 * 0.9);
        now = 500;
        anchor = { x: 200, y: 400 };
        pops.update();
        expect(pop.x).toBe(200);
        expect(pop.y).toBeCloseTo(400 + 64 * 0.07);
        expect(pop.scale.y).toBeCloseTo(-1.6);
        expect(sprite.texture).not.toBe(first);
        now = 1800;
        pops.update();
        expect(pop.destroyed).toBe(true);
        await pops.spawn("victim", 64, () => anchor);
        anchor = undefined;
        pops.update();
        expect(root.children).toHaveLength(0);
    } finally {
        pops.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
    }
});
