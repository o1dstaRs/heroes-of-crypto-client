import { ColorMatrixFilter, type Sprite } from "pixi.js";

// Alpha > 128: current battlefield figure is 687px high; the new standing pose is
// 447px on the same 768px canvas. Keep one scale through take-off, flight and landing.
export const FAIRY_LAB_WALK_SCALE = 687 / 447;
// Match the standing silhouette's 249px width as well as its height (redraw: 187px).
export const FAIRY_LAB_WALK_WIDTH_SCALE = 249 / (187 * FAIRY_LAB_WALK_SCALE);
// User-requested 30% faster take-off, flight cadence and landing, scoped to this lab candidate.
export const FAIRY_LAB_WALK_SPEED = 1.3;
// An additional 30% applies only to take-off and landing.
export const FAIRY_LAB_TRANSITION_SPEED = FAIRY_LAB_WALK_SPEED * 1.3;

// The redraw's pink wings and olive leather are brighter than the battlefield source.
// One immutable RGB grade preserves phase-to-phase color and leaves alpha untouched.
export const FAIRY_LAB_WALK_RGB_GAINS = [0.82, 0.7, 0.66] as const;
export const FAIRY_LAB_WALK_SATURATION = 0.78;
let walkFilter: ColorMatrixFilter | undefined;

export function syncFairyLabWalkColor(sprite: Sprite, enabled: boolean): void {
    if (enabled && !walkFilter) {
        const [r, g, b] = FAIRY_LAB_WALK_RGB_GAINS;
        walkFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        const s = FAIRY_LAB_WALK_SATURATION;
        const [lr, lg, lb] = [0.2126, 0.7152, 0.0722].map((weight) => weight * (1 - s));
        walkFilter.matrix = [
            r * (lr + s),
            r * lg,
            r * lb,
            0,
            0,
            g * lr,
            g * (lg + s),
            g * lb,
            0,
            0,
            b * lr,
            b * lg,
            b * (lb + s),
            0,
            0,
            0,
            0,
            0,
            1,
            0,
        ];
    }
    if (!walkFilter) return;
    const installed = sprite.filters ?? [];
    if (installed.includes(walkFilter) === enabled) return;
    const remaining = installed.filter((filter) => filter !== walkFilter);
    sprite.filters = enabled ? [walkFilter, ...remaining] : remaining.length ? remaining : null;
}
