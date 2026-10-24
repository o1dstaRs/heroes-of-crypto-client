import { afterAll, beforeAll, expect, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, DOMAdapter, Mesh, Texture } from "pixi.js";
import { arachnaWebBounds, arachnaWebProjection } from "./ArachnaQueenWebAura";
import { drawAbominationSandAura, resetAbominationSandAuras } from "./AbominationSandAura";

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

test("engine sand preserves original projected dimensions and board-edge crop", () => {
    const cell = gs.getCellSize();
    const normal = arachnaWebBounds(center, { width: 2, height: 2 }, 2, gs)!;
    expect(normal.right - normal.left).toBe(6 * cell);
    expect(normal.top - normal.bottom).toBe(6 * cell);
    const root = new Container();
    const edge = { x: gs.getMinX() + cell, y: gs.getMinY() + cell };
    drawAbominationSandAura(root, undefined, edge, { width: 2, height: 2 }, 2, gs, "abom", 1, 1, 0);
    const mesh = root.children[0] as Mesh;
    const projection = arachnaWebProjection(edge, { width: 2, height: 2 }, 2, gs, 1)!;
    expect([...mesh.geometry.positions]).toEqual([...projection.positions]);
    expect([...mesh.geometry.uvs]).toEqual([...projection.uvs]);
    root.destroy({ children: true });
});

test("hand atlas no longer adds a hand layer", () => {
    const root = new Container();
    drawAbominationSandAura(root, Texture.WHITE, center, { width: 2, height: 2 }, 2, gs, "abom", 1, 0, 0);
    expect(root.children).toHaveLength(4);
    expect(root.children.some((child) => child.label === "abomination-hand-aura")).toBe(false);
    root.destroy({ children: true });
});

test("sand renders without any loaded sprite atlas and covers the owner's cells", () => {
    for (const texture of [undefined, Texture.EMPTY]) {
        const root = new Container();
        drawAbominationSandAura(root, texture, center, { width: 2, height: 2 }, 2, gs, "abom", 1, 0, 0);
        const mesh = root.children[0] as Mesh;
        expect(root.children).toHaveLength(4);
        expect(root.children[1]).toBeInstanceOf(Mesh);
        expect((root.children[1] as Mesh).geometry).toBe(mesh.geometry);
        expect(mesh.shader!.resources.storm.uniforms.uPhaseOffset).toBe(0);
        expect(mesh.shader!.resources.storm.uniforms.uBaseLayer).toBe(1);
        expect((root.children[1] as Mesh).shader!.resources.storm.uniforms.uBaseLayer).toBe(0);
        expect((root.children[2] as Mesh).shader!.resources.storm.uniforms.uPhaseOffset).toBe(Math.PI);
        expect((root.children[2] as Mesh).geometry).toBe(mesh.geometry);
        expect(mesh.texture).toBe(Texture.WHITE);
        expect(mesh.shader).not.toBeNull();
        expect(mesh.mask).toBeUndefined();
        // A full central quad remains indexed: there is no owner-hole mesh or stencil mask.
        const middle = 8 * 17 + 8;
        expect([...mesh.geometry.indices]).toContain(middle);
        expect([...mesh.geometry.indices]).toContain(middle + 1);
        root.destroy({ children: true });
    }
});

test("one continuous GPU clock survives slow frames, duplicate buffs, movement and cleanup", () => {
    const root = new Container();
    const owner = { ...center };
    const draw = (now: number, id = "abom") =>
        drawAbominationSandAura(root, undefined, owner, { width: 2, height: 2 }, 2, gs, id, 0.35, 0, now);
    draw(0);
    const mesh = root.children[0] as Mesh;
    const second = root.children[1] as Mesh;
    const shader = mesh.shader!;
    const geometry = mesh.geometry;
    const positions = [...mesh.geometry.positions];
    for (const now of [250, 500, 800, 1100, 3500, 7937.5, 8000, 8001]) {
        resetAbominationSandAuras(root, now);
        draw(now);
        expect(shader.resources.storm.uniforms.uTime).toBeCloseTo(now / 1000);
        expect([...mesh.geometry.positions]).toEqual(positions);
    }
    expect(mesh.alpha).toBeCloseTo(0.9);
    draw(8001);
    draw(8001);
    expect(root.children).toHaveLength(4);
    owner.x += gs.getCellSize();
    resetAbominationSandAuras(root, 8100);
    draw(8100);
    expect([...mesh.geometry.positions]).not.toEqual(positions);
    expect(shader.resources.storm.uniforms.uTime).toBeCloseTo(8.1);
    draw(8100, "second-abom");
    expect(root.children).toHaveLength(8);
    resetAbominationSandAuras(root, 8200);
    expect(root.children.every((child) => !child.visible)).toBe(true);
    resetAbominationSandAuras(root, 14000);
    expect(root.children).toHaveLength(0);
    expect(mesh.destroyed).toBe(true);
    expect(second.destroyed).toBe(true);
    expect(geometry.buffers).toBeNull();
    expect(shader.resources).toBeNull();
    root.destroy();
});

