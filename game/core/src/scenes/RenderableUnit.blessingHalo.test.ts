import { expect, test } from "bun:test";
import { Container, Graphics } from "pixi.js";

import { RenderableUnit } from "./RenderableUnit";

for (const mirrored of [false, true]) {
    test(`the blessing frame follows the visible amount flag (${mirrored ? "mirrored" : "normal"})`, () => {
        const root = new Container();
        root.scale.set(mirrored ? -1.5 : 1.5, -0.75);
        root.position.set(500, 700);
        const badge = new Container();
        badge.position.set(320, 600);
        badge.scale.set(mirrored ? -1.2 : 1.2, 1.2);
        badge.zIndex = 4001;
        badge.addChild(new Graphics().rect(-16, -7, 32, 14).fill(0x267552));
        root.addChild(badge);
        const unit = Object.create(RenderableUnit.prototype) as RenderableUnit;
        Object.assign(unit, {
            badgeContainer: badge,
            badgeDrawState: { geometry: { headerWidth: 32, flagHeight: 14 } },
        });
        const frame = unit.getBlessingHaloFrame()!;
        const center = root.toGlobal(frame);
        const bounds = badge.getBounds();
        expect(center.x).toBeCloseTo(bounds.x + bounds.width / 2);
        expect(center.y).toBeCloseTo(bounds.y + bounds.height / 2);
        expect(frame.width * Math.abs(root.scale.x)).toBeCloseTo(bounds.width);
        expect(frame.height * Math.abs(root.scale.y)).toBeCloseTo(bounds.height);
        expect(frame.zIndex).toBe(badge.zIndex);
        badge.position.set(410, 580);
        badge.scale.y = 1.5;
        expect(unit.getBlessingHaloFrame()).toMatchObject({ x: 410, y: 580, height: 21 });
        root.destroy({ children: true });
    });
}

test("hidden flags and flags that have not been drawn have no blessing frame", () => {
    const unit = Object.create(RenderableUnit.prototype) as RenderableUnit;
    expect(unit.getBlessingHaloFrame()).toBeUndefined();
    const badge = new Container();
    Object.assign(unit, { badgeContainer: badge });
    expect(unit.getBlessingHaloFrame()).toBeUndefined();
    Object.assign(unit, { badgeDrawState: { geometry: { headerWidth: 32, flagHeight: 14 } } });
    badge.visible = false;
    expect(unit.getBlessingHaloFrame()).toBeUndefined();
    badge.destroy();
});
