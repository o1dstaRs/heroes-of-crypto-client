import { expect, test } from "bun:test";
import { Container, Sprite, Texture, TextureSource } from "pixi.js";
import { SpellFireParticles } from "./SpellFireParticles";
import { FIRE_SPELL_PLAYBACK_SPEED } from "../../settings/fireSpellTiming";

const footprint = { center: { x: 300, y: 200 }, width: 60, height: 50 };
function fixture() {
    let now = 0;
    const root = new Container();
    const textures: Texture[] = [];
    const layer = new SpellFireParticles(
        (c, z) => {
            c.zIndex = z;
            root.addChild(c);
        },
        () => now,
        () => {
            const texture = () => {
                const t = new Texture({ source: new TextureSource({ width: 64, height: 64 }) });
                textures.push(t);
                return [t];
            };
            return { flame: texture(), smoke: texture(), glow: texture(), rock: texture(), tongue: texture() };
        },
    );
    return {
        root,
        textures,
        layer,
        at: (time: number) => {
            now = time;
            layer.update();
        },
    };
}

test("particle ring finishes at 1.5x speed, reuses pools and releases owned GPU resources", () => {
    const { root, textures, layer, at } = fixture();
    layer.ring(footprint, { ...footprint, width: 180, height: 150 });
    at(400);
    expect(layer.active).toBe(true);
    expect(root.children.map((c) => c.zIndex)).toEqual([5520, 80]);
    const air = root.children[0];
    const sprites = [...air.children];
    expect(sprites.length).toBeGreaterThan(100);
    at(400);
    expect(air.children).toEqual(sprites);
    for (const child of air.children as Sprite[]) {
        expect([child.x, child.y, child.width, child.height, child.alpha].every(Number.isFinite)).toBe(true);
    }
    at(1400 / FIRE_SPELL_PLAYBACK_SPEED - 1);
    expect(layer.active).toBe(true);
    at(1400 / FIRE_SPELL_PLAYBACK_SPEED);
    expect(layer.active).toBe(false);
    expect(air.children.every((c) => !c.visible)).toBe(true);
    layer.clear();
    expect(root.children).toHaveLength(0);
    expect(textures.every((t) => t.destroyed)).toBe(true);
    layer.ring(footprint, footprint);
    expect(layer.active).toBe(true);
    layer.clear();
});

test("overlapping showers keep finite pooled particles, expire including accelerated launch delays, and reject invalid footprints", () => {
    const { root, layer, at } = fixture();
    layer.ring({ ...footprint, width: NaN }, footprint);
    layer.meteors([]);
    expect(root.children).toHaveLength(0);
    const cells = Array.from({ length: 9 }, (_, i) => ({
        ...footprint,
        center: { x: 300 + (i % 3) * 60, y: 200 + Math.floor(i / 3) * 50 },
    }));
    for (let i = 0; i < 8; i++) layer.meteors(cells);
    for (let t = 50; t < 1600; t += 50) {
        at(t);
        expect(root.children[0].children.length).toBeLessThanOrEqual(2400);
        for (const child of root.children[0].children as Sprite[]) {
            expect([child.x, child.y, child.width, child.height, child.alpha].every(Number.isFinite)).toBe(true);
        }
    }
    at((11 * 95 + 55 + 640 + 630) / FIRE_SPELL_PLAYBACK_SPEED);
    expect(layer.active).toBe(false);
    layer.clear();
});

test("fire arrow samples the raised book until release, freezes its origin, ignites only at arrival and clears", () => {
    const { root, layer, at, textures } = fixture();
    const state = layer as unknown as { casts: { from: { x: number; y: number } }[]; arrows: Container[] };
    let book = { x: 20, y: 80 };
    const arrival = layer.strike(book, footprint, { ...footprint, center: { x: 300, y: 160 } }, () => book);
    expect(arrival).toBeGreaterThan(400);
    at(150);
    book = { x: 60, y: 95 };
    at(260);
    const frozen = { ...state.casts[0].from };
    book = { x: 900, y: 900 };
    at(arrival - 1);
    expect(state.casts[0].from).toEqual(frozen);
    expect(state.arrows.some((a: Container) => a.visible)).toBe(true);
    at(arrival + 50);
    expect(state.arrows.every((a: Container) => !a.visible)).toBe(true);
    const flame = root.children[0].children.filter((c) => c.visible);
    expect(flame.length).toBeGreaterThan(60);
    at(arrival + 1000);
    expect(layer.active).toBe(false);
    expect(root.children.every((c) => c.children.every((p) => !p.visible))).toBe(true);
    layer.clear();
    expect(textures.every((t) => t.destroyed)).toBe(true);
    expect(root.children).toHaveLength(0);
});

test("arrows remain finite in either direction and at zero distance; cancelled casts cannot ignite later", () => {
    const { root, layer, at } = fixture();
    for (const origin of [
        { x: 300, y: 200 },
        { x: 800, y: 700 },
        { x: -200, y: 100 },
    ])
        layer.strike(origin, footprint, footprint);
    for (let time = 0; time < 1400; time += 80) {
        at(time);
        for (const child of root.children.flatMap((c) => c.children))
            expect([child.x, child.y, child.rotation, child.alpha].every(Number.isFinite)).toBe(true);
    }
    layer.clear();
    at(5000);
    expect(root.children).toHaveLength(0);
    expect(layer.active).toBe(false);
});

test("impact notification fires once across a large frame delta, and cancellation suppresses it", () => {
    const { layer, at } = fixture();
    let hits = 0;
    const from = { x: 0, y: 0 };
    const arrival = layer.strike(from, footprint, footprint, undefined, () => hits++);
    at(arrival - 1);
    expect(hits).toBe(0);
    at(arrival + 4000);
    expect(hits).toBe(1);
    at(arrival + 5000);
    expect(hits).toBe(1);
    layer.strike(from, footprint, footprint, undefined, () => hits++);
    layer.clear();
    at(arrival + 10000);
    expect(hits).toBe(1);
});

test("contact fireball expands into all four quadrants and its fade runs 25 percent faster without earlier contact", () => {
    const { layer, at, root } = fixture();
    let hits = 0;
    const arrival = layer.strike({ x: 0, y: 0 }, footprint, footprint, undefined, () => hits++);
    at(arrival - 1);
    expect(hits).toBe(0);
    at(arrival + 180);
    expect(hits).toBe(1);
    const particles = root.children[0].children.filter((c) => c.visible);
    for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
            expect(
                particles.filter((p) => (p.x - footprint.center.x) * sx > 10 && (-p.y - footprint.center.y) * sy > 10)
                    .length,
            ).toBeGreaterThan(3);
        }
    const end = arrival + 1000 / 1.5 / 1.25;
    at(end - 1);
    expect(layer.active).toBe(true);
    at(end + 1);
    expect(layer.active).toBe(false);
    expect(hits).toBe(1);
    layer.clear();
});
