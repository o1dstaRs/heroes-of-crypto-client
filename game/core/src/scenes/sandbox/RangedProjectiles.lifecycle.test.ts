import { expect, test } from "bun:test";
import { Assets, BufferImageSource, Container, Texture } from "pixi.js";

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
