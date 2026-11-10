import { afterAll, beforeAll, expect, test } from "bun:test";
import { Container, DOMAdapter, Mesh, Texture, type MeshGeometry } from "pixi.js";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { isLazyCombatEffectAssetKey } from "../pixi/imageAssetTiers";
import { griffinTornadoShape, griffinTornadoPoint } from "./GriffinTornadoAura";
import {
    PEGASUS_WINGED_SWORD_AURA_KEY,
    pegasusFloorGeometry,
    pegasusAuraShape,
    PEGASUS_ART_DEPTH_SCALE,
    pegasusFloorPoint,
    drawPegasusWingedSwordAura,
    resetPegasusWingedSwordAuras,
} from "./PegasusWingedSwordAura";

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
const originalAdapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({
        ...originalAdapter,
        createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
    }),
);
afterAll(() => DOMAdapter.set(originalAdapter));

const shells = (root: Container) =>
    root.children
        .flatMap((layer) => layer.children)
        .filter(
            (child) => child instanceof Mesh && child.label.startsWith("pegasus-feather-storm-"),
        ) as Mesh<MeshGeometry>[];

test("all feather and light meshes use the floor surface without a texture", () => {
    for (const range of [1, 2, 4])
        for (const facing of [-1, 1] as const) {
            const root = new Container();
            drawPegasusWingedSwordAura(root, undefined, center, footprint, range, gs, "p", 1, 0, 100, facing);
            const meshes = shells(root);
            expect(meshes).toHaveLength(4);
            meshes.forEach((mesh, i) => {
                if (mesh.label === "pegasus-feather-storm-wind") expect(mesh.blendMode).toBe("add");
                else expect(["normal", "inherit"]).toContain(mesh.blendMode);
                const expected = pegasusFloorGeometry(center, footprint, range, gs, i >= 2, facing);
                expect(mesh.geometry.positions).toEqual(expected.positions);
                expect(mesh.geometry.uvs).toEqual(expected.uvs);
                expect(mesh.geometry.indices).toEqual(expected.indices);
            });
            root.destroy({ children: true });
        }
});

test("turns and movement rebuild floor positions, preserve buffers, and fade to the approved opacity", () => {
    const root = new Container();
    drawPegasusWingedSwordAura(root, Texture.EMPTY, center, footprint, 2, gs, "p", 1, 0, 100, 1);
    const mesh = shells(root)[0],
        buffer = mesh.geometry.getBuffer("aPosition");
    expect(root.children[0].alpha).toBe(0);
    resetPegasusWingedSwordAuras(root, 1100);
    const moved = { x: center.x + gs.getCellSize(), y: center.y };
    drawPegasusWingedSwordAura(root, undefined, moved, footprint, 2, gs, "p", 0.35, 1, 1100, -1);
    expect(mesh.geometry.getBuffer("aPosition")).toBe(buffer);
    expect(mesh.geometry.positions).toEqual(pegasusFloorGeometry(moved, footprint, 2, gs, false, -1).positions);
    expect(root.children[0].alpha).toBe(0.62);
    expect(mesh.shader!.resources.aura.uniforms.uTime).toBe(1);
    root.destroy({ children: true });
});

test("both halves stay on the terrain; duplicate draws share layers and inactivity releases them", () => {
    const root = new Container();
    const draw = (now: number) => drawPegasusWingedSwordAura(root, undefined, center, footprint, 2, gs, "p", 1, 0, now);
    draw(100);
    draw(100);
    expect(root.children).toHaveLength(2);
    const [far, near] = root.children;
    const meshes = shells(root);
    expect(meshes).toHaveLength(4);
    expect(far.parent).toBe(root);
    expect(near.parent).toBe(root);
    expect(near.zIndex).toBe(0);
    resetPegasusWingedSwordAuras(root, 1100);
    expect(far.visible).toBe(false);
    expect(near.visible).toBe(false);
    draw(1100);
    expect(near.parent).toBe(root);
    expect(meshes.every((mesh) => mesh.shader!.resources.aura.uniforms.uTime === 1)).toBe(true);
    resetPegasusWingedSwordAuras(root, 7200);
    expect(root.children).toHaveLength(0);
    expect(meshes.every((mesh) => mesh.destroyed)).toBe(true);
    expect(isLazyCombatEffectAssetKey(PEGASUS_WINGED_SWORD_AURA_KEY)).toBe(true);
    root.destroy();
});

