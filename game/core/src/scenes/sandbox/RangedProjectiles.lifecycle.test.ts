import { expect, test } from "bun:test";
import { Assets, BufferImageSource, Container, Sprite, Texture } from "pixi.js";

import { GridConstants, GridSettings } from "@heroesofcrypto/common";

import { images } from "../../generated/image_imports";
import { RangedProjectiles, type IRangedProjectilesContext } from "./RangedProjectiles";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const setup = () => {
    const attachments: Container[] = [];
    const projectiles = new RangedProjectiles({
        getGridSettings: () => gridSettings,
        attachToWorldRoot: (object) => attachments.push(object),
    } as IRangedProjectilesContext);
    return { attachments, projectiles };
};

test("Medusa serpent changes painted flight cels at a fixed scale and cancels without impact", async () => {
    const { projectiles } = setup();
    const frames = Array.from(
        { length: 4 },
        () =>
            new Texture({
                source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 384 }),
            }),
    );
    const state = projectiles as unknown as {
        medusaArmSerpentFrames: Texture[];
        projectiles: { sprite: Sprite }[];
    };
    state.medusaArmSerpentFrames = frames;
    for (const cancel of [false, true]) {
        const shot = new AbortController();
        let impacts = 0;
        const flight = projectiles.fire({
            from: { x: 0, y: 0 },
            to: { x: 1000, y: 200 },
            big: false,
            medusaSerpent: true,
            medusaArmSerpent: true,
            serpentLength: 42,
            signal: shot.signal,
            onImpact: () => impacts++,
        });
        await Promise.resolve();
        expect(projectiles.hasActive()).toBe(true);
        const sprite = state.projectiles[0].sprite;
        expect(sprite.texture === frames[0]).toBe(true);
        projectiles.update(0.02);
        expect(sprite.texture === frames[1]).toBe(true);
        expect(sprite.width).toBeCloseTo(42, 6);
        expect(impacts).toBe(0);
        if (cancel) shot.abort();
        else projectiles.update(10);
        await flight;
        expect(impacts).toBe(cancel ? 0 : 1);
        expect(projectiles.hasActive()).toBe(false);
    }
    projectiles.destroy();
    expect(frames.every((frame) => frame.destroyed)).toBe(true);
});

test("Dryad physical arrow preserves its held length and hits only after flight", async () => {
    const { projectiles } = setup();
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 1024, height: 70 }),
    });
    const state = projectiles as unknown as {
        dryadArrowTexture: Texture;
        projectiles: { sprite: { width: number }; traveled: number }[];
    };
    state.dryadArrowTexture = texture;
    for (const cancel of [false, true]) {
        const shot = new AbortController();
        let hits = 0;
        const flight = projectiles.fire({
            from: { x: 0, y: 0 },
            to: { x: 1000, y: 200 },
            big: false,
            dryadArrow: true,
            arrowLength: 42,
            signal: shot.signal,
            onImpact: () => hits++,
        });
        await Promise.resolve();
        expect(projectiles.hasActive()).toBe(true);
        expect(state.projectiles[0].sprite.width).toBeCloseTo(42, 5);
        projectiles.update(0.001);
        expect(state.projectiles[0].traveled).toBeGreaterThan(0);
        expect(hits).toBe(0);
        if (cancel) shot.abort();
        else projectiles.update(10);
        await flight;
        expect(hits).toBe(cancel ? 0 : 1);
        expect(projectiles.hasActive()).toBe(false);
    }
    projectiles.destroy();
    texture.destroy(true);
});

test("Arbalester cancellation never reports impact and a live bolt reports it only on arrival", async () => {
    const { projectiles } = setup();
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 128, height: 64 }),
    });
    (projectiles as unknown as { arbalesterCyanBoltTexture: Texture }).arbalesterCyanBoltTexture = texture;
    for (const cancel of [false, true]) {
        const shot = new AbortController();
        let impacts = 0;
        const flight = projectiles.fire({
            from: { x: 0, y: 0 },
            to: { x: 1000, y: 400 },
            big: false,
            arbalesterBolt: true,
            signal: shot.signal,
            onImpact: () => impacts++,
        });
        await Promise.resolve();
        expect(projectiles.hasActive()).toBe(true);
        projectiles.update(0.001);
        expect(impacts).toBe(0);
        if (cancel) shot.abort();
        else projectiles.update(10);
        await flight;
        expect(impacts).toBe(cancel ? 0 : 1);
        expect(projectiles.hasActive()).toBe(false);
        shot.abort();
        projectiles.update(10);
        expect(impacts).toBe(cancel ? 0 : 1);
    }
    let clearedImpacts = 0;
    const cleared = projectiles.fire({
        from: { x: 0, y: 0 },
        to: { x: 1000, y: 0 },
        big: false,
        arbalesterBolt: true,
        onImpact: () => clearedImpacts++,
    });
    await Promise.resolve();
    projectiles.clear();
    await cleared;
    expect(clearedImpacts).toBe(0);
    projectiles.destroy();
    texture.destroy(true);
});

