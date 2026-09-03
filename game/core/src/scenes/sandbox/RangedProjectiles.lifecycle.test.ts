import { expect, test } from "bun:test";
import { Container } from "pixi.js";

import { GridConstants, GridSettings } from "@heroesofcrypto/common";

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
