import { overheadEffectElapsedMs, OVERHEAD_EFFECT_PLAYBACK_SPEED } from "../../settings/statusEffectTiming";
import { describe, expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";

import { images } from "../../imageAssets";
import { isUnitAnimationAtlasKey } from "../../pixi/unitAtlasKeys";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../../pixi/productionImageAssetPolicy";
import type { AtlasFlagEffect, AtlasFlagPops } from "./AtlasFlagPops";
import { AngelResurrectionPops, ANGEL_RESURRECTION_EFFECT, angelResurrectionFrameAt } from "./AngelResurrectionPops";
import { BoarSalivaPops, BOAR_SALIVA_EFFECT, boarSalivaFrameAt } from "./BoarSalivaPops";
import { CombatVisuals } from "./CombatVisuals";
import { CrusadePops, CRUSADE_EFFECT, crusadeFrameAt } from "./CrusadePops";
import { DevourEssencePops, DEVOUR_ESSENCE_EFFECT, devourEssenceFrameAt } from "./DevourEssencePops";
import { MagicReflectionPops, MAGIC_REFLECTION_EFFECT, magicReflectionFrameAt } from "./MagicReflectionPops";
import { UnyieldingPowerPops, UNYIELDING_POWER_EFFECT, unyieldingPowerFrameAt } from "./UnyieldingPowerPops";
import { UnyieldingPowerTriggers } from "./UnyieldingPowerTriggers";

type Attach = ConstructorParameters<typeof BoarSalivaPops>[0];
type Case = Readonly<{
    name: string;
    effect: AtlasFlagEffect;
    imageKey: keyof typeof images;
    make: (attach: Attach, now?: () => number) => AtlasFlagPops;
    frameAt: (elapsedMs: number) => number | undefined;
    frameCount: number;
    frameSize: number;
    durationMs: number;
    /** Pinned only where the authored sequence has no hold or pause. */
    loop?: Readonly<{ loopDurationMs: number; pauseMs: number }>;
}>;

const cases: Case[] = [
    {
        name: "Boar Saliva",
        effect: BOAR_SALIVA_EFFECT,
        imageKey: "vfx_boar_saliva_short_atlas",
        make: (attach, now) => new BoarSalivaPops(attach, now),
        frameAt: boarSalivaFrameAt,
        frameCount: 16,
        frameSize: 384,
        durationMs: 1000,
        loop: { loopDurationMs: 1000, pauseMs: 0 },
    },
    {
        name: "Devour Essence",
        effect: DEVOUR_ESSENCE_EFFECT,
        imageKey: "vfx_devour_essence_short_atlas",
        make: (attach, now) => new DevourEssencePops(attach, now),
        frameAt: devourEssenceFrameAt,
        frameCount: 16,
        frameSize: 384,
        durationMs: 1000,
        loop: { loopDurationMs: 1000, pauseMs: 0 },
    },
    {
        name: "Crusade",
        effect: CRUSADE_EFFECT,
        imageKey: "vfx_champion_crusade_pop_atlas",
        make: (attach, now) => new CrusadePops(attach, now),
        frameAt: crusadeFrameAt,
        frameCount: 16,
        frameSize: 256,
        durationMs: 1000,
    },
    {
        name: "Magic Reflection",
        effect: MAGIC_REFLECTION_EFFECT,
        imageKey: "vfx_magic_reflection_pop_atlas",
        make: (attach, now) => new MagicReflectionPops(attach, now),
        frameAt: magicReflectionFrameAt,
        frameCount: 9,
        frameSize: 384,
        durationMs: 1000,
    },
    {
        name: "Unyielding Power",
        effect: UNYIELDING_POWER_EFFECT,
        imageKey: "vfx_unyielding_power_curl_short_atlas",
        make: (attach, now) => new UnyieldingPowerPops(attach, now),
        frameAt: unyieldingPowerFrameAt,
        frameCount: 17,
        frameSize: 384,
        durationMs: 1000,
    },
    {
        name: "Angel Resurrection",
        effect: ANGEL_RESURRECTION_EFFECT,
        imageKey: "vfx_angel_resurrection_pop_atlas",
        make: (attach, now) => new AngelResurrectionPops(attach, now),
        frameAt: angelResurrectionFrameAt,
        frameCount: 8,
        frameSize: 384,
        durationMs: 1200,
    },
];

const atlasFor = (meta: NonNullable<AtlasFlagEffect["meta"]>) =>
    new Texture({ source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }) });

