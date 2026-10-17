import { expect, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, Mesh, Texture } from "pixi.js";
import { arachnaWebBounds } from "./ArachnaQueenWebAura";
import {
    championArrowFrames,
    championArrowProjection,
    championArrowGlowTint,
    drawChampionArrowAura,
    resetChampionArrowAuras,
    CHAMPION_ARROW_ATLAS_KEY,
} from "./ChampionArrowAura";
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
const footprint = { width: 2, height: 2 };
const center = { x: gs.getMinX() + gs.getCellSize(), y: gs.getMinY() + gs.getCellSize() };

test("Champion artwork covers the complete six-cell aura and expands with the actual range", () => {
    const cell = gs.getCellSize();
    const middle = { x: gs.getMinX() + 8 * cell, y: gs.getMinY() + 8 * cell };
    for (const range of [2, 3]) {
        const bounds = arachnaWebBounds(middle, footprint, range, gs)!;
        expect((bounds.right - bounds.left) / cell).toBe(2 + 2 * range);
        expect((bounds.top - bounds.bottom) / cell).toBe(2 + 2 * range);
        const container = new Container();
        drawChampionArrowAura(container, Texture.WHITE, middle, footprint, range, gs, "champion", 1, 0, 0);
        const mesh = container.children[0] as Mesh;
        const projection = championArrowProjection(middle, footprint, range, gs)!;
        expect([...mesh.geometry.positions]).toEqual([...projection.positions]);
        for (let i = 0; i < projection.uvs.length; i++) {
            expect(mesh.geometry.uvs[i] * 8).toBeCloseTo(
                Math.max(0.5 / 512, Math.min(1 - 0.5 / 512, projection.uvs[i])),
            );
        }
        container.destroy({ children: true });
    }
});

test("forward aura mirrors its clipped UVs without moving or stretching the footprint", () => {
    const container = new Container();
    const draw = (facing: -1 | 1) =>
        drawChampionArrowAura(container, Texture.WHITE, center, footprint, 2, gs, "champion", 0.7, 1, 1000, facing);
    draw(1);
    const mesh = container.children[0] as Mesh;
    const projection = championArrowProjection(center, footprint, 2, gs, 1)!;
    expect([...mesh.geometry.positions]).toEqual([...projection.positions]);
    const forward = [...mesh.geometry.uvs];
    resetChampionArrowAuras(container, 1000);
    draw(-1);
    for (let i = 0; i < forward.length; i += 2) {
        expect(mesh.geometry.uvs[i] + forward[i]).toBeCloseTo(1 / 8);
        expect(mesh.geometry.uvs[i + 1]).toBe(forward[i + 1]);
    }
    expect([...mesh.geometry.positions]).toEqual([...projection.positions]);
    expect(container.children).toHaveLength(2);
    container.destroy({ children: true });
});

test("64-frame forward loop stays continuous through the seam and slow render ticks", () => {
    expect(championArrowFrames(3175)).toEqual({ frame: 63, next: 0, mix: 0.5 });
    expect(championArrowFrames(3200)).toEqual(championArrowFrames(0));
    expect(championArrowFrames(-1)).toEqual(championArrowFrames(0));
    const container = new Container();
    const draw = (now: number) =>
        drawChampionArrowAura(container, Texture.WHITE, center, footprint, 2, gs, "champion", 0.7, 0, now);
    draw(0);
    for (const now of [250, 750, 2000, 3175]) {
        resetChampionArrowAuras(container, now);
        draw(now);
    }
    expect(
        container.children.filter((child) => child instanceof Mesh).reduce((sum, child) => sum + child.alpha, 0),
    ).toBeCloseTo(0.91 * 0.8);
    const meshes = container.children.filter((child) => child instanceof Mesh) as Mesh[];
    expect(meshes.every((mesh) => mesh.blendMode === "add")).toBe(true);
    expect(meshes[0].tint).toBe(meshes[1].tint);
    expect(meshes[1].alpha / (meshes[0].alpha + meshes[1].alpha)).toBeCloseTo(0.5);
    draw(3175);
    expect(container.children).toHaveLength(2);
    resetChampionArrowAuras(container, 3300);
    expect(meshes.every((mesh) => !mesh.visible)).toBe(true);
    resetChampionArrowAuras(container, 9000);
    expect(container.children).toHaveLength(0);
    container.destroy();
});

test("mint core fades smoothly over 3.2 seconds while green stays lit, including the loop seam", () => {
    expect(championArrowGlowTint(0)).toBe(0x40ff40);
    expect(championArrowGlowTint(1600)).toBe(0xffffff);
    expect(championArrowGlowTint(3200)).toBe(championArrowGlowTint(0));
    let previous = championArrowGlowTint(0) & 255;
    for (let time = 1; time <= 6400; time++) {
        const tint = championArrowGlowTint(time);
        expect((tint >> 8) & 255).toBe(255);
        expect(Math.abs((tint & 255) - previous)).toBeLessThanOrEqual(1);
        previous = tint & 255;
    }
});

test("missing arrow art and zero reach produce no placeholder; atlas loads lazily", () => {
    const container = new Container();
    for (const texture of [undefined, Texture.EMPTY])
        drawChampionArrowAura(container, texture, center, footprint, 2, gs, "champion", 1);
    drawChampionArrowAura(container, Texture.WHITE, center, footprint, 0, gs, "champion", 1);
    expect(container.children).toHaveLength(0);
    expect(isLazyCombatEffectAssetKey(CHAMPION_ARROW_ATLAS_KEY)).toBe(true);
    container.destroy();
});
