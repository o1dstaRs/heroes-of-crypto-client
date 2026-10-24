import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { animationAtlases } from "../generated/animation_atlases";
import { CommonFlagPops } from "./sandbox/CommonFlagPops";
import { Sandbox } from "./Sandbox";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";

test("Aggr uses a painted flag cue on the affected living unit, without generic icon text", () => {
    const calls: unknown[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        combatVisuals: { spawnCommonFlagPop: (...a: unknown[]) => calls.push(a) },
    });
    const unit = { isDead: () => false };
    scene.popEffectOnUnit(unit, "Aggr", 0, "debuff");
    expect(calls).toEqual([[unit, "aggr"]]);
    scene.popEffectOnUnit({ isDead: () => true }, "Aggr", 0, "debuff");
    expect(calls).toHaveLength(1);
    expect(canPreviewCreatureLabState({ name: "Pikeman", abilities: ["Aggr"], spells: [] }, "aggr")).toBe(true);
    expect(canPreviewCreatureLabState({ name: "Peasant", abilities: [], spells: [] }, "aggr")).toBe(false);
});

test("all 12 cels follow the recipient's flag and release frame views after 650ms", async () => {
    const meta = animationAtlases["Vfx Aggr"].pop;
    expect(meta.frameCount).toBe(12);
    expect(meta.frameDurationsMs!.reduce((a, b) => a + b, 0)).toBe(650);
    expect(isLazyCombatEffectAssetKey("vfx_aggr_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_aggr_pop_atlas")).toBe(false);
    const atlas = new Texture({ source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    let now = 0;
    const anchor = { x: 100, y: 200 };
    const layer = new CommonFlagPops(
        "aggr",
        (c) => root.addChild(c),
        () => now,
    );
    try {
        await layer.spawn("victim", anchor, 64, () => anchor);
        now = 300;
        anchor.x = 140;
        layer.update(0);
        expect(root.children[0].x).toBe(140);
        expect((root.children[0].children[0] as Sprite).texture.frame.y).toBe(384);
        now = 650;
        layer.update(0);
        expect(layer.active).toBe(false);
        expect(root.children).toHaveLength(0);
        expect(atlas.source.destroyed).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
        root.destroy();
        atlas.destroy(true);
    }
});
