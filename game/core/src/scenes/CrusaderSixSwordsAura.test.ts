import { expect, test } from "bun:test";
import { Container, Mesh, Texture } from "pixi.js";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { isLazyCombatEffectAssetKey } from "../pixi/imageAssetTiers";
import {
    CRUSADER_AURA_ROTATION_MS,
    CRUSADER_SIX_SWORDS_AURA_KEY,
    crusaderAuraProjection,
    crusaderAuraRotation,
    drawCrusaderSixSwordsAura,
    resetCrusaderSixSwordsAuras,
} from "./CrusaderSixSwordsAura";

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
const footprint = { width: 1, height: 1 };

test("the sword tip turns from bottom to left clockwise and loops seamlessly", () => {
    const rotation = crusaderAuraRotation(CRUSADER_AURA_ROTATION_MS / 4);
    const projection = crusaderAuraProjection(center, footprint, 2, rotation, gs)!;
    // The left midpoint now samples the original bottom of the sword (v > 0.5).
    const left = 12 * 25 * 2;
    expect(projection.uvs[left]).toBeCloseTo(0.5);
    expect(projection.uvs[left + 1]).toBeGreaterThan(0.95);
    expect(rotation).toBeCloseTo(-Math.PI / 2);
    const loop = crusaderAuraProjection(center, footprint, 2, crusaderAuraRotation(CRUSADER_AURA_ROTATION_MS), gs)!;
    expect([...loop.uvs]).toEqual([...crusaderAuraProjection(center, footprint, 2, 0, gs)!.uvs]);
});

test("narrowing clips the aura without moving its artwork centre", () => {
    const edgeCenter = { x: gs.getMinX() + gs.getCellSize(), y: center.y };
    const clipped = crusaderAuraProjection(edgeCenter, footprint, 2, 0, gs, 1)!;
    expect(clipped.uvs[0]).toBeCloseTo(0.5);
    expect([...clipped.positions].every(Number.isFinite)).toBe(true);
    expect(Math.max(...clipped.indices)).toBeLessThan(clipped.positions.length / 2);
    expect(crusaderAuraProjection(center, footprint, 0, 0, gs)).toBeUndefined();
});

test("hover and selection share one rotating mesh, which disappears and releases after deselection", () => {
    const container = new Container();
    const draw = (time: number) =>
        drawCrusaderSixSwordsAura(container, Texture.WHITE, center, footprint, 2, gs, "crusader", 1, 0, time);
    draw(100);
    draw(100);
    expect(container.children).toHaveLength(1);
    const mesh = container.children[0] as Mesh;
    const initialUV = [...mesh.geometry.getBuffer("aUV").data];
    resetCrusaderSixSwordsAuras(container, 6100);
    // Reset must run each frame in the real renderer; exercise a shorter gap for reuse.
    expect(container.children).toHaveLength(0);
    draw(6200);
    const next = container.children[0] as Mesh;
    resetCrusaderSixSwordsAuras(container, 7200);
    expect(next.visible).toBe(false);
    draw(7200);
    expect(container.children[0]).toBe(next);
    expect([...next.geometry.getBuffer("aUV").data]).not.toEqual(initialUV);
    expect(next.alpha).toBeCloseTo(1);
    resetCrusaderSixSwordsAuras(container, 13000);
    expect(container.children).toHaveLength(0);
    expect(isLazyCombatEffectAssetKey(CRUSADER_SIX_SWORDS_AURA_KEY)).toBe(true);
    container.destroy();
});
