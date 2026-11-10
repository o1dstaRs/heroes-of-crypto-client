import { afterAll, beforeAll, expect, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, DOMAdapter, Mesh } from "pixi.js";
import { isLazyCombatEffectAssetKey } from "../pixi/imageAssetTiers";
import { isUnitAnimationAtlasKey } from "../pixi/unitAtlasKeys";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../pixi/productionImageAssetPolicy";
import {
    arachnaWebBounds,
    arachnaWebProjection,
    drawArachnaQueenWebAura,
    resetArachnaQueenWebAuras,
    ARACHNA_WEB_ATLAS_KEY,
} from "./ArachnaQueenWebAura";
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const silkMesh = (container: Container) => container.children.find((c) => c.label === "arachna-source-silk") as Mesh;
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
test("engine silk renders without an atlas, reveals once and resets after inspection ends", () => {
    const container = new Container();
    const draw = (now: number) =>
        drawArachnaQueenWebAura(container, undefined, center, { width: 2, height: 2 }, 2, gs, "queen", 0.7, 0, now);
    draw(0);
    expect(container.children).toHaveLength(4);
    for (let now = 100; now <= 1400; now += 100) {
        resetArachnaQueenWebAuras(container, now);
        draw(now);
    }
    expect(container.children).toHaveLength(4);
    const mesh = silkMesh(container);
    expect(mesh.geometry.getBuffer("aUV").data.length).toBeGreaterThan(10000);
    expect(mesh.shader!.resources.silk.uniforms.uTime).toBeCloseTo(1.4);
    expect(mesh.shader!.resources.silk.uniforms.uReveal).toBe(1);
    resetArachnaQueenWebAuras(container, 1500);
    expect(mesh.visible).toBe(false);
    draw(2000);
    expect(mesh.visible).toBe(true);
    expect(mesh.shader!.resources.silk.uniforms.uReveal).toBe(0);
    resetArachnaQueenWebAuras(container, 8000);
    expect(container.children).toHaveLength(0);
    container.destroy();
});
test("aura atlas is lazy VFX, never an owner-disabled creature animation", () => {
    expect(isLazyCombatEffectAssetKey(ARACHNA_WEB_ATLAS_KEY)).toBe(true);
    expect(isUnitAnimationAtlasKey(ARACHNA_WEB_ATLAS_KEY)).toBe(false);
    expect(isProductionOmittedDisabledUnitAnimationAssetKey(ARACHNA_WEB_ATLAS_KEY)).toBe(false);
});

test("moving a queen updates floor crop without recreating the material or changing another queen", () => {
    const container = new Container();
    const footprint = { width: 2, height: 2 };
    drawArachnaQueenWebAura(container, undefined, center, footprint, 2, gs, "first", 1, 0, 0);
    drawArachnaQueenWebAura(container, undefined, center, footprint, 2, gs, "second", 1, 0, 100);
    const first = container.children[1] as Mesh;
    const second = container.children[5] as Mesh;
    const originalGeometry = first.geometry;
    const shader = first.shader;
    const firstContactTexture = first.shader!.resources.uContactField;
    const secondContactTexture = second.shader!.resources.uContactField;
    expect(firstContactTexture).not.toBe(secondContactTexture);
    const edge = { x: gs.getMinX() + gs.getCellSize(), y: center.y };
    drawArachnaQueenWebAura(container, undefined, edge, footprint, 3, gs, "first", 1, 1, 120);
    const expected = arachnaWebBounds(edge, footprint, 3, gs, 1)!;
    expect(first.shader).toBe(shader);
    expect(first.geometry).not.toBe(originalGeometry);
    expect([...first.shader!.resources.silk.uniforms.uBounds]).toEqual([
        expected.left,
        expected.bottom,
        expected.right,
        expected.top,
    ]);
    expect([...first.geometry.getBuffer("aPosition").data].every(Number.isFinite)).toBe(true);
    expect(first.shader!.resources.silk.uniforms.uTime).toBeCloseTo(0.12);
    expect(second.shader!.resources.silk.uniforms.uTime).toBe(0);
    first.destroy();
    // Its paired shadow still samples the field until that layer is destroyed.
    expect(firstContactTexture.destroyed).toBe(false);
    expect(second.shader!.glProgram!.fragment).toContain("void main()");
    container.destroy({ children: true });
    expect(firstContactTexture.destroyed).toBe(true);
    expect(secondContactTexture.destroyed).toBe(true);
});
