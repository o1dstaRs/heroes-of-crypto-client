import { expect, spyOn, test } from "bun:test";
import { Container, Graphics, Texture, TextureSource } from "pixi.js";
import { UnitChip } from "./UnitChip";

test("deferred roster portraits prepare shared mipmaps once without destroying the source", () => {
    const source = new TextureSource({ width: 1024, height: 1024 });
    const texture = new Texture({ source });
    const unload = spyOn(source, "unload");
    const chip = new UnitChip({
        unitName: "Squire",
        portrait: {
            texture: Texture.EMPTY,
            framing: { source: "portrait", fit: "cover", scale: 1, offsetX: 0, offsetY: 0, background: "none" },
        },
    });
    try {
        chip.layout(80, 108);
        chip.setPortraitTextures(texture);
        chip.setPortraitTextures(texture);
        chip.setHovered(true);
        expect(source.autoGenerateMipmaps).toBe(true);
        expect(source.scaleMode).toBe("linear");
        expect(source.mipmapFilter).toBe("linear");
        expect(unload).toHaveBeenCalledTimes(1);
        expect(source.destroyed).toBe(false);
        expect(texture.destroyed).toBe(false);
        expect(Texture.EMPTY.source.autoGenerateMipmaps).toBe(false);
    } finally {
        unload.mockRestore();
        chip.destroy({ children: true });
        texture.destroy(true);
    }
});

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
