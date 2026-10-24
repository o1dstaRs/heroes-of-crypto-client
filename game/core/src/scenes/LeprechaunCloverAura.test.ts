import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, DOMAdapter, Mesh } from "pixi.js";
import {
    drawLeprechaunCloverAura,
    resetLeprechaunCloverAuras,
    LEPRECHAUN_CLOVER_AURA_LIMIT,
} from "./LeprechaunCloverAura";
import { whiteTigerPawProjection } from "./WhiteTigerPawAura";
import { leprechaunCloverProjection } from "./LeprechaunCloverProjection";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

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

test("clovers occupy only Dryad's existing perimeter for rectangular footprints and clipped boards", () => {
    for (const size of [footprint, { width: 2, height: 1 }, { width: 1, height: 2 }])
        for (const range of [1, 2, 4])
            for (const narrowing of [0, 2]) {
                const root = new Container();
                const point = narrowing ? { x: gs.getMinX() + 3 * cell, y: center.y } : center;
                drawLeprechaunCloverAura(root, point, size, range, gs, "lep", 1, narrowing, 100);
                const ribbon = whiteTigerPawProjection(point, size, range, gs, narrowing)!;
                expect(root.children).toHaveLength(2);
                const geometry = (root.children[1] as Mesh).geometry;
                expect(Array.from(geometry.getBuffer("aPosition").data)).toEqual(Array.from(ribbon.positions));

                root.destroy({ children: true });
            }
});

test("movement and mirroring reuse the mesh; hiding and expiry release owned resources once", () => {
    const root = new Container();
    root.scale.set(-0.8, -0.5);
    drawLeprechaunCloverAura(root, center, footprint, 2, gs, "lep", 0.8, 0, 0);
    const meshes = [...root.children] as Mesh[];
    const destroys = meshes.map((mesh) => ({
        geometry: spyOn(mesh.geometry, "destroy"),
        shader: spyOn(mesh.shader!, "destroy"),
    }));
    for (let i = 1; i <= 60; i++) {
        resetLeprechaunCloverAuras(root, i * 16);
        drawLeprechaunCloverAura(root, { ...center, x: center.x + i }, footprint, 2, gs, "lep", 0.8, 0, i * 16);
        expect(root.children).toEqual(meshes);
        for (const mesh of meshes) expect(mesh.shader!.resources.aura.uniforms.uTime).toBeCloseTo(i * 0.016);
    }
    resetLeprechaunCloverAuras(root, 1000);
    for (const mesh of meshes) expect(mesh.visible).toBe(false);
    resetLeprechaunCloverAuras(root, 7000);
    expect(root.children).toHaveLength(0);
    for (const destroy of destroys) {
        expect(destroy.geometry).toHaveBeenCalledTimes(1);
        expect(destroy.shader).toHaveBeenCalledTimes(1);
    }
    root.destroy();
});

test("zero range and hidden owners allocate nothing, owner pool remains bounded", () => {
    const root = new Container();
    drawLeprechaunCloverAura(root, center, footprint, 0, gs, "none", 1);
    drawLeprechaunCloverAura(root, center, footprint, 2, gs, "hidden", 0);
    expect(root.children).toHaveLength(0);
    for (let i = 0; i < 30; i++) drawLeprechaunCloverAura(root, center, footprint, 2, gs, String(i), 1, 0, i);
    expect(root.children).toHaveLength(LEPRECHAUN_CLOVER_AURA_LIMIT * 2);
    root.destroy({ children: true });
});