/** Stub the asset loader for one test and restore it, so shared shard processes see the real Assets. */
async function withAssets(
    load: () => ReturnType<typeof spyOn<typeof Assets, "load">>,
    run: (load: ReturnType<typeof spyOn<typeof Assets, "load">>) => Promise<void>,
    cleanup: () => void,
): Promise<void> {
    const loadSpy = load();
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    try {
        await run(loadSpy);
    } finally {
        cleanup();
        await Promise.resolve();
        loadSpy.mockRestore();
        unload.mockRestore();
    }
}

describe.each(cases)("$name painted flag cue", (c) => {
    const meta = c.effect.meta!;

    test("plays every authored cel inside its exact lifetime and remains a production VFX asset", () => {
        expect(c.effect.url).toBe(images[c.imageKey]);
        expect(meta.frameCount).toBe(c.frameCount);
        expect(meta.frameWidth).toBe(c.frameSize);
        expect(meta.frameHeight).toBe(c.frameSize);
        if (c.loop) {
            expect(meta.loopDurationMs).toBe(c.loop.loopDurationMs);
            expect(meta.pauseMs).toBe(c.loop.pauseMs);
        }
        let elapsed = 0;
        for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
            expect(c.frameAt(elapsed)).toBe(frame);
            expect(c.frameAt(elapsed + duration - 0.01)).toBe(frame);
            elapsed += duration;
        }
        expect(elapsed).toBe(c.durationMs);
        expect(c.frameAt(-1)).toBe(0);
        expect(c.frameAt(c.durationMs)).toBeUndefined();
        expect(c.frameAt(c.durationMs + 500)).toBeUndefined();
        expect(c.frameAt(2000)).toBeUndefined();
        expect(isUnitAnimationAtlasKey(c.imageKey)).toBe(false);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey(c.imageKey)).toBe(false);
    });

    test("coalesces repeated notifications, follows the flag, keeps exact artwork scale, and expires in real time", async () => {
        const atlas = atlasFor(meta);
        const root = new Container();
        root.scale.set(0.8, -0.5);
        let now = 0;
        let anchor: { x: number; y: number } | undefined = { x: 100, y: 200 };
        const layer = c.make(
            (container) => root.addChild(container),
            () => now / OVERHEAD_EFFECT_PLAYBACK_SPEED,
        );
        await withAssets(
            () => spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>),
            async (load) => {
                await Promise.all([layer.spawn("unit", anchor!, 64, () => anchor), layer.spawn("unit", anchor!, 64)]);
                expect(load).toHaveBeenCalledTimes(1);
                expect<unknown>(load.mock.calls[0][0]).toBe(images[c.imageKey]);
                expect(root.children).toHaveLength(1);
                const pop = root.children[0];
                const sprite = pop.children[0] as Sprite;
                expect(sprite.anchor.x).toBe(0.5);
                expect(sprite.anchor.y).toBe(1);
                expect(sprite.width).toBeCloseTo(64 * 1.45 * 0.9);
                expect(sprite.texture.width).toBe(c.frameSize);
                expect(pop.x).toBe(100);
                expect(pop.y).toBeCloseTo(200 + 64 * 0.07);
                const first = sprite.texture;
                const width = sprite.width;
                const scale = { x: sprite.scale.x, y: sprite.scale.y };
                // A follow callback resolves the current rebuilt recipient, rather than a stale unit instance.
                anchor = { x: 150, y: 250 };
                now = 500;
                layer.update(1 / 240);
                expect(pop.x).toBe(150);
                expect(pop.y).toBeCloseTo(250 + 64 * 0.07);
                expect(pop.scale.y).toBeCloseTo(-1.6, 8);
                expect(pop.alpha).toBe(1); // Pixel-authored appearance/fade, no engine deformation.
                expect(sprite.scale.x).toBe(scale.x);
                expect(sprite.scale.y).toBe(scale.y);
                expect(sprite.width).toBe(width);
                expect(sprite.texture).not.toBe(first);
                await layer.spawn("unit", anchor, 64);
                expect(root.children).toHaveLength(1);
                now = 1800;
                layer.update(1 / 240);
                expect(layer.active).toBe(false);
                expect(pop.destroyed).toBe(true);
                expect(atlas.destroyed).toBe(false);
                await layer.spawn("unit", anchor, 64, () => anchor);
                expect(layer.active).toBe(true);
                anchor = undefined;
                layer.update(0);
                expect(layer.active).toBe(false);
            },
            () => layer.clear(),
        );
    });

    test("teardown cancels a pending load without a stale pop; a failed load can retry", async () => {
        let resolve!: (texture: Texture) => void;
        const root = new Container();
        const layer = c.make((container) => root.addChild(container));
        await withAssets(
            () =>
                spyOn(Assets, "load").mockReturnValue(
                    new Promise<Texture>((done) => {
                        resolve = done;
                    }) as unknown as Promise<Record<string, unknown>>,
                ),
            async (load) => {
                const pending = layer.spawn("unit", { x: 100, y: 200 }, 64);
                layer.clear();
                resolve(Texture.WHITE);
                await pending;
                expect(root.children).toHaveLength(0);
                expect(layer.active).toBe(false);
                load.mockRejectedValueOnce(new Error("decode failed"));
                await layer.spawn("unit", { x: 0, y: 0 }, 64);
                expect(layer.active).toBe(false);
                load.mockResolvedValueOnce(atlasFor(meta) as unknown as Record<string, unknown>);
                await layer.spawn("unit", { x: 0, y: 0 }, 64);
                expect(layer.active).toBe(true);
            },
            () => layer.clear(),
        );
    });
});

