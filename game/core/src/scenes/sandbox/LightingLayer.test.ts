import { expect, test } from "bun:test";

import { GridConstants, GridSettings } from "@heroesofcrypto/common";

import { LightingLayer } from "./LightingLayer";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

test("disabled legacy lighting allocates no textures or display objects", () => {
    const layer = new LightingLayer(gridSettings);

    layer.setEnabled(false);

    expect(layer.getContainer().visible).toBe(false);
    expect(layer.getContainer().children).toHaveLength(0);
    layer.destroy();
});
