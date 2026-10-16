import { ColorMatrixFilter, type Filter, type Sprite } from "pixi.js";

// Opaque bounds (alpha > 240) of the canonical figure and the matching first gait pose.
// Keep one fit for the entire loop: normal foot crossing must not rescale the body per frame.
export const TROLL_LAB_WALK_SCALE_X = 514 / 432;
export const TROLL_LAB_WALK_SCALE_Y = 698 / 688;

// Match each pose's opaque RGB mean and 95th-percentile highlights to
// troll_battlefield_side_right_final_v1. Alpha and authored surface detail remain unchanged.
export const TROLL_LAB_WALK_COLOR_TRANSFERS = [
    [0.98896684, 1.00143761, 1.02587094, -0.0158711, 0.00304209, 0.00631728],
    [0.96066758, 0.96376212, 0.99607954, -0.00753005, 0.00341388, 0.0099033],
    [0.93427298, 0.95712934, 0.99270541, 0.00010998, 0.00762767, 0.00389045],
    [0.95543202, 0.97414389, 1.02183656, 0.01115288, 0.01591926, 0.01239706],
    [0.96322915, 0.97269951, 0.996923, -0.01311559, 0.00536501, 0.00946007],
    [0.97142166, 0.97711373, 0.97410384, -0.0113117, 0.00642713, 0.00999127],
    [0.9171569, 0.91039247, 0.9269371, -0.02717035, 0.0051878, 0.00625145],
    [0.98846139, 1.00543547, 1.04937345, -0.01939658, 0.0005963, 0.00247382],
] as const;

const filters = new Map<number, ColorMatrixFilter>();
const owned = new Set<Filter>();

// The complete-redraw idle has excess red in its midtones. Use one source-matched
// transfer for every pose, preserving the authored highlights and temporal palette.
export const TROLL_LAB_IDLE_COLOR_TRANSFER = [
    1.00813845, 0.98692108, 1.05397724, -0.06871329, -0.00742861, -0.00812164,
] as const;

export function syncTrollLabWalkPalette(sprite: Sprite, frameIndex: number, idle = false): void {
    const key = frameIndex >= 0 ? frameIndex : idle ? -2 : -1;
    const transfer = key === -2 ? TROLL_LAB_IDLE_COLOR_TRANSFER : TROLL_LAB_WALK_COLOR_TRANSFERS[key];
    let desired = transfer ? filters.get(key) : undefined;
    if (transfer && !desired) {
        const [r, g, b, ro, go, bo] = transfer;
        desired = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        desired.matrix = [r, 0, 0, 0, ro, 0, g, 0, 0, go, 0, 0, b, 0, bo, 0, 0, 0, 1, 0];
        filters.set(key, desired);
        owned.add(desired);
    }
    const installed = sprite.filters ?? [];
    if (installed.find((filter) => owned.has(filter)) === desired) return;
    const remaining = installed.filter((filter) => !owned.has(filter));
    sprite.filters = desired ? [desired, ...remaining] : remaining.length ? remaining : null;
}
