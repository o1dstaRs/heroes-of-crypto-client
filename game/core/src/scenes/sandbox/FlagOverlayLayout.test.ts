import { expect, test } from "bun:test";
import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { FlagOverlayLayout } from "./FlagOverlayLayout";

test.each([1, -1])("flag row clears rising stacked damage and remains centered with board x scale %s", (mirror) => {
    const root = new Container();
    root.scale.set(mirror * 0.8, -0.5);
    const layout = new FlagOverlayLayout();
    let flag = { x: 200, y: 100 };
    const add = (width: number, height: number) => {
        const container = new Container();
        const sprite = new Sprite(Texture.WHITE);
        sprite.anchor.set(0.5, 1);
        sprite.width = width;
        sprite.height = height;
        container.addChild(sprite);
        container.scale.set(1, -1.6);
        root.addChild(container);
        layout.add(container, () => flag);
        return container;
    };
    const left = add(84, 84),
        right = add(100, 70);
    const damage = new Container();
    damage.boundsArea = new Rectangle(-50, -36, 100, 116);
    damage.scale.set(1, -1);
    root.addChild(damage);
    const numbers = [{ container: damage, flagAnchor: flag, topExtent: 36 }];
    for (const rise of [0, 10, 35, 50]) {
        damage.position.set(flag.x, flag.y + 86 + rise);
        layout.update(numbers, 6);
        expect(right.x - 50 - (left.x + 42)).toBeCloseTo(6);
        expect((left.x - 42 + right.x + 50) / 2).toBeCloseTo(flag.x);
        expect(left.y).toBeCloseTo(damage.y + 42);
        expect(right.y).toBeCloseTo(left.y);
        const numberBounds = damage.getBounds();
        for (const overlay of [left, right]) {
            const b = overlay.getBounds();
            expect(b.maxY).toBeLessThan(numberBounds.minY);
        }
    }
    // A neighboring stack's numbers must not displace this row.
    numbers[0].flagAnchor = { x: flag.x + 64, y: flag.y };
    layout.update(numbers, 6);
    expect(left.y).toBeCloseTo(flag.y + 6);
    // Expiry recenters the survivor; hydration/movement follows the replacement flag.
    left.destroy({ children: true });
    flag = { x: 320, y: 180 };
    layout.update([], 6);
    expect(right.x).toBeCloseTo(320);
    expect(right.y).toBeCloseTo(186);
    root.destroy({ children: true });
});

test("hidden cues reserve no row space, and mixed anchor/scale conventions share one bottom edge", () => {
    const layout = new FlagOverlayLayout();
    const flag = { x: 100, y: 200 };
    const a = new Container(),
        b = new Container(),
        hidden = new Container();
    a.boundsArea = new Rectangle(-40, -80, 80, 80);
    b.boundsArea = new Rectangle(-30, -25, 60, 70);
    hidden.boundsArea = new Rectangle(-500, -500, 1000, 1000);
    a.scale.set(1, -2);
    b.scale.set(-1.2, -1.8);
    hidden.visible = false;
    for (const container of [a, b, hidden]) layout.add(container, () => flag);
    layout.update([], 6);
    expect(a.y).toBeCloseTo(206);
    expect(b.y - 45 * 1.8).toBeCloseTo(206);
    expect((a.x - 40 + b.x + 36) / 2).toBeCloseTo(100);
    layout.clear();
    for (const container of [a, b, hidden]) container.destroy();
});

test("stack identity associates a live flag with its separate stable damage anchor", () => {
    const layout = new FlagOverlayLayout();
    const pop = new Container(),
        damage = new Container();
    pop.boundsArea = new Rectangle(-40, -80, 80, 80);
    pop.scale.y = -1;
    layout.add(pop, () => ({ x: 300, y: 150, unitId: "victim" }));
    damage.position.set(280, 320);
    const number = { container: damage, flagAnchor: { x: 280, y: 210, unitId: "victim" } };
    layout.update([number], 6);
    expect(pop.x).toBe(300);
    expect(pop.y).toBe(362);
    number.flagAnchor = { x: 300, y: 150, unitId: "neighbor" };
    layout.update([number], 6);
    expect(pop.y).toBe(156);
    pop.destroy();
    damage.destroy();
});
