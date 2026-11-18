import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, DOMAdapter, Graphics, Mesh } from "pixi.js";
import { Sandbox } from "./Sandbox";
import { arachnaWebBounds } from "./ArachnaQueenWebAura";
import { drawWhiteTigerPawAura, resetWhiteTigerPawAuras, whiteTigerPawProjection } from "./WhiteTigerPawAura";

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
const footprint = { width: 2, height: 1 };

test("scene clears the tiger aura when the last interactive overlay disappears", () => {
    const root = new Container();
    const graphics = new Graphics();
    drawWhiteTigerPawAura(root, center, footprint, 2, gs, "tiger", 1);
    expect(root.children.some((child) => child.visible)).toBe(true);
    const draw = (Sandbox.prototype as unknown as { drawGameplayVisuals(g: Graphics): void }).drawGameplayVisuals;
    draw.call(
        {
            arachnaWebAuraContainer: root,
            hasGameplayVisuals: () => false,
            updateFireWallRotateHint: () => {},
            clearShotRangeCornerSprites: () => {},
        },
        graphics,
    );
    expect(root.children.every((child) => !child.visible)).toBe(true);
    root.destroy({ children: true });
    graphics.destroy();
});

test("tiger paw border preserves rectangular range and board narrowing", () => {
    for (const point of [center, { x: gs.getMinX(), y: gs.getMinY() }])
        for (const narrowing of [0, 2])
            for (const range of [1, 3, 4]) {
                const projection = whiteTigerPawProjection(point, footprint, range, gs, narrowing);
                expect(projection?.bounds).toEqual(arachnaWebBounds(point, footprint, range, gs, narrowing));
                if (projection) expect([...projection.positions].every(Number.isFinite)).toBe(true);
            }
    expect(whiteTigerPawProjection(center, footprint, 0, gs)).toBeUndefined();
});

test("tiger aura reuses geometry through animation and deduplicates selection and hover", () => {
    const container = new Container();
    const draw = (now: number) => drawWhiteTigerPawAura(container, center, footprint, 3, gs, "tiger", 0.7, 0, now);
    draw(0);
    const mesh = container.children.find((c) => c.label === "white-tiger-paw-aura") as Mesh;
    const geometry = mesh.geometry;
    const releaseGeometry = spyOn(geometry, "destroy");
    const positions = [...geometry.positions];
    for (const now of [16, 1000, 9000]) {
        resetWhiteTigerPawAuras(container, now === 9000 ? 1001 : now);
        draw(now);
        draw(now);
        expect(container.children).toHaveLength(2);
        expect(mesh.geometry).toBe(geometry);
        expect([...geometry.positions]).toEqual(positions);
    }
    container.destroy({ children: true });
    expect(releaseGeometry).toHaveBeenCalledTimes(1);
});

test("moving tiger replaces only its geometry; deselection and disposal release the effect", () => {
    const container = new Container();
    drawWhiteTigerPawAura(container, center, footprint, 3, gs, "tiger", 1, 0, 0);
    const previous = container.children.find((c) => c.label === "white-tiger-paw-aura") as Mesh;
    drawWhiteTigerPawAura(container, { ...center, x: center.x + cell }, footprint, 3, gs, "tiger", 1, 0, 20);
    expect(previous.destroyed).toBe(true);
    expect(container.children).toHaveLength(2);
    resetWhiteTigerPawAuras(container, 21);
    expect(container.children[0].visible).toBe(false);
    resetWhiteTigerPawAuras(container, 5021);
    expect(container.children).toHaveLength(0);
    container.destroy();
});

test("both tiger materials transition together without rebuilding geometry or restarting steps", () => {
    const container = new Container();
    const draw = (now: number, revealed: boolean) =>
        drawWhiteTigerPawAura(container, center, footprint, 3, gs, "tiger", 1, 0, now, revealed);
    draw(1000, false);
    const meshes = container.children as Mesh[];
    const geometry = meshes.map((m) => m.geometry);
    draw(1200, true);
    for (const m of meshes) {
        expect(m.shader!.resources.aura.uniforms.uAlert).toBeGreaterThan(0.5);
        expect(m.shader!.resources.aura.uniforms.uAlert).toBeLessThan(1);
        expect(m.shader!.resources.aura.uniforms.uTransition).toBe(0);
        expect(m.shader!.resources.aura.uniforms.uTime).toBe(1.2);
    }
    draw(2200, true);
    expect(meshes[0].shader!.resources.aura.uniforms.uAlert).toBeGreaterThan(0.99);
    draw(2400, false);
    for (let i = 0; i < meshes.length; i++) {
        expect(meshes[i].geometry).toBe(geometry[i]);
        expect(meshes[i].shader!.resources.aura.uniforms.uAlert).toBeLessThan(0.3);
    }
    const releases = meshes.map((m) => spyOn(m.geometry, "destroy"));
    resetWhiteTigerPawAuras(container, 8000);
    expect(container.children).toHaveLength(0);
    for (const release of releases) expect(release).toHaveBeenCalledTimes(1);
    container.destroy();
});
