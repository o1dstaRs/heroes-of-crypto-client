import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, DOMAdapter, Mesh } from "pixi.js";
import { drawDryadWindAura, resetDryadWindAuras, DRYAD_WIND_AURA_LIMIT } from "./DryadWindAura";
import { whiteTigerPawProjection } from "./WhiteTigerPawAura";
import { arachnaWebProjection } from "./ArachnaQueenWebAura";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const cell = gs.getCellSize();
const center = { x: gs.getMinX() + 8 * cell, y: gs.getMinY() + 8 * cell };
const footprint = { width: 1, height: 1 };

test("circular artwork preserves the exact Valkyrie perimeter and clips without recentering", () => {
    for (const size of [footprint, { width: 2, height: 1 }, { width: 1, height: 2 }])
        for (const range of [1, 2, 4])
            for (const narrowing of [0, 2]) {
                const root = new Container();
                const point = narrowing ? { x: gs.getMinX() + 3 * cell, y: center.y } : center;
                drawDryadWindAura(root, point, size, range, gs, "d", 1, narrowing, 100);
                const ribbon = whiteTigerPawProjection(point, size, range, gs, narrowing)!;
                const field = arachnaWebProjection(point, size, range, gs, narrowing)!;
                expect(Array.from((root.children[1] as Mesh).geometry.getBuffer("aPosition").data)).toEqual(
                    Array.from(ribbon.positions),
                );
                expect(Array.from((root.children[0] as Mesh).geometry.getBuffer("aUV").data)).toEqual(
                    Array.from(field.uvs),
                );
                root.destroy({ children: true });
            }
});

test("movement, selection and mirror reuse resources; expiry releases both materials once", () => {
    const root = new Container();
    root.scale.set(-0.8, -0.5);
    drawDryadWindAura(root, center, footprint, 2, gs, "d", 0.8, 0, 0);
    const meshes = [...root.children] as Mesh[];
    const destroy = meshes.map((mesh) => [spyOn(mesh.geometry, "destroy"), spyOn(mesh.shader!, "destroy")]);
    for (let i = 1; i <= 60; i++) {
        resetDryadWindAuras(root, i * 16);
        drawDryadWindAura(root, { ...center, x: center.x + i }, footprint, 2, gs, "d", 0.8, 0, i * 16);
        expect(root.children).toEqual(meshes);
        expect(meshes[0].shader!.resources.aura.uniforms.uTime).toBeCloseTo(i * 0.016);
    }
    resetDryadWindAuras(root, 1000);
    expect(root.children.every((mesh) => !mesh.visible)).toBe(true);
    resetDryadWindAuras(root, 7000);
    expect(root.children).toHaveLength(0);
    for (const calls of destroy) for (const call of calls) expect(call).toHaveBeenCalledTimes(1);
    root.destroy();
});

test("zero range and hidden auras allocate nothing; owner pool stays bounded", () => {
    const root = new Container();
    drawDryadWindAura(root, center, footprint, 0, gs, "none", 1);
    drawDryadWindAura(root, center, footprint, 2, gs, "hidden", 0);
    expect(root.children).toHaveLength(0);
    for (let i = 0; i < 30; i++) drawDryadWindAura(root, center, footprint, 2, gs, String(i), 1, 0, i);
    expect(root.children).toHaveLength(DRYAD_WIND_AURA_LIMIT * 2);
    root.destroy({ children: true });
});

test("Peasant reverses artwork without changing Dryad or any range geometry", () => {
    const root = new Container();
    drawDryadWindAura(root, center, footprint, 2, gs, "dryad", 0.8, 0, 1000);
    drawDryadWindAura(root, center, footprint, 2, gs, "peasant", 0.8, 0, 1000, true);
    const meshes = root.children as Mesh[];
    for (let i = 0; i < 2; i++) {
        expect(meshes[i].shader!.resources.aura.uniforms.uInward).toBe(0);
        expect(meshes[i + 2].shader!.resources.aura.uniforms.uInward).toBe(1);
        expect(Array.from(meshes[i].geometry.getBuffer("aPosition").data)).toEqual(
            Array.from(meshes[i + 2].geometry.getBuffer("aPosition").data),
        );
        expect(Array.from(meshes[i].geometry.getBuffer("aUV").data)).toEqual(
            Array.from(meshes[i + 2].geometry.getBuffer("aUV").data),
        );
    }
    drawDryadWindAura(root, center, footprint, 2, gs, "peasant", 0.8, 0, 1500, true);
    expect(root.children).toHaveLength(4);
    root.destroy({ children: true });
});
