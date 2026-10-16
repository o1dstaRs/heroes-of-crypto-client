/** Keep the approved poses; time the canonical pause separately from the moving breath. */
export const PIKEMAN_IDLE_FRAME_COUNT = 64;
export const PIKEMAN_IDLE_FRAME_SIZE = 768;
export const PIKEMAN_IDLE_ATLAS_COLS = 10;
export const PIKEMAN_IDLE_ATLAS_ROWS = 7;
const PREVIOUS_FRAME_MS = 1000 / 19.2;
export const PIKEMAN_IDLE_HOLD_FRAME_MS = PREVIOUS_FRAME_MS * 0.8;
export const PIKEMAN_IDLE_MOTION_FRAME_MS = PREVIOUS_FRAME_MS / 1.15;
export const PIKEMAN_IDLE_START_HOLD_MS = 7 * PIKEMAN_IDLE_HOLD_FRAME_MS;
export const PIKEMAN_IDLE_MOTION_MS = 51 * PIKEMAN_IDLE_MOTION_FRAME_MS;
export const PIKEMAN_IDLE_PERIOD_MS =
    PIKEMAN_IDLE_START_HOLD_MS + PIKEMAN_IDLE_MOTION_MS + 6 * PIKEMAN_IDLE_HOLD_FRAME_MS;

export function isPikemanIdleCanonicalFrame(frame: number): boolean {
    return frame < 7 || frame >= 58;
}

export const PIKEMAN_IDLE_FRAME_DURATIONS_MS = Array.from({ length: PIKEMAN_IDLE_FRAME_COUNT }, (_, frame) =>
    isPikemanIdleCanonicalFrame(frame) ? PIKEMAN_IDLE_HOLD_FRAME_MS : PIKEMAN_IDLE_MOTION_FRAME_MS,
);

export function pikemanIdleFrame(elapsedMs: number): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
    const phase = elapsedMs % PIKEMAN_IDLE_PERIOD_MS;
    // Epsilon absorbs roundoff when a caller lands exactly on an authored frame boundary.
    const index = (time: number, duration: number) => Math.floor(time / duration + 1e-9);
    if (phase < PIKEMAN_IDLE_START_HOLD_MS) return Math.min(6, index(phase, PIKEMAN_IDLE_HOLD_FRAME_MS));
    const moving = phase - PIKEMAN_IDLE_START_HOLD_MS;
    if (moving < PIKEMAN_IDLE_MOTION_MS) return Math.min(57, 7 + index(moving, PIKEMAN_IDLE_MOTION_FRAME_MS));
    return Math.min(63, 58 + index(moving - PIKEMAN_IDLE_MOTION_MS, PIKEMAN_IDLE_HOLD_FRAME_MS));
}
