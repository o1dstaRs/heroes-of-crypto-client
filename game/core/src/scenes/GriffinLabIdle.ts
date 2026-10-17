import { WHITE_TIGER_TAIL_SPEED } from "./WhiteTigerIdleTail";

export const GRIFFIN_IDLE_FRAME_COUNT = 96;
export const GRIFFIN_PREEN_FRAME_COUNT = 52;
export const GRIFFIN_IDLE_TAIL_PERIOD_MS = (Math.PI * 2 * 1000) / WHITE_TIGER_TAIL_SPEED;
export const GRIFFIN_IDLE_BREATH_PERIOD_MS = GRIFFIN_IDLE_TAIL_PERIOD_MS * 3;
export const GRIFFIN_PREEN_DURATION_MS = GRIFFIN_IDLE_TAIL_PERIOD_MS;
export const GRIFFIN_PREEN_START_MS = GRIFFIN_IDLE_BREATH_PERIOD_MS * 2;
export const GRIFFIN_PREEN_PERIOD_MS = GRIFFIN_IDLE_BREATH_PERIOD_MS * 4 + GRIFFIN_PREEN_DURATION_MS;
export const GRIFFIN_PREEN_FEATHER_RELEASE_MS = (24 * GRIFFIN_PREEN_DURATION_MS) / GRIFFIN_PREEN_FRAME_COUNT + 20;
export const GRIFFIN_PREEN_FEATHER_LIFETIME_MS = 1350;

function safeTime(time: number): number {
    return Number.isFinite(time) ? Math.max(0, time) : 0;
}

export function griffinPreenTime(elapsedMs: number): number {
    const t = safeTime(elapsedMs);
    return t < GRIFFIN_PREEN_START_MS ? -1 : (t - GRIFFIN_PREEN_START_MS) % GRIFFIN_PREEN_PERIOD_MS;
}

/** The full creature, including its tail and mane, is authored in these atlas frames. */
export function griffinLabIdleFrame(elapsedMs: number): number {
    const phase = griffinPreenTime(elapsedMs);
    if (phase >= 0 && phase < GRIFFIN_PREEN_DURATION_MS) {
        return (
            GRIFFIN_IDLE_FRAME_COUNT +
            Math.min(
                GRIFFIN_PREEN_FRAME_COUNT - 1,
                Math.floor((phase * GRIFFIN_PREEN_FRAME_COUNT) / GRIFFIN_PREEN_DURATION_MS),
            )
        );
    }
    const rest = phase < 0 ? safeTime(elapsedMs) : phase - GRIFFIN_PREEN_DURATION_MS;
    return Math.min(
        GRIFFIN_IDLE_FRAME_COUNT - 1,
        Math.floor(((rest % GRIFFIN_IDLE_BREATH_PERIOD_MS) * GRIFFIN_IDLE_FRAME_COUNT) / GRIFFIN_IDLE_BREATH_PERIOD_MS),
    );
}

export function griffinFeatherAgeMs(elapsedMs: number): number {
    const age = griffinPreenTime(elapsedMs) - GRIFFIN_PREEN_FEATHER_RELEASE_MS;
    // Fractional authored frame durations can lose a few decimal places at exact boundaries.
    return age >= -1e-7 && age < GRIFFIN_PREEN_FEATHER_LIFETIME_MS - 1e-7 ? Math.max(0, age) : -1;
}
