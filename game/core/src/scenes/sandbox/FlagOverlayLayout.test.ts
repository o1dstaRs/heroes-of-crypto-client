import { expect, test } from "bun:test";
import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { FlagOverlayLayout } from "./FlagOverlayLayout";

test.each([1, -1])("cues sit to the screen-right of live damage at their normal height, x scale %s", (mirror) => {
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
    const first = add(84, 84),
        second = add(100, 70);
    layout.update([], 6);
    const restingY = first.y;
    expect(second.y).toBeCloseTo(restingY);
    const damage = new Container();
    damage.boundsArea = new Rectangle(-50, -36, 100, 116);
    damage.scale.set(1, -1);
    root.addChild(damage);
    const numbers = [{ container: damage, flagAnchor: flag, topExtent: 36, halfWidth: 50 }];
    // World x runs the other way on a mirrored board; "right" is always the player's screen right.
    const side = mirror;
    for (const rise of [0, 10, 35, 50]) {
        damage.position.set(flag.x, flag.y + 86 + rise);
        layout.update(numbers, 6, { minX: -1000, maxX: 1000 });
        expect(first.y).toBeCloseTo(restingY);
        expect(second.y).toBeCloseTo(restingY);
        expect(first.x - side * 42).toBeCloseTo(flag.x + side * (50 + 6));
        expect(second.x - side * 50).toBeCloseTo(first.x + side * (42 + 6));
        const numberBounds = damage.getBounds();
        for (const overlay of [first, second]) {
            const b = overlay.getBounds();
            expect(b.minX).toBeGreaterThanOrEqual(numberBounds.maxX - 0.001);
        }
    }
    // Expiry keeps the cues where they are; they never slide back under a later number.
    damage.destroy();
    layout.update([], 6);
    expect(first.x - side * 42).toBeCloseTo(flag.x + side * 56);
    // The flank follows a moving or replaced flag.
    flag = { x: 320, y: 180 };
    layout.update([], 6);
    expect(first.x - side * 42).toBeCloseTo(320 + side * 56);
    expect(second.y).toBeCloseTo(restingY + 80);
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
    const number = { container: damage, flagAnchor: { x: 280, y: 210, unitId: "victim" }, halfWidth: 30 };
    layout.update([number], 6);
    // Measured against its own stable anchor, the number is centred on the live flag; the cue sits to its right.
    expect(pop.x - 40).toBe(300 + 30 + 6);
    expect(pop.y).toBe(156);
    const other = new Container();
    layout.add(other, () => ({ x: 500, y: 150, unitId: "neighbor" }));
    other.boundsArea = new Rectangle(-40, -80, 80, 80);
    other.scale.y = -1;
    layout.update([number], 6);
    // Another stack's damage never displaces this neighbour's cue.
    expect(other.x).toBe(500);
    other.destroy();
    pop.destroy();
    damage.destroy();
});

test("damage expiry and changing animation bounds retain the effect's original Y", () => {
    const layout = new FlagOverlayLayout();
    const flag = { x: 100, y: 200, unitId: "victim" };
    const pop = new Container();
    pop.boundsArea = new Rectangle(-40, -80, 80, 100);
    pop.scale.y = -1;
    layout.add(pop, () => flag);
    const damage = new Container();
    damage.position.set(100, 286);
    layout.update([{ container: damage, flagAnchor: flag, topExtent: 36 }], 6);
    const y = pop.y;
    damage.destroy();
    pop.boundsArea = new Rectangle(-30, -50, 60, 60);
    layout.update([], 6);
    expect(pop.y).toBe(y);
    flag.y += 40;
    layout.update([], 6);
    expect(pop.y).toBe(y + 40);
    pop.destroy();
});

test("a fresh effect returns to the centre after the previous flanking cue ends or the scene clears", () => {
    const layout = new FlagOverlayLayout();
    const flag = { x: 100, y: 200, unitId: "victim" };
    const add = () => {
        const pop = new Container();
        pop.boundsArea = new Rectangle(-40, -80, 80, 80);
        pop.scale.y = -1;
        layout.add(pop, () => flag);
        return pop;
    };
    const old = add();
    const damage = new Container();
    damage.position.set(100, 320);
    layout.update([{ container: damage, flagAnchor: flag, halfWidth: 30 }], 6);
    expect(old.y).toBe(206);
    expect(old.x - 40).toBe(100 + 30 + 6);
    old.destroy();
    layout.update([], 6);
    damage.destroy();
    const fresh = add();
    layout.update([], 6);
    expect(fresh.y).toBe(206);
    expect(fresh.x).toBe(100);
    layout.clear();
    const nextGame = add();
    layout.update([], 6);
    expect(nextGame.y).toBe(206);
    fresh.destroy();
    nextGame.destroy();
});

test("a returning responder keeps its effect close when damage remains at the captured contact", () => {
    const layout = new FlagOverlayLayout();
    const flag = { x: 100, y: 300, unitId: "responder" };
    const pop = new Container();
    pop.boundsArea = new Rectangle(-40, -80, 80, 80);
    pop.scale.y = -1;
    layout.add(pop, () => flag);
    const damage = new Container();
    damage.position.set(100, 342);
    const captured = { ...flag };
    layout.update([{ container: damage, flagAnchor: captured }], 6);
    const offset = pop.y - flag.y;
    flag.y -= 180;
    layout.update([{ container: damage, flagAnchor: captured }], 6);
    expect(pop.y - flag.y).toBe(offset);
    expect(pop.y).toBeLessThan(damage.y);
    pop.destroy();
    damage.destroy();
});

test("only a board edge sends a cue to the left of the damage", () => {
    const layout = new FlagOverlayLayout();
    const flag = { x: 460, y: 200, unitId: "edge" };
    const add = () => {
        const pop = new Container();
        pop.boundsArea = new Rectangle(-40, -80, 80, 80);
        pop.scale.y = -1;
        layout.add(pop, () => flag);
        return pop;
    };
    const first = add(),
        second = add();
    const damage = new Container();
    damage.position.set(flag.x, 300);
    layout.update([{ container: damage, flagAnchor: flag, halfWidth: 50 }], 6, { minX: -512, maxX: 512 });
    for (const pop of [first, second]) expect(pop.x + 40).toBeLessThanOrEqual(flag.x - 50);
    expect(second.x + 40).toBeCloseTo(first.x - 40 - 6);
    for (const pop of [first, second]) pop.destroy();
    damage.destroy();
});
