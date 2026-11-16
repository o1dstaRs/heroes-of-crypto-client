/** PR #205 keeps its complete overhead cues at 650ms; accelerating the opening must not lengthen them. */
export const OVERHEAD_EFFECT_DURATION_MS = 650;
export const STATUS_EFFECT_DURATION_MULTIPLIER = OVERHEAD_EFFECT_DURATION_MS / 1000;

/** Normalize different authored atlases without changing their established full lifetime. */
export const overheadEffectElapsedMs = (elapsedMs: number, authoredDurationMs: number): number =>
    (Math.max(0, elapsedMs) / OVERHEAD_EFFECT_DURATION_MS) * authoredDurationMs;
export const STATUS_EFFECT_APPEARANCE_SPEED = 1.25;

/** Speed up the opening third, then hold its completed cel until the original readable hold catches up. */
export const statusEffectAppearanceElapsedMs = (elapsedMs: number, durationMs = 1000): number => {
    const age = Math.max(0, elapsedMs);
    return Math.max(age, Math.min(age * STATUS_EFFECT_APPEARANCE_SPEED, durationMs / 3));
};

export const statusEffectElapsedMs = (elapsedMs: number): number =>
    statusEffectAppearanceElapsedMs(overheadEffectElapsedMs(elapsedMs, 1000));
