export const ZENA_IDLE_WIND_FRAMES = 24;
export const ZENA_IDLE_SHARPEN_INTERVAL_MS = 5000;
// Raise, draw slowly across the upper rim for two seconds, then lower the sword.
export const ZENA_IDLE_SHARPEN_DURATIONS_MS = [
    140, 140, 180, 250, 250, 250, 250, 250, 250, 250, 250, 180, 180, 180,
] as const;
export const ZENA_IDLE_WIND_SUBFRAMES = 2;
export const ZENA_IDLE_SHARPEN_FRAMES = ZENA_IDLE_SHARPEN_DURATIONS_MS.length * ZENA_IDLE_WIND_SUBFRAMES;
export const ZENA_IDLE_SHARPEN_DURATION_MS = ZENA_IDLE_SHARPEN_DURATIONS_MS.reduce(
    (sum, duration) => sum + duration,
    0,
);

/** Select authored sprites using the amount flag's clock and per-unit phase. */
export function zenaLabIdleFrame(nowMs: number, restStartedAtMs: number, flagPhase: number, flagSpeed: number): number {
    const elapsed = Math.max(0, nowMs - restStartedAtMs);
    let gestureElapsed = elapsed % ZENA_IDLE_SHARPEN_INTERVAL_MS;
    if (elapsed >= ZENA_IDLE_SHARPEN_INTERVAL_MS && gestureElapsed < ZENA_IDLE_SHARPEN_DURATION_MS) {
        for (let frame = 0; frame < ZENA_IDLE_SHARPEN_DURATIONS_MS.length; frame++) {
            const duration = ZENA_IDLE_SHARPEN_DURATIONS_MS[frame];
            if (gestureElapsed < duration) {
                const windSubframe = Math.floor(gestureElapsed / (duration / ZENA_IDLE_WIND_SUBFRAMES));
                return ZENA_IDLE_WIND_FRAMES + frame * ZENA_IDLE_WIND_SUBFRAMES + windSubframe;
            }
            gestureElapsed -= duration;
        }
    }
    const tau = Math.PI * 2;
    const phase = ((((flagSpeed * nowMs) / 1000 - flagPhase) % tau) + tau) % tau;
    return Math.min(ZENA_IDLE_WIND_FRAMES - 1, Math.floor((phase / tau) * ZENA_IDLE_WIND_FRAMES));
}
