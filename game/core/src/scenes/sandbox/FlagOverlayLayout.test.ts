import { expect, test } from "bun:test";
import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { FlagOverlayLayout, MAX_NUMBER_SHIFT } from "./FlagOverlayLayout";

test.each([1, -1])(
    "damage and its cues form one row centred on the flag, icons level with the number, x scale %s",
    (mirror) => {
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
        const damage = new Container();
        damage.boundsArea = new Rectangle(-50, -36, 100, 116);
        damage.scale.set(1, -1);
        damage.position.set(flag.x, flag.y + 86);
        root.addChild(damage);
        const numbers = [{ container: damage, flagAnchor: flag, topExtent: 36, bottomExtent: 80, halfWidth: 50 }];
        layout.update(numbers, 6, { minX: -1000, maxX: 1000 });
        const centreY = (b: { minY: number; maxY: number }) => (b.minY + b.maxY) / 2;
        const numberBox = damage.getBounds();
        const firstBox = first.getBounds(),
            secondBox = second.getBounds();
        // Screen right, whatever the board's mirroring: global x is screen x. 6 world px of gap at 0.8 scale.
        expect(firstBox.minX - numberBox.maxX).toBeCloseTo(6 * 0.8);
        expect(secondBox.minX - firstBox.maxX).toBeCloseTo(6 * 0.8);
        // Each icon is vertically centred on the damage block instead of floating above it.
        expect(centreY(firstBox)).toBeCloseTo(centreY(numberBox));
        expect(centreY(secondBox)).toBeCloseTo(centreY(numberBox));
        // The row leans toward centring on the flag: the number steps away from the cues' side, but never more
        // than MAX_NUMBER_SHIFT (this two-cue row would want 98), so it stays close to its own unit.
        expect(Math.abs(damage.x - flag.x)).toBeCloseTo(MAX_NUMBER_SHIFT);
        expect(Math.sign(damage.x - flag.x)).toBe(-Math.sign(first.x - flag.x));
        // Expiry keeps the cues where they are; they never slide back under a later number.
        const before = first.x;
        damage.destroy();
        layout.update([], 6);
        expect(first.x).toBeCloseTo(before);
        // The row follows a moving or replaced flag.
        flag = { x: 320, y: 180 };
        layout.update([], 6);
        expect(first.x).toBeCloseTo(before + 120);
        root.destroy({ children: true });
    },
);

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
    // Measured against its own stable anchor: number [-30, 30] and the cue (6 px gap, 80 wide) span
    // [-30, 116] around the live flag, so the row shifts 43 left. The icon centre meets the number's.
    expect(pop.x - 40).toBe(300 + 30 + 6 - 43);
    expect(damage.x).toBe(280 - 43);
    expect(pop.y + 40).toBe(150 + (320 - 210));
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
    expect(old.y + 40).toBe(320);
    expect(old.x - 40).toBe(100 + 30 + 6 - 43);
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

test("only a board edge sends a cue to the left of the damage, and centring never leaves the board", () => {
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
    // Both cues sit to the left of the number, 6 px apart, and the number stays on the board.
    expect(first.x + 40 + 6).toBeCloseTo(damage.x - 50);
    expect(second.x + 40 + 6).toBeCloseTo(first.x - 40);
    expect(damage.x + 50).toBeLessThanOrEqual(512);
    for (const pop of [first, second]) pop.destroy();
    damage.destroy();
});

test("a cue that is attached but not showing yet never moves the damage number", () => {
    const layout = new FlagOverlayLayout();
    const flag = { x: 100, y: 200, unitId: "victim" };
    const pending = new Container();
    const art = new Container();
    art.boundsArea = new Rectangle(-40, -80, 80, 80);
    art.alpha = 0;
    pending.addChild(art);
    pending.scale.y = -1;
    layout.add(pending, () => flag);
    const faded = new Container();
    faded.boundsArea = new Rectangle(-40, -80, 80, 80);
    faded.alpha = 0;
    faded.scale.y = -1;
    layout.add(faded, () => flag);
    const damage = new Container();
    damage.position.set(100, 320);
    const number = { container: damage, flagAnchor: flag, halfWidth: 30 } as {
        container: Container;
        flagAnchor: typeof flag;
        halfWidth: number;
        shiftX?: number;
    };
    layout.update([number], 6);
    expect(damage.x).toBe(100);
    expect(number.shiftX).toBeUndefined();
    // Once the cue actually appears it joins the row and both centre on the flag.
    art.alpha = 1;
    layout.update([number], 6);
    expect(damage.x).toBe(100 - 43);
    for (const container of [pending, faded, damage]) container.destroy({ children: true });
});
