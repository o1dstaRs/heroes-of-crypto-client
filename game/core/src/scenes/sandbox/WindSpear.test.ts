import { expect, test } from "bun:test";
import { Container, Sprite, Texture } from "pixi.js";
import { WindSpears, WIND_SPEAR_TRAVEL_MS, WIND_SPEAR_FADE_MS } from "./WindSpear";

test.each([1, -1])("the generic pierce follows all recorded points and stays round with camera x=%s", (mirror) => {
    let now = 0;
    const world = new Container();
    world.scale.set(mirror * 0.8, -0.5);
    const layer = new WindSpears(
        (node) => world.addChild(node),
        () => Texture.WHITE,
        () => 1.6,
        () => now,
    );
    const points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
    ];
    try {
        layer.spawn(points, 64);
        const effect = world.children[0],
            head = effect.children.at(-1)! as Sprite;
        // A later authoritative state mutation cannot redirect an already-recorded effect.
        points[2].x = 1000;
        now = 100;
        layer.update();
        expect(head.x).toBe(100);
        expect(head.y).toBeGreaterThan(0);
        const bounds = head.getBounds();
        expect(bounds.width).toBeCloseTo(bounds.height);
        now = WIND_SPEAR_TRAVEL_MS;
        layer.update();
        expect(head.x).toBe(100);
        expect(head.y).toBe(100);
        expect(head.alpha).toBe(1);
        now += WIND_SPEAR_FADE_MS - 1;
        layer.update();
        expect(head.alpha).toBeGreaterThan(0);
        expect(head.alpha).toBeLessThan(0.01);
        now++;
        layer.update();
        expect(effect.destroyed).toBe(true);
        expect(layer.active).toBe(false);
        expect(Texture.WHITE.destroyed).toBe(false);
    } finally {
        layer.clear();
        world.destroy({ children: true });
    }
});

test("generic pierces are bounded, reject invalid rays and can be cleared repeatedly", () => {
    const root = new Container();
    const layer = new WindSpears(
        (node) => root.addChild(node),
        () => Texture.WHITE,
        () => 1,
    );
    for (const points of [
        [],
        [{ x: 0, y: 0 }],
        [
            { x: 0, y: 0 },
            { x: NaN, y: 10 },
        ],
        [
            { x: 1, y: 1 },
            { x: 1, y: 1 },
        ],
    ])
        layer.spawn(points, 64);
    expect(layer.active).toBe(false);
    for (let i = 0; i < 40; i++)
        layer.spawn(
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
            64,
        );
    expect(root.children).toHaveLength(16);
    const nodes = [...root.children];
    layer.clear();
    layer.clear();
    expect(nodes.every((node) => node.destroyed)).toBe(true);
    expect(root.children).toHaveLength(0);
    expect(Texture.WHITE.destroyed).toBe(false);
});
