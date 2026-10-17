// The 1024px cel contains the unscaled 768px source at (128, 128).
export const BLACK_DRAGON_LAB_IDLE_CANVAS_SCALE = 4 / 3;
export const BLACK_DRAGON_LAB_IDLE_ANCHOR_Y = (128 + 730) / 1024;
export const BLACK_DRAGON_LAB_IDLE_FRAME_COUNT = 32;
export const BLACK_DRAGON_LAB_BREATH_MS = 2560;
export const BLACK_DRAGON_LAB_IDLE_CYCLE_MS = BLACK_DRAGON_LAB_BREATH_MS;

/** Loop the folded-wing breath only; every descent exhales in cels 16..31. */
export function blackDragonLabIdleFrame(elapsedMs: number): number {
    const t = ((Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0) + 1e-7) % BLACK_DRAGON_LAB_IDLE_CYCLE_MS;
    return Math.floor(t / 80);
}
