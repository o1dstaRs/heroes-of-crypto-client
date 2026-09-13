// A brief hand-to-cheek gesture followed by a resting pause, inspired by the supplied H3 strip.
export const FAIRY_LAB_IDLE_SEQUENCE = [0, 1, 2, 3, 4, 3, 2, 1, 0] as const;
export const FAIRY_LAB_IDLE_DURATIONS_MS = [1500, 130, 150, 150, 420, 130, 150, 150, 700] as const;
export const FAIRY_LAB_IDLE_CYCLE_MS = FAIRY_LAB_IDLE_DURATIONS_MS.reduce((sum, duration) => sum + duration, 0);

// The closing and opening neutral holds are one continuous pause across the loop seam.
export function fairyLabIdleRestPhase(elapsedMs: number): number | null {
    const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    const closingHold = FAIRY_LAB_IDLE_DURATIONS_MS[FAIRY_LAB_IDLE_DURATIONS_MS.length - 1];
    const restDuration = closingHold + FAIRY_LAB_IDLE_DURATIONS_MS[0];
    const restTime = (time + closingHold) % FAIRY_LAB_IDLE_CYCLE_MS;
    return restTime < restDuration ? restTime / restDuration : null;
}

export function fairyLabIdleFrame(elapsedMs: number): number {
    const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    let phase = time % FAIRY_LAB_IDLE_CYCLE_MS;
    for (let i = 0; i < FAIRY_LAB_IDLE_SEQUENCE.length; i++) {
        if (phase < FAIRY_LAB_IDLE_DURATIONS_MS[i]) return FAIRY_LAB_IDLE_SEQUENCE[i];
        phase -= FAIRY_LAB_IDLE_DURATIONS_MS[i];
    }
    return 0;
}
