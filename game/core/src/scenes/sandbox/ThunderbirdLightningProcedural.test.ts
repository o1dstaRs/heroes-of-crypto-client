import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { Assets, Container, DOMAdapter, Graphics } from "pixi.js";
import { ThunderbirdLightningProcedural } from "./ThunderbirdLightningProcedural";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("procedural cast keeps exact timing, reuses frame geometry, and cleans shared graphics", () => {
    const root = new Container();
    let now = 0;
    const layer = new ThunderbirdLightningProcedural(
        (c) => {
            root.addChild(c);
        },
        () => now,
    );
    const targets = [
        { x: 100, y: 200 },
        { x: 240, y: 200 },
    ];
    layer.spawn(targets, 110);
    const cast = root.children[0];
    const graphics = cast.children[1] as Graphics;
    const context = graphics.context;
    expect(layer.active).toBe(true);
    expect(cast.visible).toBe(false);
    targets[0].y = 999;
    now = 35;
    layer.update();
    expect(cast.visible).toBe(true);
    const instructions = context.instructions.slice();
    expect(instructions.length).toBeGreaterThan(500);
    // Last four fills are the impact rings at the upper edge, not the changed input point.
    expect(graphics.bounds.maxY).toBeGreaterThan(600);
    expect(graphics.bounds.maxY).toBeLessThan(700);
    now = 40;
    layer.update();
    expect(context.instructions[0]).toBe(instructions[0]);
    now = 155;
    layer.update();
    expect(context.instructions.length).toBeGreaterThan(instructions.length);
    now = 345;
    layer.update();
    expect(layer.active).toBe(true);
    now = 465;
    layer.update();
    expect(layer.active).toBe(false);
    expect(root.children).toHaveLength(0);
    expect(cast.destroyed).toBe(true);
    expect(context.destroyed).toBe(true);
});

test("reset cancels overlapping casts; coincident targets and empty inputs remain safe", () => {
    const root = new Container();
    let now = 0;
    const layer = new ThunderbirdLightningProcedural(
        (c) => {
            root.addChild(c);
        },
        () => now,
    );
    layer.spawn([], 110);
    expect(layer.active).toBe(false);
    layer.spawn(
        [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
        ],
        64,
    );
    layer.spawn([{ x: 50, y: 50 }], 64);
    now = 155;
    layer.update();
    expect(root.children).toHaveLength(2);
    for (const cast of root.children) {
        const bounds = (cast.children[1] as Graphics).bounds;
        expect(Number.isFinite(bounds.minX)).toBe(true);
        expect(Number.isFinite(bounds.maxY)).toBe(true);
    }
    layer.clear();
    expect(root.children).toHaveLength(0);
    expect(layer.active).toBe(false);
    layer.update();
});

test("natural single-target lightning keeps impact timing and palette with finer branching", () => {
    const root = new Container();
    let now = 0;
    const layer = new ThunderbirdLightningProcedural(
        (c) => {
            root.addChild(c);
        },
        () => now,
    );
    const strokes = spyOn(Graphics.prototype, "stroke");
    const fills = spyOn(Graphics.prototype, "fill");
    try {
        const target = [{ x: 100, y: 200 }];
        layer.spawn(target, 110);
        layer.spawn(target, 110, "natural");
        now = 55;
        layer.update();
        const colours = strokes.mock.calls.map(([style]) => (style as { color: number }).color);
        // Casts update in reverse order. The natural cast remains blue even while a violet cast coexists.
        const half = colours.length / 2;
        expect(colours.slice(0, 5)).toEqual([0x0075ff, 0x009dff, 0x23bcff, 0x8fe6ff, 0xf1fcff]);
        expect(colours.slice(half, half + 5)).toEqual([0x5a10ca, 0x8c2cff, 0xb45cff, 0xe1baff, 0xfcf4ff]);
        expect(fills.mock.calls.slice(0, 4).map(([style]) => (style as unknown as { color: number }).color)).toEqual([
            0x009dff, 0x48ceff, 0xb7edff, 0xffffff,
        ]);
        const [violet, natural] = root.children.map((c) => c.children[1] as Graphics);
        expect(natural.bounds.maxY).toBeLessThan(violet.bounds.maxY);
        expect(Math.abs(natural.bounds.maxY - violet.bounds.maxY)).toBeLessThan(5);
        expect(natural.bounds.minY).toBeLessThan(200);
        expect(natural.context.instructions).toHaveLength(violet.context.instructions.length);
        now = 345;
        layer.update();
        expect(layer.active).toBe(false);
        expect(root.children).toHaveLength(0);
    } finally {
        layer.clear();
        strokes.mockRestore();
        fills.mockRestore();
    }
});

test("combat defaults to procedural lightning and reserved atlases stay out of eager bundles", async () => {
    const { CombatVisuals } = await import("./CombatVisuals");
    const { getSplitBundles } = await import("../../pixi/PixiTextureLoader");
    const { isProductionOmittedAssetKey } = await import("../../pixi/imageAssetTiers");
    const root = new Container();
    const visuals = new CombatVisuals({
        attachToWorldRoot: (c: Container) => root.addChild(c),
    } as unknown as ConstructorParameters<typeof CombatVisuals>[0]);
    const load = spyOn(Assets, "load");
    try {
        visuals.spawnChainLightning(
            [
                { x: 100, y: 200 },
                { x: 200, y: 220 },
            ],
            110,
        );
        expect(root.children).toHaveLength(1);
        expect(root.children[0].children.every((c) => c instanceof Graphics)).toBe(true);
        visuals.spawnLightningStrike({ x: 300, y: 200 }, 110);
        expect(root.children).toHaveLength(2);
        expect(load).not.toHaveBeenCalled();
        visuals.clear();
        expect(root.children).toHaveLength(0);
        for (const animationsEnabled of [true, false]) {
            const bundles = getSplitBundles({ animationsEnabled });
            for (const kind of ["arc", "impact"])
                for (const suffix of ["", "_quarter"]) {
                    const key = `vfx_thunderbird_chain_${kind}_atlas${suffix}`;
                    expect(bundles.core[key]).toBeUndefined();
                    expect(bundles.animations[key]).toBeUndefined();
                    expect(bundles.idleAtlases[key]).toBeUndefined();
                    expect(isProductionOmittedAssetKey(key)).toBe(true);
                }
        }
    } finally {
        visuals.clear();
        load.mockRestore();
    }
});
