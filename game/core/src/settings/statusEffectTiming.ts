/** Give applied status symbols time to read without delaying combat or changing game state. */
export const STATUS_EFFECT_DURATION_MULTIPLIER = 1.8;
export const STATUS_EFFECT_APPEARANCE_SPEED = 1.25;

/** Speed up the opening third, then hold its completed cel until the original readable hold catches up. */
export const statusEffectAppearanceElapsedMs = (elapsedMs: number, durationMs = 1000): number => {
    const age = Math.max(0, elapsedMs);
    return Math.max(age, Math.min(age * STATUS_EFFECT_APPEARANCE_SPEED, durationMs / 3));
};

export const statusEffectElapsedMs = (elapsedMs: number): number =>
    statusEffectAppearanceElapsedMs(elapsedMs / STATUS_EFFECT_DURATION_MULTIPLIER);
