import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { animationAtlases } from "../../generated/animation_atlases";
import { CommonFlagPops, commonFlagFrameAt } from "./CommonFlagPops";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../../pixi/imageAssetTiers";

const meta = animationAtlases["Vfx Common Lucky"].pop;

test("a cold Shadow Touch atlas cannot replay the suppression cue after the hit is over", async () => {
    let resolve!: (texture: Texture) => void;
    const load = spyOn(Assets, "load").mockReturnValue(
        new Promise<Texture>((done) => {
            resolve = done;
        }) as unknown as Promise<Record<string, unknown>>,
    );
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    let now = 0;
    const layer = new CommonFlagPops(
        "shadow_touch",
        (container) => root.addChild(container),
        () => now,
    );
    try {
        const pending = layer.spawn("victim", { x: 0, y: 0 }, 64);
        now = 901;
        resolve(new Texture({ source: new TextureSource({ width: 1536, height: 1152 }) }));
        await pending;
        expect(layer.active).toBe(false);
        expect(root.children).toHaveLength(0);
    } finally {
        layer.clear();
        await Promise.resolve();
        root.destroy({ children: true });
        load.mockRestore();
        unload.mockRestore();
    }
});

test("Shadow Touch follows its victim and expires in 650ms of real time", async () => {
    const meta = animationAtlases["Vfx Shadow Touch"].pop;
    expect(meta.frameCount).toBe(16);
    expect(meta.frameDurationsMs!.reduce((sum, ms) => sum + ms, 0)).toBe(900);
    expect(isLazyCombatEffectAssetKey("vfx_shadow_touch_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_shadow_touch_pop_atlas")).toBe(false);
    const atlas = new Texture({ source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    let now = 0;
    const anchor = { x: 100, y: 200 };
    const layer = new CommonFlagPops(
        "shadow_touch",
        (container) => root.addChild(container),
        () => now,
    );
    try {
        await layer.spawn("victim", anchor, 64, () => anchor);
        anchor.x = 160;
        now = 325;
        layer.update(0);
        expect(root.children[0].x).toBe(160);
        expect((root.children[0].children[0] as Sprite).texture.frame.y).toBe(768);
        now = 649;
        layer.update(0);
        expect(layer.active).toBe(true);
        now = 650;
        layer.update(0);
        expect(layer.active).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        root.destroy({ children: true });
        load.mockRestore();
        unload.mockRestore();
    }
});

test.each([false, true])(
    "a cold repeat-attack atlas drops stale cues and retains a newer strike: %s",
    async (thirdStrike) => {
        let resolve!: (texture: Texture) => void;
        const load = spyOn(Assets, "load").mockReturnValue(
            new Promise<Texture>((done) => {
                resolve = done;
            }) as unknown as Promise<Record<string, unknown>>,
        );
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        let now = 0;
        const layer = new CommonFlagPops(
            "multi_attack",
            (container) => root.addChild(container),
            () => now,
        );
        try {
            const pending = layer.spawn("unit", { x: 0, y: 0 }, 64);
            now = 700;
            if (thirdStrike) await layer.spawn("unit", { x: 0, y: 0 }, 64);
            now = 900;
            resolve(new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) }));
            await pending;
            expect(layer.active).toBe(thirdStrike);
            expect(root.children).toHaveLength(thirdStrike ? 1 : 0);
            now = 1500;
            layer.update(0);
            expect(layer.active).toBe(false);
        } finally {
            layer.clear();
            await Promise.resolve();
            root.destroy({ children: true });
            load.mockRestore();
            unload.mockRestore();
        }
    },
);

