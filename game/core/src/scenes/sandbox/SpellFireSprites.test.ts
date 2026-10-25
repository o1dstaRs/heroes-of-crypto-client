import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { FIRE_RING_LIFE_MS, METEOR_FALL_MS, SpellFireSprites, meteorImpactPlan } from "./SpellFireSprites";
import { FIRE_SPELL_PLAYBACK_SPEED, METEOR_FLIGHT_SCALE } from "../../settings/fireSpellTiming";
import { whirlpoolEdgeScale } from "./WhirlpoolWaterEdge";

const footprint = { center: { x: 300, y: 200 }, width: 60, height: 50 };
const atlasTexture = () => new Texture({ source: new TextureSource({ width: 1448, height: 1086 }) });

test("fireball grows inside the target then reaches the surrounding cells and releases its sprites", async () => {
    const atlas = atlasTexture();
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as never);
    const root = new Container();
    let now = 0;
    const layer = new SpellFireSprites(
        (c) => {
            root.addChild(c);
        },
        () => now,
    );
    try {
        await layer.ring(footprint, { ...footprint, width: 180, height: 150 });
        const cast = root.children[0];
        const sprite = cast.children[0] as Sprite;
        now = 250 / FIRE_SPELL_PLAYBACK_SPEED;
        layer.update();
        expect(sprite.width).toBeLessThan(100);
        expect(cast.position.x).toBe(300);
        now = 650 / FIRE_SPELL_PLAYBACK_SPEED;
        layer.update();
        expect(sprite.width).toBeGreaterThan(180);
        expect(sprite.width).toBeLessThan(200);
        expect(cast.scale.y).toBe(-1);
        now = FIRE_RING_LIFE_MS / FIRE_SPELL_PLAYBACK_SPEED;
        layer.update();
        expect(root.children).toHaveLength(0);
        expect(layer.active).toBe(false);
        expect(atlas.source.destroyed).toBe(false);
    } finally {
        layer.clear();
        load.mockRestore();
    }
});

test("meteor fall ends at its own floor impact and every cast expires", async () => {
    const load = spyOn(Assets, "load").mockResolvedValue(atlasTexture() as never);
    const random = spyOn(Math, "random").mockReturnValue(0.5);
    const root = new Container();
    let now = 0;
    const layer = new SpellFireSprites(
        (c) => {
            root.addChild(c);
        },
        () => now,
    );
    try {
        await layer.meteors([footprint]);
        expect(root.children).toHaveLength(2);
        now = 200;
        layer.update();
        const cast = root.children[0];
        const sprite = cast.children[0] as Sprite;
        expect(cast.position.y).toBeGreaterThan(footprint.center.y);
        expect(sprite.width).toBeCloseTo(footprint.width * 1.45 * METEOR_FLIGHT_SCALE);
        now = (METEOR_FALL_MS + 30) / FIRE_SPELL_PLAYBACK_SPEED;
        layer.update();
        expect(cast.position.x).toBe(footprint.center.x);
        expect(cast.position.y).toBe(footprint.center.y);
        expect(sprite.anchor.x).toBe(0.5);
        expect(sprite.width).toBeCloseTo(footprint.width * 0.82);
        now = 3000;
        layer.update();
        expect(root.children).toHaveLength(0);
        expect(layer.active).toBe(false);
    } finally {
        layer.clear();
        random.mockRestore();
        load.mockRestore();
    }
});

test("randomized shower covers all nine cells; landing points stay inside their cell", () => {
    const cells = Array.from({ length: 9 }, (_, i) => ({
        center: { x: (i % 3) * 60, y: Math.floor(i / 3) * 50 },
        width: 60,
        height: 50,
    }));
    for (const random of [() => 0, () => 1, Math.random]) {
        const plan = meteorImpactPlan(cells, random);
        expect(plan).toHaveLength(12);
        const touched = new Set<number>();
        for (const impact of plan) {
            const index = cells.findIndex(
                (cell) =>
                    Math.abs(impact.footprint.center.x - cell.center.x) <= cell.width * 0.121 &&
                    Math.abs(impact.footprint.center.y - cell.center.y) <= cell.height * 0.121,
            );
            expect(index).toBeGreaterThanOrEqual(0);
            touched.add(index);
        }
        expect(touched.size).toBe(9);
    }
    expect(meteorImpactPlan([])).toEqual([]);
});

test("clearing during a fire atlas load cancels the old cast; loading failure is retryable", async () => {
    let resolve!: (texture: Texture) => void;
    const oldLoad = new Promise<Texture>((done) => {
        resolve = done;
    });
    const load = spyOn(Assets, "load")
        .mockImplementationOnce(() => oldLoad as never)
        .mockRejectedValueOnce(new Error("test failure"))
        .mockResolvedValue(atlasTexture() as never);
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const root = new Container();
    const layer = new SpellFireSprites((c) => {
        root.addChild(c);
    });
    try {
        const stale = layer.ring(footprint, footprint);
        layer.clear();
        resolve(atlasTexture());
        await stale;
        expect(root.children).toHaveLength(0);
        await layer.ring(footprint, footprint);
        expect(layer.active).toBe(false);
        await layer.ring(footprint, footprint);
        expect(root.children).toHaveLength(1);
    } finally {
        layer.clear();
        error.mockRestore();
        load.mockRestore();
    }
});

test("water deformation stays within five percent and keeps the centre fixed", () => {
    let min = 1,
        max = 1;
    for (let age = 0; age < 2600; age += 73)
        for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
            const wave = whirlpoolEdgeScale(angle, age, 1);
            min = Math.min(min, wave);
            max = Math.max(max, wave);
            expect(wave).toBeGreaterThanOrEqual(0.95);
            expect(wave).toBeLessThanOrEqual(1.05);
            expect(whirlpoolEdgeScale(angle, age, 0)).toBe(1);
        }
    expect(max - min).toBeGreaterThan(0.07);
});

test("hollow dragon ring starts on the perimeter and never emits a central atmosphere patch", async () => {
    const load = spyOn(Assets, "load").mockResolvedValue(
        new Texture({ source: new TextureSource({ width: 1448, height: 724 }) }) as never,
    );
    const root = new Container();
    let now = 0;
    const samples: { x: number; y: number; width: number; height: number }[] = [];
    const area = { center: { x: 300, y: 200 }, width: 180, height: 150 };
    const layer = new SpellFireSprites(
        (c) => root.addChild(c),
        () => now,
        (sample) => samples.push(sample),
    );
    try {
        await layer.ring(footprint, area, true);
        const node = root.children[0],
            sprite = node.children[0] as Sprite;
        for (now = 30; now < 900; now += 70) {
            layer.update();
            expect(sprite.width).toBeCloseTo(area.width / 0.94);
            expect(node.position.x).toBe(area.center.x);
        }
        expect(samples.length).toBeGreaterThan(8);
        for (const s of samples) {
            expect(Math.hypot((s.x - area.center.x) / area.width, (s.y - area.center.y) / area.height)).toBeCloseTo(
                0.43,
            );
            expect(s.width).toBeLessThan(area.width * 0.25);
        }
    } finally {
        layer.clear();
        load.mockRestore();
        root.destroy({ children: true });
    }
});
