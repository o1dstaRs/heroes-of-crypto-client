import { expect, test } from "bun:test";
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { authoredFramePoint, authoredPixelsPerTexel, recordAtlasFrameDivider } from "./authoredFramePixels";

// The Orc's level throw: authored in its 1280x1024 attack frame, which the release ships at 640x512.
const ORC_HAND = { x: 1008, y: 415 };

const frame = (width: number, height: number) =>
    new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width, height }) });

const figure = (texture: Texture, scale: number) => {
    const root = new Container();
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.92);
    // Sprite size follows the frame texture, so a half-size frame is drawn twice as large (world y-up).
    sprite.scale.set(scale, -scale);
    sprite.position.set(300, 200);
    root.addChild(sprite);
    return { root, sprite };
};

test("a frame at its authored size keeps authored pixels", () => {
    const full = frame(1280, 1024);
    recordAtlasFrameDivider(full, 1);
    expect(authoredPixelsPerTexel(full)).toBe(1);
    expect(authoredPixelsPerTexel(undefined)).toBe(1);
    const { sprite } = figure(full, 0.2);
    expect(authoredFramePoint(sprite, ORC_HAND)).toEqual({ x: 1008 - 0.5 * 1280, y: 415 - 0.92 * 1024 });
});

test("an authored hand stays on the hand when the atlas is loaded at half size", () => {
    const full = figure(frame(1280, 1024), 0.2);
    const halfTexture = frame(640, 512);
    recordAtlasFrameDivider(halfTexture, 2);
    const half = figure(halfTexture, 0.4);
    expect(authoredPixelsPerTexel(halfTexture)).toBe(2);
    const expected = full.root.toLocal(full.sprite.toGlobal(authoredFramePoint(full.sprite, ORC_HAND)));
    const actual = half.root.toLocal(half.sprite.toGlobal(authoredFramePoint(half.sprite, ORC_HAND)));
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    // Before the fix the half-size frame read the hand in full-size pixels: past the front edge, down at the feet.
    const unscaled = half.root.toLocal(half.sprite.toGlobal({ x: ORC_HAND.x - 0.5 * 640, y: ORC_HAND.y - 0.92 * 512 }));
    expect(Math.abs(unscaled.x - expected.x)).toBeGreaterThan(150);
});
