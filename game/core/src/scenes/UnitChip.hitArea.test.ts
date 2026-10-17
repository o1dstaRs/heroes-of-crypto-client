import { expect, spyOn, test } from "bun:test";
import { Container, Graphics, Texture } from "pixi.js";
import { UnitChip } from "./UnitChip";

test("hover motion and overflowing decorations cannot steal an adjacent roster cell", () => {
    const root = new Container();
    root.position.set(200, 120);
    root.scale.set(1.5, 0.75);
    const left = new UnitChip({ unitName: "Berserker", texture: Texture.EMPTY });
    const right = new UnitChip({ unitName: "Wolf", texture: Texture.EMPTY });
    left.layout(100, 135);
    right.layout(100, 135);
    right.x = 110;
    root.addChild(left, right);
    const outside = root.toGlobal({ x: 60, y: 0 });
    const rightCenter = right.toGlobal({ x: 0, y: 0 });
    left.addChild(new Graphics().rect(-90, -100, 250, 200).fill(0xffffff));
    left.setHovered(true);
    const bounds = spyOn(left, "getBounds").mockImplementation(() => {
        throw new Error("Hover must not measure decorative bounds");
    });
    try {
        expect(left.interactiveChildren).toBe(false);
        expect(left.containsRosterPoint(outside.x, outside.y)).toBe(false);
        expect(left.containsRosterPoint(rightCenter.x, rightCenter.y)).toBe(false);
        expect(right.containsRosterPoint(rightCenter.x, rightCenter.y)).toBe(true);
        expect(bounds).not.toHaveBeenCalled();
    } finally {
        bounds.mockRestore();
        root.destroy({ children: true });
    }
});