test("repeated attack normalizes 16 authored cels to 650ms and restarts on a third strike without stacking", async () => {
    const multi = animationAtlases["Vfx Multi Attack"].pop;
    expect(multi.frameCount).toBe(16);
    let elapsed = 0;
    for (const [i, duration] of multi.frameDurationsMs!.entries()) {
        expect(commonFlagFrameAt("multi_attack", elapsed)).toBe(i);
        elapsed += duration;
    }
    expect(elapsed).toBe(800);
    expect(isLazyCombatEffectAssetKey("vfx_multi_attack_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_multi_attack_pop_atlas")).toBe(false);
    const atlas = new Texture({ source: new TextureSource({ width: multi.atlasWidth, height: multi.atlasHeight }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    let now = 0;
    const layer = new CommonFlagPops(
        "multi_attack",
        (container) => root.addChild(container),
        () => now,
    );
    try {
        layer.preload();
        await layer.spawn("unit", { x: 100, y: 200 }, 64);
        const sprite = root.children[0].children[0] as Sprite;
        const first = sprite.texture;
        now = 500;
        layer.update(0);
        expect(sprite.texture).not.toBe(first);
        await layer.spawn("unit", { x: 150, y: 250 }, 64);
        expect(root.children).toHaveLength(1);
        expect(sprite.texture).toBe(first);
        expect(root.children[0].x).toBe(150);
        now = 1149;
        layer.update(0);
        expect(layer.active).toBe(true);
        now = 1150;
        layer.update(0);
        expect(layer.active).toBe(false);
        expect(load).toHaveBeenCalledTimes(1);
    } finally {
        layer.clear();
        await Promise.resolve();
        root.destroy({ children: true });
        load.mockRestore();
        unload.mockRestore();
    }
});

test.each(["empower", "dulling_defense", "enchanted_skin", "ogre_riot"] as const)(
    "%s status completes its painted cels in 650 ms",
    async (kind) => {
        const atlas = new Texture({ source: new TextureSource({ width: 4096, height: 4096 }) });
        const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        let now = 0;
        const layer = new CommonFlagPops(
            kind,
            (container) => root.addChild(container),
            () => now,
        );
        try {
            await layer.spawn("unit", { x: 0, y: 0 }, 64);
            now = 325;
            layer.update(0);
            expect(layer.active).toBe(true);
            now = 649;
            layer.update(0);
            expect(layer.active).toBe(true);
            now = 650;
            layer.update(0);
            expect(layer.active).toBe(false);
        } finally {
            layer.clear();
            root.destroy({ children: true });
            load.mockRestore();
            unload.mockRestore();
        }
    },
);

test("Enchanted Skin uses nine shield cels for one second and loads on demand", () => {
    const shield = animationAtlases["Vfx Enchanted Skin"].pop;
    expect(shield.frameCount).toBe(9);
    expect(shield.frameWidth).toBe(384);
    expect(shield.frameHeight).toBe(384);
    let elapsed = 0;
    for (const [frame, duration] of shield.frameDurationsMs!.entries()) {
        expect(commonFlagFrameAt("enchanted_skin", elapsed)).toBe(frame);
        expect(commonFlagFrameAt("enchanted_skin", elapsed + duration - 0.01)).toBe(frame);
        elapsed += duration;
    }
    expect(elapsed).toBe(1000);
    expect(commonFlagFrameAt("enchanted_skin", elapsed)).toBeUndefined();
    expect(isLazyCombatEffectAssetKey("vfx_enchanted_skin_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_enchanted_skin_pop_atlas")).toBe(false);
});

test("common flag pop plays all nine painted cels and expires at one second", () => {
    expect(meta.frameCount).toBe(9);
    let elapsed = 0;
    for (const [i, duration] of meta.frameDurationsMs!.entries()) {
        expect(commonFlagFrameAt("lucky", elapsed)).toBe(i);
        expect(commonFlagFrameAt("lucky", elapsed + duration - 0.01)).toBe(i);
        elapsed += duration;
    }
    expect(elapsed).toBe(1000);
    expect(commonFlagFrameAt("lucky", 1000)).toBeUndefined();
});

test("common flag pop coalesces hits, follows a rebuilt flag, keeps artwork scale and cleans up", async () => {
    const atlas = new Texture({ source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    root.scale.set(0.8, -0.5);
    let now = 0;
    let anchor: { x: number; y: number } | undefined = { x: 100, y: 200 };
    const layer = new CommonFlagPops(
        "lucky",
        (container) => root.addChild(container),
        () => now,
    );
    try {
        await Promise.all([layer.spawn("dragon", anchor, 64, () => anchor), layer.spawn("dragon", anchor, 64)]);
        expect(root.children).toHaveLength(1);
        const pop = root.children[0];
        const sprite = pop.children[0] as Sprite;
        const width = sprite.width;
        expect(pop.y).toBeCloseTo(200 + 64 * 0.07);
        expect(sprite.anchor.y).toBe(1);
        const first = sprite.texture;
        anchor = { x: 150, y: 250 };
        now = 500;
        layer.update(1 / 240);
        expect(pop.x).toBe(150);
        expect(pop.y).toBeCloseTo(250 + 64 * 0.07);
        expect(pop.scale.y).toBeCloseTo(-1.6);
        expect(sprite.width).toBe(width);
        expect(sprite.texture).not.toBe(first);
        now = 1000;
        layer.update(1 / 240);
        expect(pop.destroyed).toBe(true);
        expect(layer.active).toBe(false);
        await layer.spawn("dragon", anchor, 64, () => anchor);
        anchor = undefined;
        layer.update(0);
        expect(layer.active).toBe(false);
        expect(atlas.destroyed).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
    }
});

test("scene teardown cancels an unfinished common flag pop texture load", async () => {
    let resolve!: (texture: Texture) => void;
    const load = spyOn(Assets, "load").mockReturnValue(
        new Promise<Texture>((done) => {
            resolve = done;
        }) as unknown as Promise<Record<string, unknown>>,
    );
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    const layer = new CommonFlagPops("lucky", (container) => root.addChild(container));
    try {
        const pending = layer.spawn("dragon", { x: 10, y: 20 }, 64);
        layer.clear();
        resolve(Texture.WHITE);
        await pending;
        expect(root.children).toHaveLength(0);
        expect(layer.active).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
    }
});

test("all five effects have equal canvas, timing and an authored nine-frame lifecycle", () => {
    for (const name of ["Lucky", "Miss", "Resist", "Heal", "Absorb"]) {
        const atlas = animationAtlases[`Vfx Common ${name}`].pop;
        expect(atlas.frameWidth).toBe(384);
        expect(atlas.frameHeight).toBe(384);
        expect(atlas.frameCount).toBe(9);
        expect(atlas.frameDurationsMs?.reduce((sum, value) => sum + value, 0)).toBe(1000);
    }
});

test("Penetrating Bite keeps all sixteen cels within one second", () => {
    const bite = animationAtlases["Vfx Penetrating Bite"].pop;
    expect(bite.frameCount).toBe(16);
    expect(isLazyCombatEffectAssetKey("vfx_penetrating_bite_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_penetrating_bite_pop_atlas")).toBe(false);
    let elapsed = 0;
    for (const [i, duration] of bite.frameDurationsMs!.entries()) {
        expect(commonFlagFrameAt("penetrating_bite", elapsed)).toBe(i);
        elapsed += duration;
    }
    expect(elapsed).toBe(1000);
    expect(commonFlagFrameAt("penetrating_bite", elapsed)).toBeUndefined();
});
