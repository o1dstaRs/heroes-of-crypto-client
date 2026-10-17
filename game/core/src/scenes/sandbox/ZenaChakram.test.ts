import { expect, test } from "bun:test";
import { BufferImageSource, Container, Graphics, Sprite, Texture } from "pixi.js";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { RangedProjectiles } from "./RangedProjectiles";

test("painted chakram keeps 115% held diameter while spinning, emits rim sparks and cancels cleanly", async () => {
    const world = new Container();
    const grid = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const projectiles = new RangedProjectiles({
        getGridSettings: () => grid,
        attachToWorldRoot: (object) => {
            world.addChild(object);
        },
    });
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 512, height: 512 }),
    });
    const internal = projectiles as unknown as {
        zenaChakramTexture: Texture;
        zenaChakramSparkFrames: Texture[];
        zenaBounceFrames: Texture[];
        projectiles: { sprite: Sprite; g: Graphics; path: { x: number; y: number }[] }[];
    };
    internal.zenaChakramTexture = texture;
    internal.zenaChakramSparkFrames = Array.from({ length: 8 }, () => new Texture({ source: texture.source }));
    for (const cancel of [false, true]) {
        const shot = new AbortController();
        let impacts = 0;
        const held = 120 * 0.32;
        const flight = projectiles.fire({
            from: { x: 25, y: 80 },
            to: { x: 1000, y: 100 },
            returnToOrigin: true,
            big: false,
            chakram: true,
            chakramDiameter: held * 1.15,
            signal: shot.signal,
            onImpact: () => impacts++,
        });
        await Promise.resolve();
        const { sprite, g, path } = internal.projectiles[0];
        expect(path.at(-1)).toEqual({ x: 25, y: 80 });
        projectiles.update(0.004);
        expect(sprite.width * (280 / 512)).toBeCloseTo(held * 1.15, 6);
        const angle = sprite.rotation;
        expect(g.context.instructions.length).toBe(0);
        const firstFrame = sprite.texture;
        projectiles.update(0.016);
        expect(sprite.texture).not.toBe(firstFrame);
        expect(sprite.rotation).toBeGreaterThan(angle);
        expect(sprite.width * (280 / 512)).toBeCloseTo(held * 1.15, 6);
        expect(impacts).toBe(0);
        if (cancel) shot.abort();
        else projectiles.update(10);
        await flight;
        expect(impacts).toBe(cancel ? 0 : 1);
        expect(sprite.destroyed).toBe(true);
    }
    internal.zenaBounceFrames = Array.from({ length: 8 }, () => new Texture({ source: texture.source }));
    for (const cancelBurst of [false, true]) {
        let completed = false;
        const flare = projectiles.showChakramBounce({ x: 100, y: 100 }, 44).then(() => {
            completed = true;
        });
        await Promise.resolve();
        expect(projectiles.hasActive()).toBe(true);
        projectiles.update(0.02);
        await Promise.resolve();
        expect(completed).toBe(false);
        if (cancelBurst) projectiles.clear();
        else projectiles.update(0.03);
        await flare;
        expect(completed).toBe(true);
        expect(projectiles.hasActive()).toBe(false);
    }
    projectiles.destroy();
    texture.destroy(true);
    world.destroy({ children: true });
});

test("ricochets carry frame distance through contacts without replacing or slowing the disc", async () => {
    const world = new Container();
    const projectiles = new RangedProjectiles({
        getGridSettings: () => ({ getCellSize: () => 100 }) as GridSettings,
        attachToWorldRoot: (object) => {
            world.addChild(object);
        },
    });
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 512, height: 512 }),
    });
    const internal = projectiles as unknown as {
        zenaChakramTexture: Texture;
        zenaBounceFrames: Texture[];
        projectiles: { sprite: Sprite; g: Graphics; speed: number; spin: number }[];
    };
    internal.zenaChakramTexture = texture;
    internal.zenaBounceFrames = Array.from({ length: 8 }, () => new Texture({ source: texture.source }));
    const contacts: number[] = [];
    const points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
    ];
    let impacts = 0;
    const flight = projectiles.fireAlongPath(points, {
        big: false,
        chakram: true,
        returnToOrigin: true,
        onWaypoint: (index) => {
            contacts.push(index);
            if (index < 3) void projectiles.showChakramBounce(points[index + 1]);
        },
        onImpact: () => impacts++,
    });
    await Promise.resolve();
    const projectile = internal.projectiles[0];
    const { sprite, g, speed } = projectile;
    projectiles.update(150 / speed);
    expect(contacts).toEqual([0]);
    expect(sprite.position.x).toBeCloseTo(100);
    expect(sprite.position.y).toBeCloseTo(50);
    const spin = projectile.spin;
    projectiles.update(75 / speed);
    expect(contacts).toEqual([0, 1, 2]);
    expect(internal.projectiles[0]).toBe(projectile);
    expect(sprite.destroyed).toBe(false);
    expect(g.destroyed).toBe(false);
    expect(sprite.position.x).toBeCloseTo(75);
    expect(sprite.position.y).toBeCloseTo(100);
    expect(projectile.spin).toBeGreaterThan(spin);
    expect(projectile.speed).toBe(speed);
    expect(impacts).toBe(0);
    projectiles.update(175 / speed);
    await flight;
    expect(contacts).toEqual([0, 1, 2, 3, 4]);
    expect(impacts).toBe(1);
    expect(sprite.destroyed).toBe(true);
    projectiles.destroy();
    texture.destroy(true);
    world.destroy({ children: true });
});

test.each(["abort", "clear"] as const)("%s at a ricochet cancels the remaining path and impacts", async (cancel) => {
    const projectiles = new RangedProjectiles({
        getGridSettings: () => ({ getCellSize: () => 100 }) as GridSettings,
        attachToWorldRoot: () => undefined,
    });
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 512, height: 512 }),
    });
    (projectiles as unknown as { zenaChakramTexture: Texture }).zenaChakramTexture = texture;
    const controller = new AbortController();
    const contacts: number[] = [];
    let impacts = 0;
    const flight = projectiles.fireAlongPath(
        [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 0, y: 0 },
        ],
        {
            big: false,
            chakram: true,
            signal: controller.signal,
            onWaypoint: (index) => {
                contacts.push(index);
                if (cancel === "abort") controller.abort();
                else projectiles.clear();
            },
            onImpact: () => impacts++,
        },
    );
    await Promise.resolve();
    projectiles.update(1);
    await flight;
    expect(contacts).toEqual([0]);
    expect(impacts).toBe(0);
    expect(projectiles.hasActive()).toBe(false);
    projectiles.destroy();
    texture.destroy(true);
});
