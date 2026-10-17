import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import {
    InfestHatchPops,
    infestHatchFrame,
    isInfestHatchSummon,
    INFEST_HATCH_SPEED,
    INFEST_HATCH_DURATION_MS,
} from "./InfestHatchPops";
import type { RenderableUnit } from "../RenderableUnit";
import { isLazyCombatEffectAssetKey } from "../../pixi/imageAssetTiers";
import { isUnitAnimationAtlasKey } from "../../pixi/unitAtlasKeys";

function body() {
    return {
        getName: () => "Arachna Spider",
        visible: true,
        dead: false,
        position: { x: 10, y: 20 },
        setVisualVisible(value: boolean) {
            this.visible = value;
        },
        isDead() {
            return this.dead;
        },
        getPosition() {
            return this.position;
        },
        getShatterInfo() {
            return { texture: { width: 768, height: 768 }, x: 35, y: 75, scaleX: -0.4, scaleY: -0.4 };
        },
    };
}

test("Infest waits for death, preserves summoned scale/facing and reveals the current hydrated body", async () => {
    const atlas = new Texture({ source: new TextureSource({ width: 4096, height: 4096 }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    let now = 0,
        deathFinished = false,
        unit = body();
    const world = new Container();
    const effect = new InfestHatchPops(
        (sprite) => {
            world.addChild(sprite);
        },
        () => now,
    );
    try {
        const resolve = () => unit as unknown as RenderableUnit;
        effect.spawn("server-id", resolve, () => deathFinished);
        effect.spawn("server-id", resolve, () => deathFinished);
        expect(unit.visible).toBe(false);
        await Promise.resolve();
        now = 700;
        effect.update(0);
        expect(world.children).toHaveLength(0);
        deathFinished = true;
        effect.update(0);
        expect(world.children).toHaveLength(1);
        const sprite = world.children[0] as Sprite;
        expect(sprite.texture.width).toBe(1024);
        expect(sprite.scale.x).toBeCloseTo(-0.4);
        expect(sprite.scale.y).toBeCloseTo(-0.4);
        expect(sprite.position.x).toBe(35);
        expect(sprite.position.y).toBe(75);
        now = 700 + 1200 / INFEST_HATCH_SPEED + 0.01;
        effect.update(0);
        expect(sprite.texture.frame.x).toBe(0);
        expect(sprite.texture.frame.y).toBe(2 * 1024);
        unit = body();
        unit.getShatterInfo = () => ({
            texture: { width: 1024, height: 1024 },
            x: 42,
            y: 91,
            scaleX: -0.3,
            scaleY: -0.3,
        });
        effect.update(0);
        expect(unit.visible).toBe(false);
        expect(sprite.position.x).toBe(35);
        expect(sprite.position.y).toBe(75);
        expect(sprite.scale.x).toBeCloseTo(-0.4);
        expect(sprite.scale.y).toBeCloseTo(-0.4);
        // A complete articulated cel owns the entire body until the crawl and settle finish.
        now = 700 + 1950 / INFEST_HATCH_SPEED - 0.01;
        effect.update(0);
        expect(unit.visible).toBe(false);
        expect(sprite.destroyed).toBe(false);
        now = 700 + 1950 / INFEST_HATCH_SPEED + 0.01;
        effect.update(0);
        expect(unit.visible).toBe(true);
        expect(sprite.destroyed).toBe(true);
        expect(world.children).toHaveLength(0);
        expect(effect.active).toBe(true);
        unit = body();
        unit.visible = false;
        now = 700 + 2100 / INFEST_HATCH_SPEED;
        effect.update(0);
        expect(unit.visible).toBe(true);
        expect(world.children).toHaveLength(0);
        now = 700 + INFEST_HATCH_DURATION_MS + 0.01;
        effect.update(0);
        expect(unit.visible).toBe(true);
        expect(effect.active).toBe(false);
        expect(sprite.destroyed).toBe(true);
        expect(atlas.destroyed).toBe(false);
    } finally {
        effect.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
        world.destroy();
    }
});

test("failed atlas load restores the body instead of leaving an invisible summon", async () => {
    const load = spyOn(Assets, "load").mockRejectedValue(new Error("missing atlas"));
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const unit = body();
    const effect = new InfestHatchPops(() => {
        throw new Error("must not attach");
    });
    try {
        effect.spawn(
            "id",
            () => unit as unknown as RenderableUnit,
            () => true,
        );
        await Promise.resolve();
        expect(unit.visible).toBe(true);
        expect(effect.active).toBe(false);
    } finally {
        effect.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
    }
});

test("teardown during loading cannot resurrect an overlay; movement cancels the hold", async () => {
    let finish!: (t: Texture) => void;
    const load = spyOn(Assets, "load").mockReturnValue(
        new Promise<Texture>((r) => (finish = r)) as unknown as Promise<Record<string, unknown>>,
    );
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const world = new Container(),
        unit = body();
    const effect = new InfestHatchPops((s) => {
        world.addChild(s);
    });
    try {
        effect.spawn(
            "id",
            () => unit as unknown as RenderableUnit,
            () => true,
        );
        unit.position.x += 5;
        effect.update(0);
        expect(unit.visible).toBe(true);
        expect(effect.active).toBe(false);
        effect.spawn(
            "id",
            () => unit as unknown as RenderableUnit,
            () => true,
        );
        effect.clear();
        finish(Texture.WHITE);
        await Promise.resolve();
        effect.update(0);
        expect(unit.visible).toBe(true);
        expect(world.children).toHaveLength(0);
    } finally {
        effect.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
        world.destroy();
    }
});

test("painted hatch is a lazy combat VFX with bounded one-shot timing", () => {
    for (const kind of ["spider", "queen"]) {
        expect(isLazyCombatEffectAssetKey(`vfx_arachna_infest_${kind}_hatch_atlas`)).toBe(true);
        expect(isUnitAnimationAtlasKey(`vfx_arachna_infest_${kind}_hatch_atlas`)).toBe(false);
    }
    expect(infestHatchFrame(0)).toBe(0);
    expect(INFEST_HATCH_DURATION_MS).toBeCloseTo(1666.6666667);
    expect(infestHatchFrame(INFEST_HATCH_DURATION_MS - 0.01)).toBe(14);
    expect(infestHatchFrame(INFEST_HATCH_DURATION_MS)).toBeUndefined();
});

test("Infest accepts both authoritative spider and Queen births, but not other summons or merges", () => {
    for (const unitName of ["Arachna Spider", "Arachna Queen"]) {
        expect(isInfestHatchSummon({ unitName, sourceAbility: "Infest", merged: false })).toBe(true);
        expect(isInfestHatchSummon({ unitName, sourceAbility: "Infest", merged: true })).toBe(false);
        expect(isInfestHatchSummon({ unitName, sourceAbility: "Summon", merged: false })).toBe(false);
    }
    expect(isInfestHatchSummon({ unitName: "Wolf", sourceAbility: "Infest", merged: false })).toBe(false);
});

test("each species loads its own complete poses while preserving body scale and mirrored facing", async () => {
    const atlas = new Texture({ source: new TextureSource({ width: 4096, height: 4096 }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    let now = 0;
    const small = body(),
        queen = {
            ...body(),
            getName: () => "Arachna Queen",
            getShatterInfo: () => ({ texture: { width: 768, height: 768 }, x: 100, y: 150, scaleX: 0.8, scaleY: -0.8 }),
        };
    const world = new Container(),
        effect = new InfestHatchPops(
            (s) => {
                world.addChild(s);
            },
            () => now,
        );
    try {
        effect.spawn(
            "small",
            () => small as unknown as RenderableUnit,
            () => true,
        );
        effect.spawn(
            "queen",
            () => queen as unknown as RenderableUnit,
            () => true,
        );
        await Promise.resolve();
        now = 600;
        effect.update(0);
        const [largeEgg, smallEgg] = world.children as Sprite[];
        expect(largeEgg.texture).not.toBe(smallEgg.texture);
        expect(load).toHaveBeenCalledTimes(2);
        expect(largeEgg.width).toBeCloseTo(smallEgg.width * 2);
        expect(largeEgg.scale.x).toBeGreaterThan(0);
        expect(smallEgg.scale.x).toBeLessThan(0);
        now = 1800;
        effect.update(0);
        expect(queen.visible).toBe(false);
        expect(small.visible).toBe(false);
        effect.clear();
        expect(queen.visible).toBe(true);
    } finally {
        effect.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
        world.destroy();
    }
});
