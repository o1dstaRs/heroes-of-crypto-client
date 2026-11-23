import type { Sprite, Texture } from "pixi.js";

/** Frames sliced from an atlas loaded smaller than authored (`runtimeAtlasDivider`): authored pixels per texel. */
const atlasFrameDividers = new WeakMap<Texture, number>();

/** Called by the atlas slicer for each frame of an atlas loaded at 1/`divider` of its authored size. */
export function recordAtlasFrameDivider(frame: Texture, divider: number): void {
    if (divider !== 1) atlasFrameDividers.set(frame, divider);
}

/**
 * Authored pixels per pixel of `texture`. Hands, muzzles, eyes, mouths and projectile sizes are measured in an
 * atlas's authored frame pixels, but a large body atlas is shipped or decoded at half size: its frames are half
 * as wide and the sprite is scaled up twice as much to keep the figure's board height.
 */
export function authoredPixelsPerTexel(texture: Texture | undefined): number {
    return (texture && atlasFrameDividers.get(texture)) ?? 1;
}

/** A point authored in the native pixels of the frame `sprite` shows, in that sprite's local space. */
export function authoredFramePoint(
    sprite: Pick<Sprite, "anchor" | "texture">,
    point: { x: number; y: number },
): { x: number; y: number } {
    const divider = authoredPixelsPerTexel(sprite.texture);
    return {
        x: point.x / divider - sprite.anchor.x * sprite.texture.width,
        y: point.y / divider - sprite.anchor.y * sprite.texture.height,
    };
}
