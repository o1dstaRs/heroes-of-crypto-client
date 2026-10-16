import { ColorMatrixFilter, type Sprite } from "pixi.js";

// One grade for all eight poses, fitted to corresponding cloth, hair, face,
// book and gold samples from healer_battlefield_side_right_distance_readable_v2.
// Shared coefficients avoid per-frame colour pumping; alpha and UVs are unchanged.
export const HEALER_LAB_WALK_COLOR_MATRIX = [
    0.879637715, 0.008619624, 0.057536702, 0, -0.078391111, 0.000190108, 0.925496705, -0.059146986, 0, -0.028502162,
    -0.025366675, 0.172368563, 0.699973766, 0, -0.018532145, 0, 0, 0, 1, 0,
] as const;

let sharedFilter: ColorMatrixFilter | undefined;

export function healerLabWalkPalette(): ColorMatrixFilter {
    if (!sharedFilter) {
        sharedFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        sharedFilter.matrix = [...HEALER_LAB_WALK_COLOR_MATRIX];
    }
    return sharedFilter;
}

/** Remove only this grade on returning to the untouched canonical resting figure. */
export function syncHealerLabWalkPalette(sprite: Sprite, walking: boolean): void {
    const desired = walking ? healerLabWalkPalette() : undefined;
    const installed = sprite.filters ?? [];
    const current = sharedFilter && installed.find((filter) => filter === sharedFilter);
    if (current === desired) return;
    const remaining = installed.filter((filter) => filter !== sharedFilter);
    sprite.filters = desired ? [desired, ...remaining] : remaining.length ? remaining : null;
}