test("destroyed shells recreate the complete effect and floor teardown releases every layer", () => {
    const root = new Container();
    const draw = (now: number) => drawPegasusWingedSwordAura(root, undefined, center, footprint, 2, gs, "p", 1, 0, now);
    draw(100);
    const previous = shells(root);
    previous[0].destroy();
    draw(200);
    expect(previous.every((mesh) => mesh.destroyed)).toBe(true);
    const next = shells(root);
    expect(next).toHaveLength(4);
    root.destroy({ children: true });
    expect(next.every((mesh) => mesh.destroyed)).toBe(true);
    expect(() => resetPegasusWingedSwordAuras(root, 300)).not.toThrow();
});

test("painted lower edge contracts without changing the upper edge, width or footprint", () => {
    for (const range of [1, 2, 4])
        for (const facing of [-1, 1] as const) {
            const base = griffinTornadoShape(footprint, range, gs.getCellSize(), facing);
            const shape = pegasusAuraShape(footprint, range, gs.getCellSize(), facing);
            expect(shape.rx).toBe(base.rx);
            expect(shape.offsetY + shape.ry).toBeCloseTo(base.offsetY + base.ry);
            expect(shape.offsetY - shape.ry).toBeCloseTo(
                base.offsetY - base.ry + 2 * base.ry * (1 - PEGASUS_ART_DEPTH_SCALE),
            );
            expect(shape.innerX).toBe(base.innerX);
            expect(shape.innerY).toBe(base.innerY);
            for (let i = 0; i < 24; i++) {
                const angle = (i * Math.PI) / 12;
                const inner = pegasusFloorPoint(center, shape, angle, 0);
                const outer = pegasusFloorPoint(center, shape, angle, 1);
                const reference = griffinTornadoPoint(center, shape, angle, 1);
                // The diagonal shoulders are fuller, but all artwork remains within its old bounds.
                expect(Math.abs(outer.x - center.x)).toBeGreaterThanOrEqual(Math.abs(reference.x - center.x) - 1e-8);
                expect(Math.abs(outer.x - center.x)).toBeLessThanOrEqual(shape.rx + 1e-8);
                expect(Math.abs(outer.y - center.y - shape.offsetY)).toBeLessThanOrEqual(shape.ry + 1e-8);
                if (i % 6 === 0) {
                    expect(outer.x).toBeCloseTo(reference.x);
                    expect(outer.y).toBeCloseTo(reference.y);
                }
                if (i % 6 === 3) {
                    expect(Math.abs(outer.x - center.x)).toBeGreaterThan(Math.abs(reference.x - center.x) * 1.08);
                }
                expect(inner).toEqual(griffinTornadoPoint(center, shape, angle, 0));
                for (const t of [0.25, 0.5, 0.75]) {
                    const point = pegasusFloorPoint(center, shape, angle, t);
                    expect(point.x).toBeCloseTo(inner.x + (outer.x - inner.x) * t);
                    expect(point.y).toBeCloseTo(inner.y + (outer.y - inner.y) * t);
                }
            }
        }
});

test("zero range, hidden alpha and destroyed owners do not allocate effects", () => {
    const root = new Container();
    drawPegasusWingedSwordAura(root, undefined, center, footprint, 0, gs, "p", 1);
    drawPegasusWingedSwordAura(root, undefined, center, footprint, 2, gs, "p", 0);
    expect(root.children).toHaveLength(0);
    root.destroy();
    expect(() => drawPegasusWingedSwordAura(root, undefined, center, footprint, 2, gs, "p", 1)).not.toThrow();
});