test("both spirals advance every rendered frame with a fixed half-turn offset and no geometry churn", () => {
    const root = new Container();
    const draw = (now: number) =>
        drawAbominationSandAura(root, undefined, center, { width: 2, height: 2 }, 2, gs, "abom", 1, 0, now);
    draw(0);
    const [base, first, second, airborne] = root.children as Mesh[];
    const geometry = first.geometry;
    const positionBuffer = geometry.getBuffer("aPosition");
    const positions = geometry.positions;
    const update = positionBuffer._updateID;
    for (const now of [16, 32, 48, 49, 50, 66, 79, 125, 4000, 7500, 7999, 8000, 8001]) {
        resetAbominationSandAuras(root, now);
        draw(now);
        expect(first.shader!.resources.storm.uniforms.uTime).toBe(now / 1000);
        expect(second.shader!.resources.storm.uniforms.uTime).toBe(now / 1000);
        expect(base.shader!.resources.storm.uniforms.uTime).toBe(now / 1000);
        expect(base.geometry).toBe(geometry);
        expect(airborne.geometry).toBe(geometry);
        expect(airborne.shader!.resources.storm.uniforms.uTime).toBe(now / 1000);
        expect(airborne.shader!.resources.storm.uniforms.uLift).toBe(0);
        expect(first.shader!.resources.storm.uniforms.uLift).toBe(0);
        expect(
            second.shader!.resources.storm.uniforms.uPhaseOffset - first.shader!.resources.storm.uniforms.uPhaseOffset,
        ).toBe(Math.PI);
        expect(first.geometry).toBe(geometry);
        expect(second.geometry).toBe(geometry);
        expect(geometry.positions).toBe(positions);
        expect(positionBuffer._updateID).toBe(update);
    }
    // The underlay is drawn first and retains geometry until the final layer is gone.
    expect(base.label).toBe("abomination-engine-sand-base");
    expect(base.shader!.resources.storm.uniforms.uBaseLayer).toBe(1);
    first.destroy();
    expect(geometry.buffers).not.toBeNull();
    second.destroy();
    expect(geometry.buffers).not.toBeNull();
    base.destroy();
    expect(geometry.buffers).not.toBeNull();
    airborne.destroy();
    expect(geometry.buffers).toBeNull();
    root.destroy();
});

test("foot veil follows owner depth and shares time/geometry without leaking across roots", () => {
    const floor = new Container();
    const units = new Container();
    const foreground = { container: units, depth: 3617.25 };
    const draw = (now: number) =>
        drawAbominationSandAura(
            floor,
            undefined,
            center,
            { width: 2, height: 2 },
            2,
            gs,
            "abom",
            1,
            0,
            now,
            foreground,
        );
    draw(0);
    const ground = floor.children[0] as Mesh;
    const veil = units.children[0] as Mesh;
    expect(floor.children).toHaveLength(4);
    expect(units.children).toHaveLength(1);
    expect(veil.geometry).toBe(ground.geometry);
    expect(veil.shader!.resources.storm.uniforms.uFrontLayer).toBe(1);
    expect(veil.zIndex).toBe(3617.25);
    expect(veil.shader!.resources.storm.uniforms.uLift).toBeCloseTo(gs.getCellSize() * 0.12);
    foreground.depth = 3900.25;
    resetAbominationSandAuras(floor, 1000);
    expect(veil.visible).toBe(false);
    draw(1000);
    expect(veil.visible).toBe(true);
    expect(veil.zIndex).toBe(3900.25);
    expect(veil.shader!.resources.storm.uniforms.uTime).toBe(1);
    expect(units.children).toHaveLength(1);
    const geometry = veil.geometry;
    floor.destroy({ children: true });
    expect(veil.destroyed).toBe(true);
    expect(units.children).toHaveLength(0);
    expect(geometry.buffers).toBeNull();
    units.destroy();
});

test("unit-root teardown and expired owners release the veil safely in either order", () => {
    for (const unitsFirst of [false, true]) {
        const floor = new Container();
        const units = new Container();
        drawAbominationSandAura(floor, undefined, center, { width: 2, height: 2 }, 2, gs, "abom", 1, 0, 0, {
            container: units,
            depth: 4000,
        });
        const geometry = (units.children[0] as Mesh).geometry;
        if (unitsFirst) units.destroy({ children: true });
        resetAbominationSandAuras(floor, 6000);
        expect(floor.children).toHaveLength(0);
        expect(geometry.buffers).toBeNull();
        if (!unitsFirst) {
            expect(units.children).toHaveLength(0);
            units.destroy();
        }
        floor.destroy();
    }
});
