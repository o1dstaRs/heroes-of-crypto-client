import { Rectangle } from "pixi.js";

// Successive approved speed increases: 30%, 40%, 25%, then another 50%.
export const ANGEL_CAST_SPEED = 1.3 * 1.4 * 1.25 * 1.5;
export const ANGEL_CAST_DURATION_MS = 3120 / ANGEL_CAST_SPEED;

// The extra 512px above the original cel holds the extended arm and vertical sword.
// Preserve the original logical size so idle/action/flight keep the same body scale.
export function angelIdleCanvasRegistration(width: number, height: number) {
    return {
        orig: new Rectangle(0, 0, width, width),
        trim: new Rectangle(0, width - height, width, height),
    };
}

const smooth = (value: number): number => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
};

export function angelActionCanvasRegistration(width: number, height: number) {
    const scale = width / 1024;
    return {
        orig: new Rectangle(0, 0, 768 * scale, 768 * scale),
        trim: new Rectangle(-128 * scale, -128 * scale, width, height),
    };
}

// Cast time is independent of the breathing idle and never loops.
export function angelCastAura(elapsedMs: number): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
    const time = elapsedMs * ANGEL_CAST_SPEED;
    return smooth((time - 1080) / 240) * (1 - smooth((time - 1820) / 220));
}

// Blade-only centerlines in the registered blessing cels, followed by their recovery.
export const ANGEL_BLESSING_BLADES: readonly (readonly [number, number, number, number])[] = [
    [141.958, 140.882, 230.149, 211.313],
    [143.531, 86.837, 249.892, 86.837],
    [151.513, 86.633, 249.504, 52.541],
    [149.597, 75.813, 249.425, 43.967],
    [150.723, 77.242, 247.489, 21.715],
    [153.687, 74.384, 239.428, 14.774],
    [186.188, 1.885, 238.542, -98.635],
    [134.423, -48.186, 158.713, -165.978],
    [107.0, -44.186, 107.0, -164.329],
    [134.423, -48.186, 158.713, -165.978],
    [186.188, 1.885, 238.542, -98.635],
    [153.687, 74.384, 239.428, 14.774],
    [150.723, 77.242, 247.489, 21.715],
    [149.597, 75.813, 249.425, 43.967],
    [151.513, 86.633, 249.504, 52.541],
    [143.531, 86.837, 249.892, 86.837],
    [141.958, 140.882, 230.149, 211.313],
];
