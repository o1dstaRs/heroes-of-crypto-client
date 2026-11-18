import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, DOMAdapter, Mesh } from "pixi.js";
import {
    drawSatyrSylvanAura,
    resetSatyrSylvanAuras,
    sylvanVeilGeometry,
    sylvanArtworkProjection,
    sylvanCoreProjection,
    SYLVAN_ART_SCALE,
} from "./SatyrSylvanAura";
import { arachnaWebBounds } from "./ArachnaQueenWebAura";
import { createSylvanStarMesh, SYLVAN_STAR_COUNT, updateSylvanStars } from "./SatyrSylvanStars";

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
const footprint = { width: 1, height: 1 },
    cell = gs.getCellSize();

test("six bounded meshes reuse resources, deduplicate owner paths, hide, expire and release external layers", () => {
    const floor = new Container(),
        units = new Container();
    const draw = (now: number, alpha = 0.7) =>
        drawSatyrSylvanAura(floor, center, footprint, 2, gs, "satyr", alpha, 0, now, { container: units, depth: 100 });
    draw(100);
    draw(100);
    expect(floor.children.length).toBe(1);
    expect(units.children.length).toBe(2);
    const layer = floor.children[0] as Container;
    const meshes = [layer, ...(units.children as Container[])]
        .flatMap((l) => l.children)
        .filter((c) => c instanceof Mesh) as Mesh[];
    expect(meshes.length).toBe(6);
    const geometries = meshes.map((m) => m.geometry),
        buffers = meshes.map((m) => m.geometry.getBuffer("aPosition").data);
    const releases = meshes.map((m) => spyOn(m.geometry, "destroy"));
    const shaders = meshes.map((m) => spyOn(m.shader!, "destroy"));
    for (let i = 1; i <= 120; i++) {
        resetSatyrSylvanAuras(floor, 100 + i * 16);
        draw(100 + i * 16);
        meshes.forEach((m, k) => {
            expect(m.geometry).toBe(geometries[k]);
            expect(m.geometry.getBuffer("aPosition").data).toBe(buffers[k]);
        });
    }
    resetSatyrSylvanAuras(floor, 2100);
    draw(2100, 0);
    expect(layer.visible).toBe(false);
    expect(units.children.every((c) => !c.visible)).toBe(true);
    resetSatyrSylvanAuras(floor, 8000);
    expect(floor.children.length).toBe(0);
    expect(units.children.length).toBe(0);
    releases.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
    shaders.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
    draw(9000);
    floor.destroy({ children: true });
    expect(units.children.length).toBe(0);
    units.destroy();
});

test("range and board clipping remain factual, artwork is cropped without recentering", () => {
    const edge = { x: gs.getMinX() + 1.5 * cell, y: center.y };
    const bounds = arachnaWebBounds(edge, footprint, 2, gs, 1)!;
    expect(bounds.left).toBe(gs.getMinX() + cell);
    expect(bounds.right).toBe(edge.x + 2.5 * cell);
    const projection = sylvanArtworkProjection(edge, footprint, 2, gs, 1)!;
    expect(projection.uvs[0]).toBeGreaterThan(0);
    const floor = new Container();
    drawSatyrSylvanAura(floor, edge, footprint, 2, gs, "edge", 0.7, 1, 100);
    const ground = (floor.children[0] as Container).children.find((c) => c.label === "satyr-sylvan-floor") as Mesh;
    expect(Array.from(ground.geometry.getBuffer("aUV").data)).toEqual(Array.from(new Float32Array(projection.uvs)));
    resetSatyrSylvanAuras(floor, 200);
    drawSatyrSylvanAura(floor, center, { width: 2, height: 1 }, 3, gs, "second", 0.7, 0, 200);
    expect(floor.children.length).toBe(6);
    floor.destroy({ children: true });
});

test("stars have one depth owner, remain finite under mirroring/zoom, and keep buffers on motion", () => {
    const meshes = [createSylvanStarMesh(), createSylvanStarMesh()];
    const placement = { center, rx: cell * 2.5, ry: cell * 2.5, cell, gs, narrowing: 0 };
    const states = meshes.map((m) => m.geometry.getBuffer("aState").data);
    for (const time of [0, 1, 5, 20, 200]) {
        meshes.forEach((m, i) =>
            updateSylvanStars(m, placement, time, i === 1, { x: 0, y: 0 }, { x: 0, y: 0 }, 1.7, 0.3),
        );
        for (let i = 0; i < SYLVAN_STAR_COUNT; i++)
            expect(Number(states[0][i * 8] > 0) + Number(states[1][i * 8] > 0)).toBeLessThanOrEqual(1);
        expect(states.reduce((n, s) => n + Array.from(s).filter((v, i) => i % 8 === 0 && v > 0).length, 0)).toBe(
            SYLVAN_STAR_COUNT,
        );
        for (const mesh of meshes)
            expect(Array.from(mesh.geometry.getBuffer("aPosition").data).every(Number.isFinite)).toBe(true);
    }
    meshes.forEach((m) => m.destroy());
});

test("front/back veil seams meet and height does not expand gameplay footprint", () => {
    const back = sylvanVeilGeometry(center, cell * 2.5, cell * 2.5, cell, gs, false);
    const front = sylvanVeilGeometry(center, cell * 2.5, cell * 2.5, cell, gs, true);
    for (let row = 0; row <= 8; row++)
        for (let axis = 0; axis < 2; axis++) {
            expect(back.positions[(row * 41 + 40) * 2 + axis]).toBeCloseTo(front.positions[row * 41 * 2 + axis], 4);
            expect(back.positions[row * 41 * 2 + axis]).toBeCloseTo(front.positions[(row * 41 + 40) * 2 + axis], 4);
        }
});

test("expanded art matches Griffin width while the source stays foot-sized across range bonuses", () => {
    expect(0.69 * SYLVAN_ART_SCALE).toBeCloseTo(1.1025, 2);
    const floor = new Container();
    drawSatyrSylvanAura(floor, center, footprint, 1, gs, "small", 0.7, 0, 100);
    drawSatyrSylvanAura(floor, center, footprint, 3, gs, "large", 0.7, 0, 100);
    const layers = floor.children.filter((c) => c.label === "satyr-sylvan-floor-layer") as Container[];
    const cores = layers.map((l) => l.children.find((c) => c.label === "satyr-sylvan-core") as Mesh);
    expect(Array.from(cores[0].geometry.getBuffer("aPosition").data)).toEqual(
        Array.from(cores[1].geometry.getBuffer("aPosition").data),
    );
    const expected = sylvanCoreProjection(center, gs)!;
    expect(Array.from(cores[0].geometry.getBuffer("aPosition").data)).toEqual(
        Array.from(new Float32Array(expected.positions)),
    );
    floor.destroy({ children: true });
});

test("a source outside a narrowed board hides while its remaining outer field can still render", () => {
    const floor = new Container();
    const edge = { x: gs.getMinX() + cell * 0.5, y: center.y };
    drawSatyrSylvanAura(floor, edge, footprint, 3, gs, "edge", 0.7, 3, 100);
    const layer = floor.children[0] as Container;
    const core = layer.children.find((c) => c.label === "satyr-sylvan-core") as Mesh;
    expect(core.visible).toBe(false);
    resetSatyrSylvanAuras(floor, 200);
    drawSatyrSylvanAura(floor, center, footprint, 3, gs, "edge", 0.7, 3, 200);
    expect(core.visible).toBe(true);
    floor.destroy({ children: true });
});
