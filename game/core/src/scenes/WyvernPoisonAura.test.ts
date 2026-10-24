import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, DOMAdapter, Mesh } from "pixi.js";
import { drawWyvernPoisonAura, resetWyvernPoisonAuras } from "./WyvernPoisonAura";
import { arachnaWebBounds, arachnaWebProjection } from "./ArachnaQueenWebAura";

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
const center = { x: (gs.getMinX() + gs.getMaxX()) / 2, y: (gs.getMinY() + gs.getMaxY()) / 2 };
const footprint = { width: 2, height: 1 };

test("selected poison reuses GPU resources and releases both depth-sorted halves", () => {
    const floor = new Container(),
        units = new Container();
    const draw = (now: number) =>
        drawWyvernPoisonAura(floor, center, footprint, 2, gs, "wyvern", 0.7, 0, now, { container: units, depth: 100 });
    draw(100);
    const layer = floor.children[0] as Container;
    const mesh = layer.children.find((c) => c.label === "wyvern-poison-floor") as Mesh;
    const geometry = mesh.geometry,
        shader = mesh.shader;
    const releaseShader = spyOn(shader!, "destroy");
    const releaseGeometry = spyOn(geometry, "destroy");
    const positions = geometry.getBuffer("aPosition").data;
    expect(units.children.length).toBe(2);
    const vents = units.children
        .flatMap((layer) => (layer as Container).children)
        .filter((child) => child.label === "wyvern-poison-vent") as Mesh[];
    expect(vents.length).toBe(4);
    const ventGeometry = vents.map((vent) => vent.geometry);
    const ventReleases = vents.map((vent) => spyOn(vent.geometry, "destroy"));
    for (let i = 1; i <= 120; i++) {
        resetWyvernPoisonAuras(floor, 100 + i * 16);
        draw(100 + i * 16);
        expect(mesh.geometry).toBe(geometry);
        vents.forEach((vent, index) => expect(vent.geometry).toBe(ventGeometry[index]));
        expect(mesh.shader).toBe(shader);
        expect(geometry.getBuffer("aPosition").data).toBe(positions);
    }
    resetWyvernPoisonAuras(floor, 2100);
    expect(units.children.every((c) => !c.visible)).toBe(true);
    resetWyvernPoisonAuras(floor, 8000);
    expect(floor.children.length).toBe(0);
    expect(units.children.length).toBe(0);
    expect(mesh.destroyed).toBe(true);
    vents.forEach((vent, index) => {
        expect(vent.destroyed).toBe(true);
        expect(ventReleases[index]).toHaveBeenCalledTimes(1);
    });
    expect(releaseShader).toHaveBeenCalledTimes(1);
    expect(releaseGeometry).toHaveBeenCalledTimes(1);
    draw(9000);
    floor.destroy({ children: true });
    expect(units.children.length).toBe(0);
    units.destroy();
});

test("clipping crops the approved artwork without recentering it or changing factual reach", () => {
    const cell = gs.getCellSize();
    const edge = { x: gs.getMinX() + cell * 2, y: center.y };
    const bounds = arachnaWebBounds(edge, footprint, 2, gs, 1)!;
    expect(bounds.left).toBe(gs.getMinX() + cell);
    expect(bounds.right).toBe(edge.x + 3 * cell);
    expect(bounds.top).toBe(edge.y + 2.5 * cell);
    const expected = arachnaWebProjection(edge, footprint, 2, gs, 1)!;
    const floor = new Container();
    drawWyvernPoisonAura(floor, edge, footprint, 2, gs, "edge", 0.7, 1, 100);
    const layer = floor.children[0] as Container;
    const mesh = layer.children.find((c) => c.label === "wyvern-poison-floor") as Mesh;
    const uvs = mesh.geometry.getBuffer("aUV").data;
    // Board clipping retains the factual UV origin, while paint can extend beyond range on the open side.
    expect(uvs[0]).toBeCloseTo(expected.uvs[0], 5);
    expect(Math.max(...Array.from(uvs))).toBeGreaterThan(1);
    expect(expected.uvs[0]).toBeGreaterThan(0);
    floor.destroy({ children: true });
});

test("movement emits a bounded fading wake; teleports and hidden owners do not leave poison behind", () => {
    const floor = new Container();
    const cell = gs.getCellSize();
    const draw = (x: number, now: number) => {
        resetWyvernPoisonAuras(floor, now);
        drawWyvernPoisonAura(floor, { x, y: center.y }, footprint, 2, gs, "moving", 0.7, 0, now);
    };
    draw(center.x, 100);
    const layer = floor.children[0] as Container;
    const wake = layer.children.filter((c) => c.label === "wyvern-poison-trail");
    expect(wake.length).toBe(6);
    for (let i = 1; i <= 12; i++) draw(center.x + i * cell * 0.2, 100 + i * 100);
    expect(wake.filter((c) => c.visible).length).toBe(6);
    for (let i = 1; i <= 20; i++) draw(center.x + cell * 2.4, 1300 + i * 100);
    expect(wake.some((c) => c.visible)).toBe(false);
    draw(center.x - cell * 2, 3400);
    expect(wake.some((c) => c.visible)).toBe(false);
    resetWyvernPoisonAuras(floor, 3500);
    expect(layer.visible).toBe(false);
    floor.destroy({ children: true });
});
