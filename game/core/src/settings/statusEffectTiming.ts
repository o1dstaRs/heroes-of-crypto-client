/** Shared wall-clock duration for one complete overhead cue, regardless of its authored atlas speed. */
export const OVERHEAD_EFFECT_DURATION_MS = 650;
export const STATUS_EFFECT_DURATION_MULTIPLIER = OVERHEAD_EFFECT_DURATION_MS / 1000;

/** Map real time to authored time, preserving every phase and each cel's relative hold. */
export const overheadEffectElapsedMs = (elapsedMs: number, authoredDurationMs: number): number =>
    (Math.max(0, elapsedMs) / OVERHEAD_EFFECT_DURATION_MS) * authoredDurationMs;

/** Legacy status atlases all contain one second of authored animation. */
export const statusEffectElapsedMs = (elapsedMs: number): number => overheadEffectElapsedMs(elapsedMs, 1000);
