import { afterAll, beforeAll, expect, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, DOMAdapter, Mesh, Texture } from "pixi.js";
import { arachnaWebBounds } from "./ArachnaQueenWebAura";
import { abominationHandPoint, abominationHandProjection } from "./AbominationHandProjection";
import {
    ABOMINATION_HAND_ATLAS_KEY,
    abominationHandFrame,
    drawAbominationHandAura,
    resetAbominationHandAuras,
} from "./AbominationHandAura";
import { isUnitAnimationAtlasKey } from "../pixi/unitAtlasKeys";

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

test("hand aura remains available independently of optional creature animations", () => {
    for (const suffix of ["", "_half", "_quarter"]) {
        expect(isUnitAnimationAtlasKey(ABOMINATION_HAND_ATLAS_KEY + suffix)).toBe(false);
    }
});

test("hand closes and reopens through distinct poses with adjacent turnaround and loop seam", () => {
    const frames = Array.from({ length: 31 }, (_, i) => abominationHandFrame(i * 100));
    expect(frames).toEqual([
        ...Array.from({ length: 16 }, (_, i) => i),
        ...Array.from({ length: 15 }, (_, i) => 14 - i),
    ]);
    expect(abominationHandFrame(-100)).toBe(0);
    expect(abominationHandFrame(1577)).toBe(15);
    expect(abominationHandFrame(3160)).toBe(1);
});

test("rotated half-size hand clips at the board edge without squeezing", () => {
    const cell = gs.getCellSize();
    const normal = arachnaWebBounds(center, { width: 2, height: 2 }, 2, gs)!;
    expect(normal.right - normal.left).toBe(6 * cell);
    const root = new Container();
    const edge = { x: gs.getMinX() + cell, y: gs.getMinY() + cell };
    drawAbominationHandAura(root, Texture.WHITE, edge, { width: 2, height: 2 }, 2, gs, "abom", 1, 1, 0);
    const mesh = root.children[0] as Mesh;
    const projection = abominationHandProjection(edge, { width: 2, height: 2 }, 2, gs, 1)!;
    expect([...mesh.geometry.positions]).toEqual([...projection.positions]);
    for (let i = 0; i < projection.uvs.length; i++) {
        expect(mesh.geometry.uvs[i]).toBeCloseTo(
            Math.max(0.5 / 512, Math.min(1 - 0.5 / 512, projection.uvs[i])) / 4,
            6,
        );
    }
    expect(root.children).toHaveLength(1);
    expect(mesh.label).toBe("abomination-hand-aura");
    root.destroy({ children: true });
});

test("missing atlas never draws a white quad or resurrects the old sand shader", () => {
    const root = new Container();
    for (const texture of [undefined, Texture.EMPTY]) {
        drawAbominationHandAura(root, texture, center, { width: 2, height: 2 }, 2, gs, "abom", 1, 0, 0);
    }
    expect(root.children).toHaveLength(0);
    root.destroy();
});

test("pooled hand keeps its clock, avoids duplicate buffs and releases only its geometry", () => {
    const root = new Container();
    const owner = { ...center };
    const draw = (now: number, id = "abom") =>
        drawAbominationHandAura(root, Texture.WHITE, owner, { width: 2, height: 2 }, 2, gs, id, 0.35, 0, now);
    draw(0);
    const mesh = root.children[0] as Mesh;
    const geometry = mesh.geometry;
    const positions = [...geometry.positions];
    const positionBuffer = geometry.getBuffer("aPosition");
    const update = positionBuffer._updateID;
    for (const now of [250, 500, 800, 1100, 3500, 7937.5, 8000]) {
        resetAbominationHandAuras(root, now);
        draw(now);
        expect([...geometry.positions]).toEqual(positions);
        const frame = abominationHandFrame(now);
        expect(geometry.uvs[0]).toBeCloseTo(((frame % 4) + 0.5 / 512) / 4, 6);
        expect(geometry.uvs[1]).toBeCloseTo((Math.floor(frame / 4) + 0.5 / 512) / 4, 6);
    }
    expect(positionBuffer._updateID).toBe(update);
    expect(mesh.alpha).toBeCloseTo(0.35 * 1.3 * 0.72);
    draw(8000);
    expect(root.children).toHaveLength(1);
    owner.x += gs.getCellSize();
    resetAbominationHandAuras(root, 8100);
    draw(8100);
    expect([...geometry.positions]).not.toEqual(positions);
    expect(geometry.uvs[0]).toBeCloseTo(((abominationHandFrame(8100) % 4) + 0.5 / 512) / 4, 6);
    draw(8100, "second");
    expect(root.children).toHaveLength(2);
    resetAbominationHandAuras(root, 8200);
    expect(root.children.every((child) => !child.visible)).toBe(true);
    resetAbominationHandAuras(root, 14000);
    expect(root.children).toHaveLength(0);
    expect(geometry.buffers).toBeNull();
    expect(Texture.WHITE.destroyed).toBe(false);
    root.destroy();
});

test("whole hand begins at the foot line and points down-right at unchanged scale", () => {
    const cell = gs.getCellSize();
    const point = (u: number, v: number) => abominationHandPoint(center, { width: 2, height: 2 }, 2, cell, u, v);
    const wrist = point(284 / 512, 470 / 512);
    expect(wrist.x).toBeCloseTo(center.x + 0.15 * cell);
    expect(wrist.y).toBeCloseTo(center.y - 0.25 * cell);
    const finger = point(284 / 512, 70 / 512);
    expect(finger.x).toBeGreaterThan(wrist.x);
    expect(finger.y).toBeLessThan(wrist.y);
    expect(Math.hypot(finger.x - wrist.x, finger.y - wrist.y)).toBeCloseTo((400 / 512) * 3 * cell);
    const clipped = abominationHandProjection(
        { x: gs.getMaxX() - cell, y: gs.getMinY() + cell },
        { width: 2, height: 2 },
        2,
        gs,
    )!;
    expect(clipped.uvs.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(clipped.indices.length).toBeGreaterThan(0);
});
