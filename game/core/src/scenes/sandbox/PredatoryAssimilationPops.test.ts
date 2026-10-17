import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { assimilationPose, PredatoryAssimilationPops } from "./PredatoryAssimilationPops";
import { isLazyCombatEffectAssetKey } from "../../pixi/imageAssetTiers";
import { isUnitAnimationAtlasKey } from "../../pixi/unitAtlasKeys";

test("the claw captures before travel and releases before the stolen icon appears", async () => {
    let now = 0,
        arrivals = 0;
    const atlas = new Texture({ source: new TextureSource({ width: 1536, height: 768 }) });
    const icon = new Texture({ source: new TextureSource({ width: 256, height: 256 }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const world = new Container();
    world.scale.set(1.2, -0.8);
    const layer = new PredatoryAssimilationPops(
        (c) => {
            world.addChild(c);
        },
        () => now,
    );
    let flag = { x: 300, y: 200 };
    try {
        await layer.spawn(
            { x: 100, y: 200 },
            flag,
            64,
            icon,
            () => flag,
            () => arrivals++,
        );
        const root = world.children[0],
            [captured, claw, acquired] = root.children as Sprite[];
        expect(captured.texture).toBe(icon);
        expect(acquired.texture).toBe(icon);
        now = 380;
        layer.update(0);
        expect(root.x).toBe(100);
        expect(captured.alpha).toBe(1);
        expect(acquired.alpha).toBe(0);
        now = 700;
        layer.update(0);
        expect(root.x).toBeGreaterThan(100);
        expect(root.x).toBeLessThan(300);
        expect(acquired.alpha).toBe(0);
        now = 1100;
        layer.update(0);
        expect(root.x).toBe(300);
        expect(claw.alpha).toBeGreaterThan(0);
        expect(acquired.alpha).toBe(0);
        expect(arrivals).toBe(0);
        // A rebuilt recipient uses a new flag position; the running overlay follows it.
        flag = { x: 350, y: 250 };
        now = 1400;
        layer.update(0);
        expect(root.x).toBe(350);
        expect(root.y).toBeCloseTo(250 + 64 * 0.85);
        expect(root.scale.y).toBeCloseTo(-1.5);
        expect(claw.alpha).toBe(0);
        expect(acquired.alpha).toBe(1);
        expect(arrivals).toBe(1);
        now = 1600;
        layer.update(0);
        expect(arrivals).toBe(1);
        now = 2200;
        layer.update(0);
        expect(layer.active).toBe(false);
        expect(root.destroyed).toBe(true);
        expect(icon.destroyed).toBe(false);
        expect(atlas.destroyed).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
        world.destroy();
    }
});

test("scene teardown cancels an in-flight atlas load and does not flash a stolen card", async () => {
    let resolve!: (t: Texture) => void;
    const load = spyOn(Assets, "load").mockReturnValue(
        new Promise<Texture>((r) => (resolve = r)) as unknown as Promise<Record<string, unknown>>,
    );
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const world = new Container();
    let arrivals = 0;
    const layer = new PredatoryAssimilationPops((c) => {
        world.addChild(c);
    });
    try {
        const spawning = layer.spawn(
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            64,
            Texture.WHITE,
            () => ({ x: 100, y: 0 }),
            () => arrivals++,
        );
        layer.clear();
        resolve(Texture.WHITE);
        await spawning;
        expect(world.children).toHaveLength(0);
        expect(arrivals).toBe(0);
        expect(layer.active).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
        world.destroy();
    }
});

test("painted steal VFX remains available when creature animations are disabled", () => {
    expect(isLazyCombatEffectAssetKey("vfx_predatory_assimilation_grab_atlas")).toBe(true);
    expect(isUnitAnimationAtlasKey("vfx_predatory_assimilation_grab_atlas")).toBe(false);
    expect(assimilationPose(1200).clawAlpha).toBe(0);
    expect(assimilationPose(1199).acquiredAlpha).toBe(0);
});