test("seam clovers keep their anchors and the interior stays closed around the owner after clipping", () => {
    for (const point of [
        { x: center.x + cell / 2, y: center.y + cell / 2 },
        { x: gs.getMinX() + 2.5 * cell, y: center.y + cell / 2 },
    ])
        for (const size of [footprint, { width: 2, height: 1 }]) {
            const projection = leprechaunCloverProjection(point, size, 2, gs, 2)!;
            const { anchors, glow, ribbon } = projection;
            expect(anchors.length).toBeGreaterThan(0);
            for (const anchor of anchors) {
                const horizontal = anchor.y === ribbon.bounds.bottom || anchor.y === ribbon.bounds.top;
                const origin = horizontal
                    ? point.x - (2 + size.width / 2) * cell
                    : point.y - (2 + size.height / 2) * cell;
                const coordinate = ((horizontal ? anchor.x : anchor.y) - origin) / cell;
                expect(coordinate - Math.floor(coordinate)).toBeCloseTo(0.5);
                expect(anchor.x).toBeGreaterThanOrEqual(ribbon.bounds.left);
                expect(anchor.x).toBeLessThanOrEqual(ribbon.bounds.right);
                expect(anchor.y).toBeGreaterThanOrEqual(ribbon.bounds.bottom);
                expect(anchor.y).toBeLessThanOrEqual(ribbon.bounds.top);
            }
            const corners = [
                { x: ribbon.bounds.left, y: ribbon.bounds.bottom },
                { x: ribbon.bounds.right, y: ribbon.bounds.bottom },
                { x: ribbon.bounds.right, y: ribbon.bounds.top },
                { x: ribbon.bounds.left, y: ribbon.bounds.top },
            ];
            const rowSize = Array.from(glow.uvs)
                .filter((_, i) => i % 2 === 1)
                .findIndex((v) => v > 0);
            const rows = glow.positions.length / 2 / rowSize;
            for (let row = 0; row < rows; row++) {
                const start = row * rowSize * 2,
                    end = start + (rowSize - 1) * 2;
                // No crack at the closing edge, even though its UV wraps from 1 back to 0.
                expect(glow.positions[start]).toBeCloseTo(glow.positions[end]);
                expect(glow.positions[start + 1]).toBeCloseTo(glow.positions[end + 1]);
                const travel = glow.uvs[start + 1];
                expect(travel).toBeCloseTo(row / (rows - 1));
                for (let corner = 0; corner < 4; corner++) {
                    const index = start + ((corner * (rowSize - 1)) / 4) * 2;
                    const source = corners[corner];
                    const expected = projectBattlefieldPoint(
                        { x: source.x + (point.x - source.x) * travel, y: source.y + (point.y - source.y) * travel },
                        gs,
                    );
                    expect(glow.positions[index]).toBeCloseTo(expected.x, 3);
                    expect(glow.positions[index + 1]).toBeCloseTo(expected.y, 3);
                }
            }
            const owner = projectBattlefieldPoint(point, gs);
            for (let i = glow.positions.length - rowSize * 2; i < glow.positions.length; i += 2) {
                expect(glow.positions[i]).toBeCloseTo(owner.x, 3);
                expect(glow.positions[i + 1]).toBeCloseTo(owner.y, 3);
            }
            expect(Math.max(...glow.indices)).toBeLessThan(glow.positions.length / 2);
            expect(Math.min(...glow.indices)).toBeGreaterThanOrEqual(0);
        }
});

test("losing either layer releases its surviving companion and recreates both", () => {
    const root = new Container();
    drawLeprechaunCloverAura(root, center, footprint, 2, gs, "lep", 1, 0, 0);
    const old = [...root.children] as Mesh[];
    old[0].destroy();
    drawLeprechaunCloverAura(root, center, footprint, 2, gs, "lep", 1, 0, 100);
    expect(old[1].destroyed).toBe(true);
    expect(root.children).toHaveLength(2);
    root.destroy({ children: true });
});

test("clover UVs and owner-relative anchors stay fixed through fractional movement", () => {
    for (const size of [footprint, { width: 2, height: 1 }, { width: 1, height: 2 }]) {
        const resting = { x: center.x + (size.width * cell) / 2, y: center.y + (size.height * cell) / 2 };
        const before = leprechaunCloverProjection(resting, size, 2, gs)!;
        for (const delta of [
            { x: cell * 0.37, y: 0 },
            { x: 0, y: -cell * 0.61 },
            { x: -cell * 0.42, y: cell * 0.23 },
        ]) {
            const moved = { x: resting.x + delta.x, y: resting.y + delta.y };
            const after = leprechaunCloverProjection(moved, size, 2, gs)!;
            // Tessellation can gain one subdivision from floating-point ceil; its material origin must not move.
            expect(after.ribbon.uvs[0]).toBeCloseTo(before.ribbon.uvs[0]);
            expect(after.ribbon.uvs[after.ribbon.uvs.length - 2]).toBeCloseTo(0);
            expect(after.anchors).toHaveLength(before.anchors.length);
            for (let i = 0; i < before.anchors.length; i++) {
                expect(after.anchors[i].x - moved.x).toBeCloseTo(before.anchors[i].x - resting.x);
                expect(after.anchors[i].y - moved.y).toBeCloseTo(before.anchors[i].y - resting.y);
            }
        }
        for (const anchor of before.anchors) {
            const horizontal = anchor.y === before.ribbon.bounds.bottom || anchor.y === before.ribbon.bounds.top;
            const coordinate = horizontal ? (anchor.x - gs.getMinX()) / cell : (anchor.y - gs.getMinY()) / cell;
            expect(coordinate - Math.floor(coordinate)).toBeCloseTo(0.5);
        }
    }
});

test("board-edge clipping crops owner-local pattern without restarting its phase", () => {
    for (const shift of [0.1, 0.4, 0.8]) {
        const point = { x: gs.getMinX() + (2.5 + shift) * cell, y: center.y + 0.5 * cell };
        const p = leprechaunCloverProjection(point, footprint, 2, gs, 2)!;
        const origin = point.x - 2.5 * cell;
        expect(p.ribbon.uvs[0]).toBeCloseTo((p.ribbon.bounds.left - origin) / cell);
        for (const anchor of p.anchors.filter((a) => a.y === p.ribbon.bounds.bottom)) {
            const local = (anchor.x - origin) / cell;
            expect(local - Math.floor(local)).toBeCloseTo(0.5);
        }
    }
});
