export const EFREET_LAB_IDLE_FRAME_DURATIONS_MS: readonly number[] = [
    ...Array<number>(24).fill(200),
    ...Array<number>(12).fill(100),
];
export const EFREET_LAB_IDLE_CYCLE_MS = 6000;
export const EFREET_LAB_CLAP_START_FRAME = 24;

export function efreetLabIdleFrame(elapsedMs: number): number {
    let phase = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) % EFREET_LAB_IDLE_CYCLE_MS;
    // Fractional performance.now() origins can put an exact cel boundary a few
    // floating-point ulps early. Keep the six-second timeline stable to a microsecond.
    phase = Math.round(phase * 1e6) / 1e6;
    for (let frame = 0; frame < EFREET_LAB_IDLE_FRAME_DURATIONS_MS.length; frame++) {
        const duration = EFREET_LAB_IDLE_FRAME_DURATIONS_MS[frame];
        if (phase < duration) return frame;
        phase -= duration;
    }
    return 0;
}
