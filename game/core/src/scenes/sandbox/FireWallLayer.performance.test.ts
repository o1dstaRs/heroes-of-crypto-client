import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { Container, DOMAdapter, Sprite, Texture, TextureSource } from "pixi.js";

import { FireWallLayer } from "./FireWallLayer";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

const makeMaterials = () => {
    const texture = () => [new Texture({ source: new TextureSource({ width: 64, height: 64 }) })];
    return { flame: texture(), smoke: texture(), glow: texture(), rock: texture() };
};

interface FireWallLayerInternals {
    time: number;
}

describe("fire wall idle work", () => {
    test("does not advance or project cells before a wall exists", () => {
        const layer = new FireWallLayer(undefined, makeMaterials);
        const internals = layer as unknown as FireWallLayerInternals;
        let projectionCalls = 0;

        layer.update(1 / 60, [], 64, () => {
            projectionCalls += 1;
            return { x: 0, y: 0 };
        });

        expect(internals.time).toBe(0);
        expect(projectionCalls).toBe(0);
        layer.destroy();
    });

    test("reuses stable cell projections between animation frames", () => {
        const layer = new FireWallLayer(undefined, makeMaterials);
        let projectionCalls = 0;
        const toWorld = ({ x, y }: { x: number; y: number }) => {
            projectionCalls += 1;
            return { x: x * 64, y: y * 64, cellSize: 60 };
        };
        const cells = [{ x: 3, y: 4, l: 2 }];

        layer.update(1 / 60, cells, 64, toWorld);
        layer.update(1 / 60, cells, 64, toWorld);
        expect(projectionCalls).toBe(1);

        layer.update(1 / 60, cells, 72, toWorld);
        expect(projectionCalls).toBe(2);
        layer.destroy();
    });
});

test("independent full-width fires rise 1.5 cells, survive lap changes, and release GPU resources", () => {
    const root = new Container();
    root.scale.set(0.8, -0.5);
    const layer = new FireWallLayer((emitter) => {
        root.addChild(emitter);
    }, makeMaterials);
    const cells = [
        { x: 3, y: 4, l: 2 },
        { x: 4, y: 4, l: 2 },
        { x: 5, y: 4, l: 2 },
    ];
    const project = ({ x, y }: { x: number; y: number }) => ({ x: x * 64, y: y * 64, cellSize: 60, width: 64 });
    layer.update(0.32, cells, 64, project);
    expect(root.children).toHaveLength(3);
    const first = root.children[0];
    const sprites = [...first.children] as Sprite[];
    expect(sprites.length).toBeGreaterThan(100);
    expect(first.scale.y).toBeCloseTo(-1.6);
    expect(first.y).toBeCloseTo(256 - 60 * 0.56);
    const positions = sprites.map((p) => [p.x, p.y]);
    for (const [index, sprite] of sprites.entries()) {
        expect([sprite.x, sprite.y, sprite.width, sprite.height, sprite.alpha].every(Number.isFinite)).toBe(true);
        const spark = index >= sprites.length - 28;
        expect(-sprite.y + sprite.height / 2).toBeLessThanOrEqual(
            64 * 1.5 * (spark ? 1.4 : index < 18 ? 1.45 : 1) + 1e-6,
        );
    }
    expect(root.children[1].children.map((p) => p.y)).not.toEqual(sprites.map((p) => p.y));
    layer.update(
        0.1,
        cells.map((c) => ({ ...c, l: 1 })),
        64,
        project,
    );
    expect(first.children).toEqual(sprites);
    expect(sprites.map((p) => [p.x, p.y])).not.toEqual(positions);
    expect(first.scale.y).toBeCloseTo(-1.6);
    layer.update(0.1, [], 64, project);
    expect(root.children).toHaveLength(3);
    layer.update(0.5, [], 64, project);
    expect(root.children).toHaveLength(0);
    expect(first.destroyed).toBe(true);
    layer.destroy();
    layer.destroy();
});

test("wall heat and material lighting are transient and release their filter after burnout", () => {
    const world = new Container();
    const units = new Container();
    world.addChild(units);
    const materials = makeMaterials();
    const layer = new FireWallLayer(
        (emitter) => {
            units.addChild(emitter);
        },
        () => materials,
        (origin) => {
            world.addChild(origin);
        },
    );
    const cells = [{ x: 2, y: 3, l: 2 }];
    const project = () => ({ x: 128, y: 192, width: 64 });
    layer.update(0.32, cells, 64, project);
    expect(world.filters).toHaveLength(1);
    const filter = world.filters![0];
    const particles = units.children[0].children as Sprite[];
    expect(particles.filter((p) => p.blendMode === "add").length).toBeGreaterThan(40);
    layer.update(0.1, cells, 64, project);
    expect(world.filters![0]).toBe(filter);
    layer.update(0.6, [], 64, project);
    expect(world.filters?.length ?? 0).toBe(0);
    expect(units.children).toHaveLength(0);
    layer.destroy();
    expect(world.children).toEqual([units]);
    expect(
        Object.values(materials)
            .flat()
            .every((texture) => texture.destroyed),
    ).toBe(true);
    world.destroy({ children: true });
});

test("connected wall keeps internal edges filled regardless of cell insertion order", () => {
    const cells = [
        { x: 3, y: 4, l: 2 },
        { x: 4, y: 4, l: 2 },
        { x: 5, y: 4, l: 2 },
    ];
    const project = ({ x, y }: { x: number; y: number }) => ({ x: x * 64, y: y * 64, width: 64 });
    const make = (input: typeof cells) => {
        const layer = new FireWallLayer(undefined, makeMaterials);
        layer.update(0.32, input, 64, project);
        return layer;
    };
    const wall = make(cells);
    const reversed = make([...cells].reverse());
    const isolated = make([cells[1]]);
    const center = (layer: FireWallLayer) => layer.getContainer().children.find((child) => child.x === 256)!;
    const flamePositions = (layer: FireWallLayer) =>
        center(layer)
            .children.slice(18, 150)
            .map((sprite) => sprite.x);
    expect(flamePositions(wall)).toEqual(flamePositions(reversed));
    const spread = (layer: FireWallLayer) => {
        const positions = flamePositions(layer);
        return Math.max(...positions) - Math.min(...positions);
    };
    expect(spread(wall)).toBeGreaterThan(spread(isolated));
    // Once its neighbors have burned out, the remaining cell regains natural exposed ends.
    wall.update(0.6, [cells[1]], 64, project);
    isolated.update(0.6, [cells[1]], 64, project);
    expect(flamePositions(wall)).toEqual(flamePositions(isolated));
    for (const layer of [wall, reversed, isolated]) layer.destroy();
});
