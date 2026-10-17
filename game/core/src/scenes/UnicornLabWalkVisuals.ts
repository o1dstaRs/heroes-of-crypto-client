import { ColorMatrixFilter, type Sprite } from "pixi.js";
import { syncUnicornWalkHorn } from "./UnicornWalkHornVisuals";

// Alpha > 127 bounds, measured from the current canonical 768px figure and the
// eight approved gait frames. Normalize the visible body, not the padded canvas.
export const UNICORN_CANONICAL_HEIGHT = 680;
export const UNICORN_WALK_HEIGHTS = [636, 627, 624, 615, 621, 648, 654, 633] as const;
export const UNICORN_WALK_BOTTOMS = [729, 729, 729, 729, 726, 726, 726, 732] as const;

const CANONICAL_BOTTOM = 732;
const CANONICAL_ANCHOR_Y = 730 / 768;

// Common channel slopes with small per-frame residual offsets, fitted to the current figure.
export const UNICORN_WALK_RGB_TRANSFERS = [
    [
        1.1630296899559622, 1.0583955300796806, 0.9990210003310033, -0.19588389676601237, -0.09449542003827734,
        -0.05827068253986035,
    ],
    [
        1.1630296899559622, 1.0583955300796806, 0.9990210003310033, -0.19512374664185816, -0.09311189646954572,
        -0.056311817833328975,
    ],
    [
        1.1630296899559622, 1.0583955300796806, 0.9990210003310033, -0.18752224540031592, -0.0896530875477167,
        -0.05108817861591196,
    ],
    [
        1.1630296899559622, 1.0583955300796806, 0.9990210003310033, -0.20500569825586307, -0.10487184680376439,
        -0.07394160019211138,
    ],
    [
        1.1630296899559622, 1.0583955300796806, 0.9990210003310033, -0.2095665990007884, -0.09795422896010636,
        -0.05892363744203748,
    ],
    [
        1.1630296899559622, 1.0583955300796806, 0.9990210003310033, -0.2065259985041715, -0.09311189646954572,
        -0.054352953126797596,
    ],
    [
        1.1630296899559622, 1.0583955300796806, 0.9990210003310033, -0.21108689924909685, -0.09795422896010636,
        -0.057617727637683226,
    ],
    [
        1.1630296899559622, 1.0583955300796806, 0.9990210003310033, -0.20424554813170884, -0.10210479966630118,
        -0.06871796097469438,
    ],
] as const;
const colours: ColorMatrixFilter[] = [];
const applied = new WeakMap<Sprite, { x: number; y: number }>();

export function syncUnicornLabWalk(sprite: Sprite, frameIndex: number, baseScaleWasReset = false): void {
    const height = UNICORN_WALK_HEIGHTS[frameIndex];
    syncUnicornWalkHorn(sprite, frameIndex, height ? UNICORN_CANONICAL_HEIGHT / height : 1);
    const previous = applied.get(sprite);
    const next = height ? { x: UNICORN_CANONICAL_HEIGHT / height, y: UNICORN_CANONICAL_HEIGHT / height } : undefined;
    if (next || previous) {
        const priorX = baseScaleWasReset ? 1 : (previous?.x ?? 1);
        const priorY = baseScaleWasReset ? 1 : (previous?.y ?? 1);
        sprite.scale.set(sprite.scale.x * ((next?.x ?? 1) / priorX), sprite.scale.y * ((next?.y ?? 1) / priorY));
        // Keep the feet at the static figure's ground line while compensating
        // each frame's authored height. Retain the individual limb poses.
        sprite.anchor.y = next
            ? (UNICORN_WALK_BOTTOMS[frameIndex] - (CANONICAL_BOTTOM - CANONICAL_ANCHOR_Y * 768) / next.y) / 768
            : CANONICAL_ANCHOR_Y;
        if (next) applied.set(sprite, next);
        else applied.delete(sprite);
    }
    if (next && !colours[frameIndex]) {
        const colour = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        const [r, g, b, ro, go, bo] = UNICORN_WALK_RGB_TRANSFERS[frameIndex];
        colour.matrix = [r, 0, 0, 0, ro, 0, g, 0, 0, go, 0, 0, b, 0, bo, 0, 0, 0, 1, 0];
        colours[frameIndex] = colour;
    }
    const filters = sprite.filters ?? [];
    const desired = next ? colours[frameIndex] : undefined;
    if (filters.find((filter) => colours.includes(filter as ColorMatrixFilter)) === desired) return;
    const remaining = filters.filter((filter) => !colours.includes(filter as ColorMatrixFilter));
    sprite.filters = desired ? [desired, ...remaining] : remaining.length ? remaining : null;
}
