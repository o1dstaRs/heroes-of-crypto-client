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
            return { flame: texture(), smoke: texture(), glow: texture(), rock: texture() };
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
