import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import {
    LIGHTNING_FRAME_MS,
    lightningFrameAt,
    lightningPath,
    ThunderbirdLightningSprites,
} from "./ThunderbirdLightningSprites";

test("overhead first strike, then ordered target-to-target arcs with exact frame boundaries", () => {
    const targets = [
        { x: 100, y: 200 },
        { x: 200, y: 220 },
        { x: 250, y: 180 },
    ];
    const path = lightningPath(targets, 100);
    const upperEdges = [
        { x: 100, y: 250 },
        { x: 200, y: 270 },
        { x: 250, y: 230 },
    ];
    expect(path[0].from).toEqual({ x: 122, y: 590 });
    expect(path.map((p) => p.to)).toEqual(upperEdges);
    expect(path[1].from).toEqual(upperEdges[0]);
    expect(path[2].from).toEqual(upperEdges[1]);
    expect(targets[0]).toEqual({ x: 100, y: 200 });
    expect(path.map((p) => p.delayMs)).toEqual([35, 155, 275]);
    let ms = 0;
    for (const [i, duration] of LIGHTNING_FRAME_MS.entries()) {
        expect(lightningFrameAt(ms)).toBe(i);
        expect(lightningFrameAt(ms + duration - 0.001)).toBe(i);
        ms += duration;
    }
    expect(ms).toBe(310);
    expect(lightningFrameAt(-1)).toBeUndefined();
    expect(lightningFrameAt(310)).toBeUndefined();
});

test("painted sprites strike every endpoint exactly and expire without destroying shared atlas", async () => {
    const atlas = new Texture({ source: new TextureSource({ width: 4096, height: 4096 }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const root = new Container();
    let now = 0;
    const layer = new ThunderbirdLightningSprites(
        (c) => {
            root.addChild(c);
        },
        () => now,
    );
    try {
        const targets = [
            { x: 100, y: 200 },
            { x: 240, y: 120 },
        ];
        await layer.spawn(targets, 64);
        expect(root.children.length).toBe(4);
        expect(root.children.every((c) => !c.visible)).toBe(true);
        const paths = lightningPath(targets, 64);
        for (let i = 0; i < paths.length; i++) {
            const beam = root.children[i * 2],
                sprite = beam.children[0] as Sprite;
            const length = (sprite.width * 10) / 12;
            expect(beam.x + Math.cos(sprite.rotation) * length).toBeCloseTo(paths[i].to.x, 6);
            expect(beam.y - Math.sin(sprite.rotation) * length).toBeCloseTo(paths[i].to.y, 6);
            expect(beam.scale.y).toBe(-1);
            expect(root.children[i * 2 + 1].position).toMatchObject(paths[i].to);
        }
        now = 35;
        layer.update();
        expect(root.children[0].visible).toBe(true);
        expect(root.children[2].visible).toBe(false);
        now = 155;
        layer.update();
        expect(root.children.every((c) => c.visible)).toBe(true);
        now = 465;
        layer.update();
        expect(layer.active).toBe(false);
        expect(root.children).toHaveLength(0);
        expect(atlas.destroyed).toBe(false);
    } finally {
        layer.clear();
        load.mockRestore();
    }
});

test("reset cancels pending load and single target still gets overhead lightning", async () => {
    let resolve!: (value: Texture) => void;
    const pending = new Promise<Texture>((r) => (resolve = r));
    const load = spyOn(Assets, "load").mockReturnValue(pending as unknown as Promise<Record<string, unknown>>);
    const root = new Container();
    const layer = new ThunderbirdLightningSprites((c) => {
        root.addChild(c);
    });
    try {
        const spawning = layer.spawn([{ x: 1, y: 2 }], 64);
        expect(layer.active).toBe(true);
        layer.clear();
        resolve(Texture.WHITE);
        await spawning;
        expect(root.children).toHaveLength(0);
        expect(layer.active).toBe(false);
        expect(lightningPath([{ x: 1, y: 2 }], 64)).toHaveLength(1);
    } finally {
        layer.clear();
        load.mockRestore();
    }
});

test("live and replay recipients keep primary once, preserve bounce order and suppress misses/resistance", async () => {
    const { chainLightningRecipients } = await import("./chainLightningRecipients");
    const damage = {
        amount: 10,
        render: true,
        unitPosition: { x: 1, y: 2 },
        unitIsSmall: true,
        unitId: "primary",
        secondary: [
            {
                source: "chain_lightning" as const,
                unitId: "primary",
                position: { x: 1, y: 2 },
                amount: 3,
                unitsDied: 0,
            },
            { source: "chain_lightning" as const, unitId: "second", position: { x: 3, y: 2 }, amount: 2, unitsDied: 0 },
        ],
    };
    expect(chainLightningRecipients(damage).map((p) => p.unitId)).toEqual(["primary", "second"]);
    expect(chainLightningRecipients({ ...damage, secondary: damage.secondary.slice(1) }).map((p) => p.unitId)).toEqual([
        "primary",
        "second",
    ]);
    expect(chainLightningRecipients({ ...damage, missed: true })).toEqual([]);
    expect(chainLightningRecipients({ ...damage, secondary: [] })).toEqual([]);
    expect(chainLightningRecipients({ ...damage, unitId: undefined })).toHaveLength(2);
});
