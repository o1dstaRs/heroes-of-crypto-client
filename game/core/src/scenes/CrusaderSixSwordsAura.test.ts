import { afterAll, beforeAll, expect, test } from "bun:test";
import { Container, DOMAdapter, Mesh, Texture } from "pixi.js";
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
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

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

test("one rotating seal replaces the four separate swords and releases its own GPU resources", () => {
    const container = new Container();
    const texture = new Texture({ source: Texture.WHITE.source });
    const draw = (time: number) =>
        drawCrusaderSixSwordsAura(container, texture, center, footprint, 2, gs, "crusader", 1, 0, time);
    draw(100);
    draw(100);
    expect(container.children).toHaveLength(1);
    const mesh = container.children[0] as Mesh;
    const shader = mesh.shader!;
    const geometry = mesh.geometry;
    const positions = [...geometry.getBuffer("aPosition").data];
    const initialUV = [...geometry.getBuffer("aUV").data];
    resetCrusaderSixSwordsAuras(container, 1100);
    expect(mesh.visible).toBe(false);
    draw(1100);
    expect(container.children[0]).toBe(mesh);
    expect([...geometry.getBuffer("aPosition").data]).toEqual(positions);
    expect([...geometry.getBuffer("aUV").data]).not.toEqual(initialUV);
    expect(shader.resources.aura.uniforms.uTime).toBeCloseTo(1);
    expect(shader.resources.uSeal).toBe(texture.source);
    expect(mesh.texture).toBe(Texture.WHITE);
    expect(mesh.blendMode).toBe("add");
    expect(mesh.alpha).toBeCloseTo(0.66555);
    expect(mesh.filters ?? []).toHaveLength(0);
    resetCrusaderSixSwordsAuras(container, 7200);
    expect(container.children).toHaveLength(0);
    expect(mesh.destroyed).toBe(true);
    expect(shader.glProgram).toBeNull();
    expect(texture.source.destroyed).toBe(false);
    expect(isLazyCombatEffectAssetKey(CRUSADER_SIX_SWORDS_AURA_KEY)).toBe(true);
    container.destroy();
    texture.destroy(false);
});

test("source alpha handling preserves the extracted artwork without a palette override", () => {
    const root = new Container();
    const texture = new Texture({ source: Texture.WHITE.source });
    drawCrusaderSixSwordsAura(root, texture, center, footprint, 2, gs, "owner", 0.4, 0, 0);
    const seal = root.children[0] as Mesh;
    expect(seal.alpha).toBeCloseTo(0.39933);
    expect(seal.shader!.resources.aura.uniforms.uFieldOpacity).toBeUndefined();
    expect(seal.shader!.resources.aura.uniforms.uStraightAlpha).toBe(
        texture.source.alphaMode === "no-premultiply-alpha" ? 1 : 0,
    );
    root.destroy({ children: true });
    expect(texture.source.destroyed).toBe(false);
    texture.destroy(false);
});

test("rotation keeps a single centred diameter and stationary clipped floor at all phases", () => {
    const initial = crusaderAuraProjection(center, footprint, 2, 0, gs)!;
    const middle = (12 * 25 + 12) * 2;
    for (let step = 0; step < 32; step++) {
        const projection = crusaderAuraProjection(center, footprint, 2, (step * Math.PI) / 16, gs)!;
        expect(projection.positions).toEqual(initial.positions);
        expect(projection.indices).toEqual(initial.indices);
        expect(projection.uvs[middle]).toBeCloseTo(0.5);
        expect(projection.uvs[middle + 1]).toBeCloseTo(0.5);
        for (const vertex of [0, 24, 600, 624]) {
            const x = projection.uvs[vertex * 2] - 0.5;
            const y = projection.uvs[vertex * 2 + 1] - 0.5;
            expect(Math.hypot(x, y)).toBeCloseTo(Math.SQRT1_2);
        }
    }
});

test("multiple owners share the source but not phase or lifetime", () => {
    const root = new Container();
    drawCrusaderSixSwordsAura(root, Texture.WHITE, center, footprint, 2, gs, "a", 1, 0, 0);
    drawCrusaderSixSwordsAura(root, Texture.WHITE, center, footprint, 2, gs, "b", 1, 0, 1000);
    expect(root.children).toHaveLength(2);
    const [a, b] = root.children as Mesh[];
    resetCrusaderSixSwordsAuras(root, 2000);
    drawCrusaderSixSwordsAura(root, Texture.WHITE, center, footprint, 2, gs, "a", 1, 0, 2000);
    drawCrusaderSixSwordsAura(root, Texture.WHITE, center, footprint, 2, gs, "b", 1, 0, 2000);
    expect(a.shader!.resources.aura.uniforms.uTime).toBe(2);
    expect(b.shader!.resources.aura.uniforms.uTime).toBe(1);
    root.destroy({ children: true });
    expect(Texture.WHITE.source.destroyed).toBe(false);
});