test("Angel Resurrection runs on the plain overhead clock and adds an engine fade-in and fade-out", async () => {
    const atlas = atlasFor(ANGEL_RESURRECTION_EFFECT.meta!);
    const root = new Container();
    let now = 0;
    const layer = new AngelResurrectionPops(
        (container) => root.addChild(container),
        () => now,
    );
    await withAssets(
        () => spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>),
        async () => {
            await layer.spawn("angel", { x: 0, y: 0 }, 64);
            const sprite = root.children[0].children[0] as Sprite;
            const frames = (layer as unknown as { frames: Texture[] }).frames;
            expect(sprite.alpha).toBe(0);
            for (const raw of [141, 400, 650, 1000, 1250]) {
                now = raw;
                layer.update(0);
                const age = overheadEffectElapsedMs(raw, 1200);
                expect(sprite.texture).toBe(frames[angelResurrectionFrameAt(age)!]);
                expect(sprite.alpha).toBeCloseTo(Math.min(1, age / 70, (1200 - age) / 180));
            }
            now = 600;
            layer.update(0);
            expect(sprite.alpha).toBe(1);
        },
        () => layer.clear(),
    );
});

test("simultaneous Unyielding Power passive and first-turn events share one curl", async () => {
    const atlas = atlasFor(UNYIELDING_POWER_EFFECT.meta!);
    const root = new Container();
    const anchor = { x: 100, y: 200 };
    const layer = new UnyieldingPowerPops((container) => root.addChild(container));
    await withAssets(
        () => spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>),
        async () => {
            const triggers = new UnyieldingPowerTriggers();
            triggers.prime(["behemoth"]);
            const pending = [];
            if (triggers.observePassive("behemoth", 1, true))
                pending.push(layer.spawn("behemoth", anchor, 64, () => anchor));
            if (triggers.firstTurn("behemoth", 1, true))
                pending.push(layer.spawn("behemoth", anchor, 64, () => anchor));
            expect(pending).toHaveLength(2);
            await Promise.all(pending);
            expect(root.children).toHaveLength(1);
        },
        () => layer.clear(),
    );
});

describe.each([
    {
        name: "ranked Boar Saliva hydration",
        spawn: (visuals: CombatVisuals, unit: Parameters<CombatVisuals["spawnBoarSalivaPop"]>[0]) =>
            visuals.spawnBoarSalivaPop(unit),
    },
    {
        name: "lab Devour Essence preview",
        spawn: (visuals: CombatVisuals, unit: Parameters<CombatVisuals["spawnDevourEssencePop"]>[0]) =>
            visuals.spawnDevourEssencePop(unit, "preview"),
    },
])("$name", ({ spawn }) => {
    test("survives hydration and reacquires the rebuilt recipient", async () => {
        let now = 0;
        const clock = spyOn(performance, "now").mockImplementation(() => now / OVERHEAD_EFFECT_PLAYBACK_SPEED);
        const atlas = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
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
            await withAssets(
                () => spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>),
                async () => {
                    spawn(visuals, units.get("enemy")! as unknown as Parameters<typeof spawn>[1]);
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
                    const bounds = pop.getLocalBounds();
                    const lower = Math.min(bounds.minY * pop.scale.y, bounds.maxY * pop.scale.y);
                    expect(pop.y + lower).toBeCloseTo(250 + 6);
                    units.set("enemy", makeUnit(150, 250, true));
                    visuals.update(0);
                    expect(pop.destroyed).toBe(true);
                    expect(root.children).toHaveLength(0);
                },
                () => visuals.clear(),
            );
        } finally {
            clock.mockRestore();
        }
    });
});
