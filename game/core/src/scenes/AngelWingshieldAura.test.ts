import { expect, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, Mesh, Texture } from "pixi.js";
import { isLazyCombatEffectAssetKey } from "../pixi/imageAssetTiers";
import {
    ANGEL_WINGSHIELD_TEXTURE_KEY,
    angelWingshieldProjection,
    angelWingshieldWind,
    angelWingshieldArrow,
    drawAngelWingshieldAura,
    resetAngelWingshieldAuras,
} from "./AngelWingshieldAura";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";
const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

test("global wingshield is projected onto surviving floor cells, without a radius around Angel", () => {
    for (const narrowing of [0, 1, 3]) {
        const projection = angelWingshieldProjection(gs, narrowing)!;
        const inset = narrowing * gs.getCellSize();
        const corner = projectBattlefieldPoint({ x: gs.getMinX() + inset, y: gs.getMaxY() - inset }, gs);
        expect(projection.positions[0]).toBeCloseTo(corner.x, 3);
        expect(projection.positions[1]).toBeCloseTo(corner.y, 3);
        expect(projection.uvs[0]).toBeCloseTo(inset / (gs.getMaxX() - gs.getMinX()));
        expect(projection.uvs[1]).toBeCloseTo(inset / (gs.getMaxY() - gs.getMinY()));
    }
    expect(isLazyCombatEffectAssetKey(ANGEL_WINGSHIELD_TEXTURE_KEY)).toBe(true);
});

test("wind loops without moving the shield; arrows strike then split and fade on staggered clocks", () => {
    for (const age of [0, 300, 1600, 3200]) expect(angelWingshieldWind(0.5, 0.5, age)).toEqual([0.5, 0.5]);
    expect(angelWingshieldWind(0.22, 0.4, 0)).not.toEqual(angelWingshieldWind(0.22, 0.4, 800));
    const start = angelWingshieldWind(0.22, 0.4, 0),
        loop = angelWingshieldWind(0.22, 0.4, 3200);
    expect(start[0]).toBeCloseTo(loop[0]);
    expect(start[1]).toBeCloseTo(loop[1]);
    const flight = angelWingshieldArrow(1000, 0),
        impact = angelWingshieldArrow(1070, 0),
        fade = angelWingshieldArrow(1700, 0);
    expect(flight.broken).toBe(false);
    expect(impact.broken).toBe(true);
    expect(impact.x).toBeCloseTo(impact.impactX);
    expect(fade.alpha).toBeLessThan(impact.alpha);
    expect(angelWingshieldArrow(1000, 1).phase).not.toBe(flight.phase);
});

test("selected and hovered previews reuse floor geometry and disappear when blessing is no longer drawn", () => {
    const root = new Container();
    drawAngelWingshieldAura(root, Texture.WHITE, gs, "angel", 0.7, 0, 0);
    drawAngelWingshieldAura(root, Texture.WHITE, gs, "angel", 0.7, 0, 20);
    expect(root.children).toHaveLength(2);
    resetAngelWingshieldAuras(root, 500);
    expect(root.children.every((c) => !c.visible)).toBe(true);
    drawAngelWingshieldAura(root, Texture.WHITE, gs, "angel", 0.7, 0, 1200);
    const mesh = root.children[0] as Mesh;
    expect(mesh.alpha).toBeGreaterThan(0);
    expect(mesh.alpha).toBeLessThan(0.4);
    expect([...mesh.geometry.positions]).toEqual([...angelWingshieldProjection(gs)!.positions]);
    resetAngelWingshieldAuras(root, 7000);
    expect(root.children).toHaveLength(0);
    root.destroy({ children: true });
});
