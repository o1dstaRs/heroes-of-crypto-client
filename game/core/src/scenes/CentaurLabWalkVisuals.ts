import { ColorMatrixFilter, type Sprite } from "pixi.js";

// Alpha > 128 bounds: the battlefield figure occupies 730/768 of its canvas.
// HD walking cells have larger transparent margins; measure the figure, not the canvas.
const STATIC_VISIBLE_HEIGHT_RATIO = 730 / 768;
const WALK_VISIBLE_HEIGHTS = [904, 895, 882, 900, 908, 895, 883, 903] as const;
// The upright run reads taller than the wider battlefield stance at equal alpha height.
// User's visual correction: retain a slight crouch instead of matching their envelopes exactly.
const WALK_STANCE_SCALE = 0.97;

export function centaurLabWalkScale(frameIndex: number): number {
    const index = Math.max(0, Math.min(WALK_VISIBLE_HEIGHTS.length - 1, Math.floor(frameIndex)));
    return (STATIC_VISIBLE_HEIGHT_RATIO * WALK_STANCE_SCALE) / (WALK_VISIBLE_HEIGHTS[index] / 1024);
}

let walkColorFilter: ColorMatrixFilter | undefined;

/** Reduce the redraw's excess red in skin/leather; neutral steel, black and alpha stay unchanged. */
export function syncCentaurLabWalkColor(sprite: Sprite, enabled: boolean): void {
    if (enabled && !walkColorFilter) {
        walkColorFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        // One grade for all eight poses avoids introducing palette changes during the cycle.
        walkColorFilter.matrix = [0.8, 0.2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    }
    if (!walkColorFilter) return;
    const installed = sprite.filters ?? [];
    if (installed.includes(walkColorFilter) === enabled) return;
    const remaining = installed.filter((filter) => filter !== walkColorFilter);
    sprite.filters = enabled ? [walkColorFilter, ...remaining] : remaining.length ? remaining : null;
}