test("late feather atlas load reuses floor meshes, respects 38% transparency and retains the shared texture", () => {
    const root = new Container();
    drawPegasusWingedSwordAura(root, undefined, center, footprint, 2, gs, "late", 1, 0, 100);
    const meshes = shells(root);
    const detail = meshes.filter((mesh) => mesh.label === "pegasus-feather-storm-dust");
    expect(detail).toHaveLength(2);
    expect(detail.every((mesh) => mesh.shader!.resources.aura.uniforms.uReady === 0)).toBe(true);
    resetPegasusWingedSwordAuras(root, 1100);
    drawPegasusWingedSwordAura(root, Texture.WHITE, center, footprint, 2, gs, "late", 1, 0, 1100);
    expect(shells(root)).toEqual(meshes);
    for (const layer of root.children) expect(layer.alpha).toBe(0.62);
    for (const mesh of detail) {
        expect(mesh.shader!.resources.aura.uniforms.uReady).toBe(1);
        expect(mesh.shader!.resources.uFeathers).toBe(Texture.WHITE.source);
    }
    root.destroy({ children: true });
    expect(Texture.WHITE.destroyed).toBe(false);
});

test("procedural epicenter needs no texture, follows movement and releases owned resources", () => {
    const root = new Container();
    drawPegasusWingedSwordAura(root, undefined, center, footprint, 2, gs, "seal", 1, 0, 0);
    resetPegasusWingedSwordAuras(root, 1000);
    drawPegasusWingedSwordAura(root, undefined, center, footprint, 2, gs, "seal", 1, 0, 1000, 1);
    const seal = root.children
        .flatMap((layer) => layer.children)
        .find((mesh) => mesh.label === "pegasus-power-core") as Mesh<MeshGeometry>;
    expect(
        root.children.flatMap((layer) => layer.children).some((mesh) => mesh.label === "pegasus-central-floor-seal"),
    ).toBe(false);
    expect(seal).toBeDefined();
    expect(seal.mask).toBeFalsy();
    const original = seal.geometry.positions.slice();
    const buffer = seal.geometry.getBuffer("aPosition");
    const update = buffer._updateID;
    resetPegasusWingedSwordAuras(root, 1200);
    drawPegasusWingedSwordAura(root, undefined, center, footprint, 2, gs, "seal", 1, 0, 1200, 1);
    expect(seal.geometry.positions).toEqual(original);
    expect(buffer._updateID).toBe(update);
    expect(seal.parent!.alpha).toBe(0.62);
    resetPegasusWingedSwordAuras(root, 1400);
    drawPegasusWingedSwordAura(
        root,
        undefined,
        { x: center.x + gs.getCellSize(), y: center.y },
        footprint,
        2,
        gs,
        "seal",
        1,
        0,
        1400,
        1,
    );
    expect(seal.geometry.positions).not.toEqual(original);
    root.destroy({ children: true });
    expect(seal.destroyed).toBe(true);
    expect(Texture.WHITE.destroyed).toBe(false);
});

test("golden stars reuse their floor geometry while orbiting, fading and tearing down with the owner", () => {
    const root = new Container();
    drawPegasusWingedSwordAura(root, Texture.WHITE, center, footprint, 2, gs, "stars", 1, 0, 0);
    const stars = root.children
        .flatMap((layer) => layer.children)
        .filter((child) => child.label.startsWith("pegasus-golden-star-"));
    expect(stars).toHaveLength(10);
    const points = stars.map((star) => [star.x, star.y]);
    resetPegasusWingedSwordAuras(root, 1600);
    drawPegasusWingedSwordAura(root, Texture.WHITE, center, footprint, 2, gs, "stars", 1, 0, 1600);
    expect(
        root.children
            .flatMap((layer) => layer.children)
            .filter((child) => child.label.startsWith("pegasus-golden-star-")),
    ).toEqual(stars);
    expect(stars.map((star) => [star.x, star.y])).not.toEqual(points);
    expect(stars.every((star) => star.alpha >= 0.18 && star.alpha <= 1)).toBe(true);
    root.destroy({ children: true });
    expect(stars.every((star) => star.destroyed)).toBe(true);
});
