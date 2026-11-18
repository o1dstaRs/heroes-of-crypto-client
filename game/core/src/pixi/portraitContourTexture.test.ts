import { expect, test, spyOn } from "bun:test";
import { Texture, TextureSource } from "pixi.js";
import { acquirePortraitContour, portraitContourPixels } from "./portraitContourTexture";

function fixture(inverse = false): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(64 * 64 * 4);
    for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
            const foreground = x >= 16 && x < 48 && y >= 16 && y < 48;
            pixels[(y * 64 + x) * 4 + 3] = foreground !== inverse ? 255 : 0;
        }
    return pixels;
}

test("inverse background masks and transparent cutouts produce the same soft external shadow", () => {
    const shadow = portraitContourPixels(fixture(), 64, false);
    expect(shadow).toEqual(portraitContourPixels(fixture(true), 64, true));
    const alpha = (x: number, y: number) => shadow[(y * 64 + x) * 4 + 3];
    expect(alpha(16, 32)).toBe(0); // Do not darken the creature.
    expect(alpha(32, 32)).toBe(0);
    expect(alpha(15, 32)).toBeGreaterThan(40);
    expect(alpha(12, 32)).toBeLessThan(alpha(15, 32));
    expect(alpha(0, 32)).toBe(0);
    expect(alpha(15, 32)).toBe(alpha(48, 32));
});

test("empty silhouettes never shade the entire card", () => {
    const pixels = portraitContourPixels(new Uint8ClampedArray(64 * 64 * 4), 64, false);
    expect(pixels.filter((_, index) => index % 4 === 3).some(Boolean)).toBe(false);
});

test("shared contour leases destroy only the derived texture after the last consumer", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const source = new Texture({ source: new TextureSource({ resource: {}, width: 64, height: 64 }) });
    const derived = new Texture({ source: new TextureSource({ width: 256, height: 256 }) });
    const from = spyOn(Texture, "from").mockReturnValue(derived);
    const context = {
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray(256 * 256 * 4) }),
        putImageData() {},
    };
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: { createElement: () => ({ getContext: () => context }) },
    });
    try {
        const first = acquirePortraitContour(source, true)!;
        const second = acquirePortraitContour(source, true)!;
        expect(first.texture).toBe(second.texture);
        expect(from).toHaveBeenCalledTimes(1);
        first.release();
        first.release();
        expect(derived.destroyed).toBe(false);
        second.release();
        expect(derived.destroyed).toBe(true);
        expect(source.destroyed).toBe(false);
        expect(source.source.destroyed).toBe(false);
    } finally {
        from.mockRestore();
        if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
        else Reflect.deleteProperty(globalThis, "document");
        source.destroy(true);
    }
});
