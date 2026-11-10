import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, DOMAdapter, Graphics, Mesh } from "pixi.js";
import { drawValkyrieBloodAura, resetValkyrieBloodAuras, VALKYRIE_BLOOD_AURA_LIMIT } from "./ValkyrieBloodAura";
import { whiteTigerPawProjection } from "./WhiteTigerPawAura";
import { SandboxDrawer } from "./SandboxDrawer";
import { Sandbox } from "./Sandbox";
import { ValkyrieBloodSpray, bloodDropPosition, BLOOD_DROP_LIMIT } from "./ValkyrieBloodSpray";

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

test("blood retains the tiger's actual boundary for all footprints, ranges and board clipping", () => {
    for (const size of [footprint, { width: 2, height: 1 }, { width: 1, height: 2 }])
        for (const range of [1, 2, 4])
            for (const narrowing of [0, 2]) {
                const root = new Container();
                const point = narrowing ? { x: gs.getMinX() + 3 * cell, y: center.y } : center;
                drawValkyrieBloodAura(root, point, size, range, gs, "v", 1, narrowing, 100);
                const expected = whiteTigerPawProjection(point, size, range, gs, narrowing)!;
                const mesh = root.children[0] as Mesh;
                expect([...mesh.geometry.getBuffer("aPosition").data]).toEqual([...expected.positions]);
                expect([...mesh.geometry.getBuffer("aUV").data]).toEqual([...expected.uvs]);
                root.destroy({ children: true });
            }
});

test("animation, movement, range and mirrored parent reuse the two owned meshes", () => {
    const root = new Container();
    root.scale.set(-0.8, -0.5);
    const draw = (now: number, point = center, range = 2) =>
        drawValkyrieBloodAura(root, point, footprint, range, gs, "v", 0.8, 0, now);
    draw(0);
    const mesh = root.children[0] as Mesh;
    const geometry = mesh.geometry,
        shader = mesh.shader!;
    const releaseGeometry = spyOn(geometry, "destroy"),
        releaseShader = spyOn(shader, "destroy");
    for (let i = 1; i <= 120; i++) {
        resetValkyrieBloodAuras(root, i * 16);
        draw(i * 16);
        draw(i * 16);
        expect(root.children).toHaveLength(2);
        expect((root.children[0] as Mesh).geometry).toBe(geometry);
        expect(shader.resources.aura.uniforms.uTime).toBeCloseTo(i * 0.016, 8);
    }
    draw(2000, { ...center, x: center.x + cell });
    expect(releaseGeometry).not.toHaveBeenCalled();
    expect(releaseShader).not.toHaveBeenCalled();
    expect((root.children[0] as Mesh).geometry).toBe(geometry);
    expect(Array.from(geometry.positions)).toEqual(
        Array.from(whiteTigerPawProjection({ ...center, x: center.x + cell }, footprint, 2, gs)!.positions),
    );
    draw(2020, center, 3);
    expect(root.children).toHaveLength(2);
    resetValkyrieBloodAuras(root, 2021);
    expect(root.children.every((c) => !c.visible)).toBe(true);
    resetValkyrieBloodAuras(root, 7021);
    expect(root.children).toHaveLength(0);
    expect(releaseGeometry).toHaveBeenCalledTimes(1);
    expect(releaseShader).toHaveBeenCalledTimes(1);
    root.destroy();
});

test("spray samples every crossed impulse position independently of frame rate and lands without sliding", () => {
    const bounds = {
        left: center.x - cell * 2.5,
        right: center.x + cell * 2.5,
        bottom: center.y - cell * 2.5,
        top: center.y + cell * 2.5,
    };
    const slow = new ValkyrieBloodSpray(),
        fast = new ValkyrieBloodSpray();
    try {
        for (const [spray, fps] of [
            [slow, 30],
            [fast, 120],
        ] as const) {
            for (let i = 0; i <= fps; i++) spray.update(bounds, gs, 1 + i / fps, 0.7);
        }
        expect(slow.drops.length).toBeGreaterThan(25);
        expect(slow.drops.length).toBeLessThan(40);
        expect(slow.drops).toEqual(fast.drops);
        const drop = slow.drops[0];
        expect(bloodDropPosition(drop, drop.born, cell).z).toBe(0);
        expect(bloodDropPosition(drop, drop.born + drop.flight / 2, cell).z).toBeGreaterThan(0);
        const impact = bloodDropPosition(drop, drop.born + drop.flight + 0.01, cell);
        const settled = bloodDropPosition(drop, drop.born + drop.life, cell);
        expect(impact.z).toBeCloseTo(0);
        expect([settled.x, settled.y]).toEqual([impact.x, impact.y]);
    } finally {
        slow.mesh.destroy();
        fast.mesh.destroy();
    }
});

