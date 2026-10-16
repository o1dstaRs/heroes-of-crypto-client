import { ColorMatrixFilter, type Sprite } from "pixi.js";

// Alpha > 127 bounds, measured from the current canonical 768px figure and the
// eight approved gait frames. Normalize the visible body, not the padded canvas.
export const WHITE_TIGER_CANONICAL_HEIGHT = 379;
export const WHITE_TIGER_WALK_HEIGHTS = [348, 354, 363, 366, 351, 336, 330, 330] as const;
export const WHITE_TIGER_WALK_BOTTOMS = [714, 717, 717, 717, 714, 711, 708, 708] as const;
export const WHITE_TIGER_WALK_WIDTH_SCALE = 695 / 738;
const CANONICAL_BOTTOM = 741;
const CANONICAL_ANCHOR_Y = 730 / 768;

// One shared RGB transfer fitted to the 10th–95th opaque-pixel percentiles of
// all eight frames versus the current figure. No per-frame colour pumping.
export const WHITE_TIGER_WALK_RGB_TRANSFER = [
    0.9502414932, 0.9316314766, 0.9168773344, -0.049669704, -0.038261705, -0.04154333,
] as const;
let colour: ColorMatrixFilter | undefined;
const applied = new WeakMap<Sprite, { x: number; y: number }>();

export function syncWhiteTigerLabWalk(sprite: Sprite, frameIndex: number, baseScaleWasReset = false): void {
    const height = WHITE_TIGER_WALK_HEIGHTS[frameIndex];
    const previous = applied.get(sprite);
    const next = height ? { x: WHITE_TIGER_WALK_WIDTH_SCALE, y: WHITE_TIGER_CANONICAL_HEIGHT / height } : undefined;
    if (next || previous) {
        const priorX = baseScaleWasReset ? 1 : (previous?.x ?? 1);
        const priorY = baseScaleWasReset ? 1 : (previous?.y ?? 1);
        sprite.scale.set(sprite.scale.x * ((next?.x ?? 1) / priorX), sprite.scale.y * ((next?.y ?? 1) / priorY));
        // Keep the feet at the static figure's ground line while compensating
        // each frame's authored height. Retain the individual limb poses.
        sprite.anchor.y = next
            ? (WHITE_TIGER_WALK_BOTTOMS[frameIndex] - (CANONICAL_BOTTOM - CANONICAL_ANCHOR_Y * 768) / next.y) / 768
            : CANONICAL_ANCHOR_Y;
        if (next) applied.set(sprite, next);
        else applied.delete(sprite);
    }
    if (next && !colour) {
        const [r, g, b, ro, go, bo] = WHITE_TIGER_WALK_RGB_TRANSFER;
        colour = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        colour.matrix = [r, 0, 0, 0, ro, 0, g, 0, 0, go, 0, 0, b, 0, bo, 0, 0, 0, 1, 0];
    }
    const filters = sprite.filters ?? [];
    const desired = next ? colour : undefined;
    if (filters.find((filter) => filter === colour) === desired) return;
    const remaining = filters.filter((filter) => filter !== colour);
    sprite.filters = desired ? [desired, ...remaining] : remaining.length ? remaining : null;
}
