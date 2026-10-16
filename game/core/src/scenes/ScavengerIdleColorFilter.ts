import { ColorMatrixFilter, type Filter, type Sprite } from "pixi.js";

// Match the idle's opaque RGB mean to the approved hit sheet (also shared by death).
// One immutable grade for the entire loop preserves frame-to-frame palette and alpha.
export const SCAVENGER_IDLE_COLOR_GAINS = [0.842021, 0.878, 0.775615] as const;
let idleFilter: ColorMatrixFilter | undefined;

// Each hit frame's opaque mean and 95th-percentile RGB highlights are capped at the
// current graded idle's levels. Gain-only grading preserves black shadows and alpha.
export const SCAVENGER_HIT_COLOR_GAINS = [
    [0.969828, 0.906945, 0.871239],
    [0.958705, 0.927326, 0.895781],
    [0.945441, 0.906945, 0.883339],
    [0.957766, 0.927326, 0.895781],
    [0.978565, 0.906945, 0.871239],
    [0.952813, 0.897087, 0.859465],
    [0.969828, 0.906945, 0.871239],
    [0.978565, 0.917022, 0.883339],
] as const;
const hitFilters = new Map<number, ColorMatrixFilter>();
const ownedHitFilters = new Set<Filter>();

export function syncScavengerHitColorFilter(sprite: Sprite, frameIndex: number): void {
    const gains = SCAVENGER_HIT_COLOR_GAINS[frameIndex];
    let desired = gains ? hitFilters.get(frameIndex) : undefined;
    if (gains && !desired) {
        const [r, g, b] = gains;
        desired = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        desired.matrix = [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
        hitFilters.set(frameIndex, desired);
        ownedHitFilters.add(desired);
    }
    const installed = sprite.filters ?? [];
    if (installed.find((filter) => ownedHitFilters.has(filter)) === desired) return;
    const remaining = installed.filter((filter) => !ownedHitFilters.has(filter));
    sprite.filters = desired ? [desired, ...remaining] : remaining.length ? remaining : null;
}

export function syncScavengerIdleColorFilter(sprite: Sprite, enabled: boolean): void {
    if (enabled && !idleFilter) {
        const [r, g, b] = SCAVENGER_IDLE_COLOR_GAINS;
        idleFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        idleFilter.matrix = [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
    }
    if (!idleFilter) return;
    const installed = sprite.filters ?? [];
    if (installed.includes(idleFilter) === enabled) return;
    const remaining = installed.filter((filter) => filter !== idleFilter);
    sprite.filters = enabled ? [idleFilter, ...remaining] : remaining.length ? remaining : null;
}
