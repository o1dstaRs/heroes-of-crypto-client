import { expect, test } from "bun:test";
import {
    zenaAuraRings,
    zenaAuraProjection,
    drawZenaChakramAura,
    resetZenaChakramAuras,
    ZENA_CHAKRAM_AURA_KEY,
} from "./ZenaChakramAura";
import { Container, Texture } from "pixi.js";
import { GridSettings, GridConstants } from "@heroesofcrypto/common";
import { isLazyCombatEffectAssetKey } from "../pixi/imageAssetTiers";
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

test("one full-size ring remains visible without growing or pulsing", () => {
    for (const now of [0, 2500, 6000, 12000, 39999, 40000, 45000]) {
        const rings = zenaAuraRings(now);
        expect(rings).toHaveLength(1);
        expect(rings[0].progress).toBe(1);
        expect(rings[0].fade).toBe(1);
    }
});

test("the top arrow moves right after a slow clockwise quarter-turn", () => {
    const rotation = zenaAuraRings(10000)[0].rotation;
    expect(rotation).toBeCloseTo(-Math.PI / 2);
    const rx = gs.getCellSize() * 2;
    const projection = zenaAuraProjection(center, rx, rx, rotation, gs)!;
    // Rightmost vertex on the middle row samples the top of the sprite after a quarter-turn.
    const right = (12 * 25 + 24) * 2;
    expect(projection.uvs[right]).toBeCloseTo(0.5);
    expect(projection.uvs[right + 1]).toBeLessThan(0.01);
    expect(zenaAuraRings(40000)[0].rotation).toBeCloseTo(0);
});

test("rotated artwork stays centred and board edges crop its UVs", () => {
    const rx = gs.getCellSize() * 3;
    const projection = zenaAuraProjection(center, rx, rx, Math.PI / 4, gs)!;
    const middle = (12 * 25 + 12) * 2;
    expect(projection.uvs[middle]).toBeCloseTo(0.5);
    expect(projection.uvs[middle + 1]).toBeCloseTo(0.5);
    expect([...projection.positions].every(Number.isFinite)).toBe(true);
    expect(Math.min(...projection.uvs)).toBeLessThan(0);
    expect(Math.max(...projection.uvs)).toBeGreaterThan(1);
    expect(Math.max(...projection.indices)).toBeLessThan(projection.positions.length / 2);
    const clipped = zenaAuraProjection({ x: gs.getMinX() + rx / 3, y: center.y }, rx, rx, 0, gs)!;
    expect(clipped.uvs[0]).toBeCloseTo(0.5 - 0.42 / 3);
    expect(zenaAuraProjection(center, 0, rx, 0, gs)).toBeUndefined();
});

test("the rotating ring reuses its floor mesh and release them when the owner is no longer inspected", () => {
    const container = new Container();
    const draw = (now: number) =>
        drawZenaChakramAura(
            container,
            Texture.WHITE,
            center,
            gs.getCellSize() * 3.5,
            gs.getCellSize() * 3.5,
            { width: 1, height: 1 },
            gs,
            now,
            1,
            0,
            "zena",
        );
    draw(4800);
    expect(container.children.length).toBeGreaterThan(0);
    const firstMesh = container.children[0] as import("pixi.js").Mesh;
    const positions = [...firstMesh.geometry.getBuffer("aPosition").data];
    for (let now = 5000; now < 16000; now += 100) {
        resetZenaChakramAuras(container, now);
        draw(now);
        draw(now);
        expect(container.children).toHaveLength(1);
        expect(container.children.every((mesh) => mesh.alpha === 0.25)).toBe(true);
        expect(container.children[0]).toBe(firstMesh);
        expect([...firstMesh.geometry.getBuffer("aPosition").data]).toEqual(positions);
    }
    resetZenaChakramAuras(container, 16000);
    expect(container.children.every((mesh) => !mesh.visible)).toBe(true);
    resetZenaChakramAuras(container, 22000);
    expect(container.children).toHaveLength(0);
    container.destroy();
});

test("authored chakram sprite loads on demand through the combat effect tier", () => {
    expect(isLazyCombatEffectAssetKey(ZENA_CHAKRAM_AURA_KEY)).toBe(true);
});