test("an Arbalester shot cancelled during texture preparation never attaches to the scene", async () => {
    const { attachments, projectiles } = setup();
    let finish!: () => void;
    (projectiles as unknown as { ensureProjectileTexture: () => Promise<void> }).ensureProjectileTexture = () =>
        new Promise<void>((resolve) => {
            finish = resolve;
        });
    const shot = new AbortController();
    let impacts = 0;
    const flight = projectiles.fire({
        from: { x: 0, y: 0 },
        to: { x: 1000, y: 0 },
        big: false,
        arbalesterBolt: true,
        signal: shot.signal,
        onImpact: () => impacts++,
    });
    shot.abort();
    finish();
    await flight;
    expect(attachments).toHaveLength(1);
    expect(projectiles.hasActive()).toBe(false);
    expect(impacts).toBe(0);
    projectiles.destroy();
});

test("scene teardown resolves an in-flight vector projectile", async () => {
    const { attachments, projectiles } = setup();
    const flight = projectiles.fire({
        from: { x: 0, y: 0 },
        to: { x: 100, y: 0 },
        big: true,
    });
    await Promise.resolve();

    expect(projectiles.hasActive()).toBe(true);
    expect(attachments).toHaveLength(2);
    attachments[0].destroy();

    await flight;
    expect(projectiles.hasActive()).toBe(false);
});

test("a late shot cannot attach to a retired scene", async () => {
    const { attachments, projectiles } = setup();
    attachments[0].destroy();

    await projectiles.fire({
        from: { x: 0, y: 0 },
        to: { x: 100, y: 0 },
        big: true,
    });

    expect(attachments).toHaveLength(1);
    expect(projectiles.hasActive()).toBe(false);
});

test("a projectile texture finishing after teardown is evicted from the global cache", async () => {
    const mutableAssets = Assets as unknown as {
        load: typeof Assets.load;
        unload: typeof Assets.unload;
    };
    const originalLoad = mutableAssets.load;
    const originalUnload = mutableAssets.unload;
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 1, height: 1 }),
    });
    let finishLoad!: (texture: Texture) => void;
    const load = new Promise<Texture>((resolve) => {
        finishLoad = resolve;
    });
    const unloaded: string[] = [];
    mutableAssets.load = (() => load) as typeof Assets.load;
    mutableAssets.unload = (async (url: string) => {
        unloaded.push(url);
    }) as typeof Assets.unload;

    try {
        const { attachments, projectiles } = setup();
        const flight = projectiles.fire({
            from: { x: 0, y: 0 },
            to: { x: 100, y: 0 },
            big: false,
            orcAxe: true,
        });
        attachments[0].destroy();
        finishLoad(texture);
        await flight;

        expect(unloaded).toEqual([images.orc_throwing_axe]);
        expect(attachments).toHaveLength(1);
        expect(projectiles.hasActive()).toBe(false);
    } finally {
        mutableAssets.load = originalLoad;
        mutableAssets.unload = originalUnload;
        texture.destroy(true);
    }
});

test("Orc axe starts with its grip in the hand, spins about its centre, and resolves at the victim", async () => {
    const originalLoad = Assets.load;
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(900 * 388 * 4), width: 900, height: 388 }),
    });
    Assets.load = (async () => texture) as typeof Assets.load;
    try {
        for (const facing of [-1, 1]) {
            const { projectiles } = setup();
            const hand = { x: 200, y: 300 };
            const appearance = { length: 100, rotation: 0.65 * facing, facing };
            let landed = false;
            let impacts = 0;
            const flight = projectiles
                .fire({
                    from: hand,
                    to: { x: facing * 1000, y: 500 },
                    big: false,
                    orcAxe: true,
                    orcAppearance: appearance,
                    onImpact: () => impacts++,
                })
                .then(() => {
                    landed = true;
                });
            await Promise.resolve();
            await Promise.resolve();
            const state = projectiles as unknown as { projectiles: Array<{ sprite: import("pixi.js").Sprite }> };
            const sprite = state.projectiles[0].sprite;
            const grip = sprite.toGlobal({ x: (0.26 - 0.5) * 900, y: (0.82 - 0.5) * 388 });
            expect(grip.x).toBeCloseTo(hand.x, 3);
            expect(grip.y).toBeCloseTo(hand.y, 3);
            expect(sprite.anchor.x).toBe(0.5);
            expect(sprite.anchor.y).toBe(0.5);
            const initial = sprite.rotation;
            projectiles.update(1 / 240);
            expect(sprite.rotation).not.toBe(initial);
            expect(landed).toBe(false);
            expect(impacts).toBe(0);
            projectiles.update(10);
            await flight;
            expect(landed).toBe(true);
            expect(impacts).toBe(1);
            projectiles.update(10);
            expect(impacts).toBe(1);
            expect(sprite.destroyed).toBe(true);
            expect(projectiles.hasActive()).toBe(false);
        }
    } finally {
        Assets.load = originalLoad;
        texture.destroy(true);
    }
});
