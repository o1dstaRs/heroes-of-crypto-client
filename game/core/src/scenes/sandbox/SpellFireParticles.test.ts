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

test("recorded impacts own completion until contact, while lingering fire is nonblocking", async () => {
    const { layer, at } = fixture();
    let hits = 0;
    const arrival = layer.strike({ x: 0, y: 0 }, footprint, footprint, undefined, () => hits++);
    expect(layer.hasPendingImpacts).toBe(true);
    let settled = false;
    const finished = layer.waitForPendingImpacts().then((completed) => {
        settled = true;
        return completed;
    });
    at(arrival - 1);
    await Promise.resolve();
    expect(settled).toBe(false);
    at(arrival);
    expect(await finished).toBe(true);
    expect(hits).toBe(1);
    expect(layer.hasPendingImpacts).toBe(false);
    expect(layer.active).toBe(true);
    layer.clear();
});

test("teardown cancels pending contacts and resolves their wait without late damage", async () => {
    const { layer, at } = fixture();
    let hits = 0;
    layer.strike({ x: 0, y: 0 }, footprint, footprint, undefined, () => hits++);
    const finished = layer.waitForPendingImpacts();
    layer.clear();
    expect(await finished).toBe(false);
    expect(layer.hasPendingImpacts).toBe(false);
    at(10000);
    expect(hits).toBe(0);
});

test("Fireball rotates through a finite flight and has exactly one contact before its impact burst", async () => {
    const { layer, at, root } = fixture();
    let hits = 0;
    const arrival = layer.fireball({ x: 0, y: 0 }, footprint, footprint, () => hits++);
    expect(arrival).toBeGreaterThan(0);
    const finished = layer.waitForPendingImpacts();
    at(arrival * 0.3);
    const first = root.children[0].children.filter((sprite) => sprite.visible).map((sprite) => sprite.rotation);
    expect(first.length).toBeGreaterThan(20);
    at(arrival * 0.6);
    const second = root.children[0].children.filter((sprite) => sprite.visible).map((sprite) => sprite.rotation);
    expect(second).not.toEqual(first);
    expect(hits).toBe(0);
    at(arrival);
    expect(await finished).toBe(true);
    expect(hits).toBe(1);
    at(arrival + 5000);
    expect(hits).toBe(1);
    expect(layer.hasPendingImpacts).toBe(false);
    layer.clear();
});

test("a Fireball contact enqueues its explosion in the same update without losing the new cast", async () => {
    const { root, layer, at } = fixture();
    const arrival = layer.fireball({ x: 0, y: 200 }, footprint, footprint, () => layer.ring(footprint, footprint));
    const waiting = layer.waitForPendingImpacts();
    at(arrival);
    expect(await waiting).toBe(true);
    expect(layer.active).toBe(true);
    at(arrival + 40);
    expect(root.children[0].children.some((p) => p.visible && p.alpha > 0)).toBe(true);
    at(arrival + 1500);
    expect(layer.active).toBe(false);
    layer.clear();
});

test("contact teardown is reentrant and cannot resurrect a cast or leak its waiter", async () => {
    const { root, layer, at } = fixture();
    const arrival = layer.strike({ x: 0, y: 200 }, footprint, footprint, undefined, () => layer.clear());
    const waiting = layer.waitForPendingImpacts();
    at(arrival);
    expect(await waiting).toBe(false);
    expect(layer.active).toBe(false);
    expect(layer.hasPendingImpacts).toBe(false);
    expect(root.children).toHaveLength(0);
    at(3000);
    expect(layer.active).toBe(false);
});

test("visual callback failure releases contact waiters instead of hanging the action queue", async () => {
    const { layer, at } = fixture();
    const arrival = layer.strike({ x: 0, y: 200 }, footprint, footprint, undefined, () => {
        throw new Error("impact failed");
    });
    const waiting = layer.waitForPendingImpacts();
    expect(() => at(arrival)).toThrow("impact failed");
    expect(await waiting).toBe(false);
    expect(layer.hasPendingImpacts).toBe(false);
    layer.clear();
});

test("preview cast eviction cancels the evicted contact, and cancellation preserves existing ambient fire", async () => {
    const { layer, at } = fixture();
    let hits = 0;
    layer.ring(footprint, footprint);
    layer.strike({ x: 0, y: 200 }, footprint, footprint, undefined, () => hits++);
    const waiting = layer.waitForPendingImpacts();
    for (let i = 0; i < 49; i++) layer.ring(footprint, footprint);
    expect(await waiting).toBe(false);
    expect(layer.hasPendingImpacts).toBe(false);
    layer.strike({ x: 0, y: 200 }, footprint, footprint, undefined, () => hits++);
    const cancelled = layer.waitForPendingImpacts();
    layer.cancelPendingImpacts();
    expect(await cancelled).toBe(false);
    expect(layer.active).toBe(true);
    at(2000);
    expect(hits).toBe(0);
    layer.clear();
});

test("Fireforged damage draws a hot edge and textured flames at contact, keeps a readable tail, and never owns a delivery", async () => {
    const { root, textures, layer, at } = fixture();
    layer.swordImpact(footprint.center, 64, { x: 1, y: 0 });
    expect(layer.active).toBe(true);
    expect(layer.hasPendingImpacts).toBe(false);
    expect(await layer.waitForPendingImpacts()).toBe(true);
    const air = root.children[0];
    expect(air.children.some((c) => c.visible && c.alpha > 0)).toBe(true);
    at(160);
    expect(air.children.some((c) => c instanceof Sprite && c.texture === textures[4] && c.visible)).toBe(true);
    const edge = air.children.find((c) => !(c instanceof Sprite));
    expect(edge?.visible).toBe(true);
    at(750);
    expect(edge?.visible).toBe(false);
    expect(air.children.some((c) => c instanceof Sprite && c.texture === textures[4] && c.visible && c.alpha > 0)).toBe(
        true,
    );
    at(1450);
    expect(layer.active).toBe(false);
    expect(air.children.every((c) => !c.visible)).toBe(true);
    const pool = [...air.children];
    layer.swordImpact({ x: 220, y: 150 }, 64, { x: -1, y: 1 });
    at(1610);
    expect(pool.every((c) => air.children.includes(c))).toBe(true);
    expect(textures).toHaveLength(5);
    layer.clear();
    expect(root.children).toHaveLength(0);
    expect(textures.every((t) => t.destroyed)).toBe(true);
});

test("Fireforged bursts reject bad impact points and remain finite for vertical, coincident and missing directions", () => {
    const { root, layer, at } = fixture();
    layer.swordImpact({ x: NaN, y: 10 }, 64);
    layer.swordImpact(footprint.center, Infinity);
    expect(root.children).toHaveLength(0);
    for (const dir of [undefined, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: Infinity, y: NaN }])
        layer.swordImpact(footprint.center, 64, dir);
    for (const time of [0, 100, 250, 700, 1200, 1450]) {
        at(time);
        for (const c of root.children[0].children)
            expect([c.x, c.y, c.scale.x, c.scale.y, c.rotation, c.alpha].every(Number.isFinite)).toBe(true);
    }
    expect(layer.active).toBe(false);
    layer.clear();
});
