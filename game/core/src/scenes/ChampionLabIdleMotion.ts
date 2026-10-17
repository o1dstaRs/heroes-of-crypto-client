export const CHAMPION_IDLE_CYCLE_MS = 6000;
const RALLY_FRAME_MS = 2000 / 1.2 / 10;
const RAISE_FRAME_COUNT = 4;
export const CHAMPION_IDLE_RAISE_MS = (RAISE_FRAME_COUNT * RALLY_FRAME_MS) / 1.3;
export const CHAMPION_IDLE_GESTURE_MS = CHAMPION_IDLE_RAISE_MS + 6 * RALLY_FRAME_MS;

// Each entry is a complete painted horse/rider cel; all cels share a baked base-size canvas and fixed identity regions.
const WIND_FRAMES = [0, 9, 1, 10, 2, 11, 3, 12] as const;
const RALLY_FRAMES = [4, 5, 6, 7, 8, 7, 6, 5, 4, 0] as const;

/** Continuous wind loop; first rally after six seconds, then one every six seconds. */
export function championIdleFrame(elapsedMs: number): number {
    // Avoid subtracting a fractional performance.now() epoch landing just below a cel boundary.
    const time = Math.round(Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) * 1000) / 1000;
    const phase = time % CHAMPION_IDLE_CYCLE_MS;
    if (time >= CHAMPION_IDLE_CYCLE_MS && phase < CHAMPION_IDLE_GESTURE_MS) {
        // Only the approach to the raised/forward pose is 30% faster. Hold and recovery retain their cadence.
        const index =
            phase < CHAMPION_IDLE_RAISE_MS
                ? Math.floor((phase * 1.3) / RALLY_FRAME_MS)
                : RAISE_FRAME_COUNT + Math.floor((phase - CHAMPION_IDLE_RAISE_MS) / RALLY_FRAME_MS);
        return RALLY_FRAMES[Math.min(RALLY_FRAMES.length - 1, index)];
    }
    const windTime = time >= CHAMPION_IDLE_CYCLE_MS ? phase - CHAMPION_IDLE_GESTURE_MS : time;
    return WIND_FRAMES[Math.floor(windTime / 125) % WIND_FRAMES.length];
}
