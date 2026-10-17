import { expect, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, Texture } from "pixi.js";
import { isLazyCombatEffectAssetKey } from "../pixi/imageAssetTiers";
import { isUnitAnimationAtlasKey } from "../pixi/unitAtlasKeys";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../pixi/productionImageAssetPolicy";
import {
    arachnaWebBounds,
    arachnaWebProjection,
    arachnaWebFrame,
    drawArachnaQueenWebAura,
    resetArachnaQueenWebAuras,
    ARACHNA_WEB_ATLAS_KEY,
} from "./ArachnaQueenWebAura";
const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const center = { x: (gs.getMinX() + gs.getMaxX()) / 2, y: (gs.getMinY() + gs.getMaxY()) / 2 };
test("queen web follows aura range from the footprint, including synergy and board narrowing", () => {
    const cell = gs.getCellSize();
    const base = arachnaWebBounds(center, { width: 2, height: 2 }, 2, gs)!;
    expect(base.right - base.left).toBe(6 * cell);
    expect(base.top - base.bottom).toBe(6 * cell);
    const boosted = arachnaWebBounds(center, { width: 2, height: 2 }, 3, gs)!;
    expect(boosted.right - boosted.left).toBe(8 * cell);
    const rectangular = arachnaWebBounds(center, { width: 2, height: 1 }, 2, gs)!;
    expect(rectangular.top - rectangular.bottom).toBe(5 * cell);
    const edge = arachnaWebBounds(
        { x: gs.getMinX() + cell, y: gs.getMinY() + cell },
        { width: 2, height: 2 },
        2,
        gs,
        2,
    )!;
    expect(edge.left).toBe(gs.getMinX() + 2 * cell);
    expect(edge.bottom).toBe(gs.getMinY() + 2 * cell);
    expect(arachnaWebBounds(center, { width: 2, height: 2 }, 0, gs)).toBeUndefined();
});
test("board-edge clipping crops artwork UVs without stretching or moving its centre", () => {
    const cell = gs.getCellSize();
    const edgeCenter = { x: gs.getMinX() + cell, y: gs.getMinY() + cell };
    const projection = arachnaWebProjection(edgeCenter, { width: 2, height: 2 }, 2, gs)!;
    expect(projection.uvs[0]).toBeCloseTo(1 / 3);
    expect(projection.uvs[1]).toBe(0);
    expect(projection.uvs.at(-2)).toBe(1);
    expect(projection.uvs.at(-1)).toBeCloseTo(2 / 3);
    expect([...projection.positions].every(Number.isFinite)).toBe(true);
    expect(Math.max(...projection.indices)).toBeLessThan(projection.positions.length / 2);
});
test("sprite frames reveal once, loop seamlessly, and reset after inspection ends", () => {
    expect([0, 799, 800, 933, 934, 3599, 3600, 4533, 4534].map(arachnaWebFrame)).toEqual([
        0, 7, 8, 8, 9, 28, 29, 35, 8,
    ]);
    const container = new Container();
    const draw = (now: number) =>
        drawArachnaQueenWebAura(container, Texture.WHITE, center, { width: 2, height: 2 }, 2, gs, "queen", 0.7, 0, now);
    draw(0);
    expect(container.children).toHaveLength(1);
    for (let now = 100; now <= 1400; now += 100) {
        resetArachnaQueenWebAuras(container, now);
        draw(now);
    }
    expect(container.children).toHaveLength(1);
    const mesh = container.children[0] as import("pixi.js").Mesh;
    expect(mesh.geometry.getBuffer("aUV").data[0]).toBeCloseTo((0 + 0.5 / 640) / 6);
    resetArachnaQueenWebAuras(container, 1500);
    expect(mesh.visible).toBe(false);
    draw(2000);
    expect(mesh.visible).toBe(true);
    expect(mesh.geometry.getBuffer("aUV").data[0]).toBeLessThan(0.01);
    resetArachnaQueenWebAuras(container, 8000);
    expect(container.children).toHaveLength(0);
    container.destroy();
});
test("aura atlas is lazy VFX, never an owner-disabled creature animation", () => {
    expect(isLazyCombatEffectAssetKey(ARACHNA_WEB_ATLAS_KEY)).toBe(true);
    expect(isUnitAnimationAtlasKey(ARACHNA_WEB_ATLAS_KEY)).toBe(false);
    expect(isProductionOmittedDisabledUnitAnimationAssetKey(ARACHNA_WEB_ATLAS_KEY)).toBe(false);
});
