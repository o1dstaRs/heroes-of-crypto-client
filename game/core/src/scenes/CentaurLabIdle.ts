// Original drawn idle: sway the tail between occasional hair-adjustment gestures.
export const CENTAUR_LAB_IDLE_SEQUENCE = [0, 7, 1, 7, 0, 7, 1, 7, 0, 7, 1, 7, 6, 2, 3, 4, 5, 6, 7] as const;
export const CENTAUR_LAB_IDLE_DURATIONS_MS = [
    300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 140, 140, 200, 260, 240, 200, 320,
] as const;
export const CENTAUR_LAB_IDLE_CYCLE_MS = CENTAUR_LAB_IDLE_DURATIONS_MS.reduce((sum, duration) => sum + duration, 0);

export function centaurLabIdleFrame(elapsedMs: number): number {
    const safeElapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0;
    let phase = ((safeElapsed % CENTAUR_LAB_IDLE_CYCLE_MS) + CENTAUR_LAB_IDLE_CYCLE_MS) % CENTAUR_LAB_IDLE_CYCLE_MS;
    for (let index = 0; index < CENTAUR_LAB_IDLE_SEQUENCE.length; index++) {
        if (phase < CENTAUR_LAB_IDLE_DURATIONS_MS[index]) return CENTAUR_LAB_IDLE_SEQUENCE[index];
        phase -= CENTAUR_LAB_IDLE_DURATIONS_MS[index];
    }
    return 0;
}
