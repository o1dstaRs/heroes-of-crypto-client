import { ColorMatrixFilter, type Sprite } from "pixi.js";

// One shared grade fitted to bark, foliage and rim-light samples from all eight
// approved Dryad walking frames. Only idle RGB changes; alpha and pose geometry stay intact.
export const DRYAD_IDLE_COLOR_MATRIX = [
    0.701541268, 0.407212697, -0.243380712, 0.0, -0.015497264, 0.117550551, 0.977165226, -0.347774956, 0.0, -0.01723217,
    0.159396852, 0.100246463, 0.581255178, 0.0, -0.038828288, 0.0, 0.0, 0.0, 1.0, 0.0,
] as const;

let sharedFilter: ColorMatrixFilter | undefined;

export function dryadIdlePalette(): ColorMatrixFilter {
    if (!sharedFilter) {
        sharedFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        sharedFilter.matrix = [...DRYAD_IDLE_COLOR_MATRIX];
    }
    return sharedFilter;
}

export function syncDryadIdlePalette(sprite: Sprite, idle: boolean): void {
    const desired = idle ? dryadIdlePalette() : undefined;
    const installed = sprite.filters ?? [];
    const current = sharedFilter && installed.find((filter) => filter === sharedFilter);
    if (current === desired) return;
    const remaining = installed.filter((filter) => filter !== sharedFilter);
    sprite.filters = desired ? [desired, ...remaining] : remaining.length ? remaining : null;
}