test("spray stays bounded, retains buffers and clears detached drops on preview jumps or long interruption", () => {
    const bounds = {
        left: center.x - cell * 2.5,
        right: center.x + cell * 2.5,
        bottom: center.y - cell * 2.5,
        top: center.y + cell * 2.5,
    };
    const spray = new ValkyrieBloodSpray();
    const positions = spray.mesh.geometry.positions;
    for (let i = 0; i < 600; i++) spray.update(bounds, gs, i / 60, 0.7);
    expect(spray.drops).toHaveLength(BLOOD_DROP_LIMIT);
    expect(spray.mesh.geometry.positions).toBe(positions);
    const first = { ...spray.drops[0] };
    spray.update({ ...bounds, left: bounds.left + 1, right: bounds.right + 1 }, gs, 10, 0.7);
    expect(spray.drops.some((d) => d.born === first.born && d.x === first.x)).toBe(true);
    spray.update({ ...bounds, left: bounds.left + cell * 3, right: bounds.right + cell * 3 }, gs, 10.01, 0.7);
    expect(spray.drops).toHaveLength(0);
    spray.update(bounds, gs, 12, 0.7);
    expect(spray.drops).toHaveLength(0);
    spray.mesh.destroy();
    expect(spray.drops).toHaveLength(0);
});

test("bounded owner pool, teardown and absent/zero range cannot leave blood behind", () => {
    const root = new Container();
    drawValkyrieBloodAura(root, center, footprint, 0, gs, "none", 1);
    drawValkyrieBloodAura(root, center, footprint, 2, gs, "hidden", 0);
    expect(root.children).toHaveLength(0);
    for (let i = 0; i < 30; i++) drawValkyrieBloodAura(root, center, footprint, 2, gs, String(i), 1, 0, i);
    expect(root.children).toHaveLength(VALKYRIE_BLOOD_AURA_LIMIT * 2);
    const meshes = root.children as Mesh[];
    const releases = meshes.map((m) => spyOn(m.geometry, "destroy"));
    root.destroy({ children: true });
    for (const release of releases) expect(release).toHaveBeenCalledTimes(1);
});

test("scene hides blood before the no-selection early return", () => {
    const root = new Container();
    const g = new Graphics();
    drawValkyrieBloodAura(root, center, footprint, 2, gs, "v", 1);
    const ctx = {
        arachnaWebAuraContainer: root,
        hasGameplayVisuals: () => false,
        updateFireWallRotateHint: () => {},
        clearShotRangeCornerSprites: () => {},
    };
    const draw = (Sandbox.prototype as unknown as { drawGameplayVisuals(g: Graphics): void }).drawGameplayVisuals;
    draw.call(ctx, g);
    expect(root.children.every((c) => !c.visible)).toBe(true);
    root.destroy({ children: true });
    g.destroy();
});

test("selected/hovered War Anger dispatches blood only for Valkyrie and leaves the field empty", () => {
    const root = new Container(),
        g = new Graphics();
    type Draw = (
        g: Graphics,
        p: typeof center,
        attack: number,
        auras: { range: number; isBuff: boolean }[],
        footprint: { width: number; height: number },
        gs: GridSettings,
        phase: number,
        alpha: number,
        owner: { name: string; id: string },
        narrowing: number,
        ctx: { arachnaWebAuraContainer: Container },
    ) => void;
    const draw = (SandboxDrawer as unknown as { drawAuraAndAttackRanges: Draw }).drawAuraAndAttackRanges;
    const fill = spyOn(g, "fill");
    draw(g, center, 0, [{ range: 2, isBuff: false }], footprint, gs, 0, 1, { name: "Valkyrie", id: "v" }, 0, {
        arachnaWebAuraContainer: root,
    });
    expect(root.children.map((c) => c.label)).toEqual(["valkyrie-blood-aura", "valkyrie-blood-spray"]);
    expect(fill).not.toHaveBeenCalled();
    draw(g, center, 0, [{ range: 2, isBuff: false }], footprint, gs, 0, 1, { name: "Valkyrie", id: "v" }, 0, {
        arachnaWebAuraContainer: root,
    });
    expect(root.children).toHaveLength(2);
    draw(g, center, 0, [{ range: 2, isBuff: false }], footprint, gs, 0, 1, { name: "White Tiger", id: "t" }, 0, {
        arachnaWebAuraContainer: root,
    });
    expect(root.children.map((c) => c.label)).toContain("white-tiger-paw-aura");
    expect(root.children.filter((c) => c.label === "valkyrie-blood-aura")).toHaveLength(1);
    root.destroy({ children: true });
    g.destroy();
});
