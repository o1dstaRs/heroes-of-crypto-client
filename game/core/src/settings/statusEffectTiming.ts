/** Give applied status symbols time to read without delaying combat or changing game state. */
export const STATUS_EFFECT_DURATION_MULTIPLIER = 1.8;

export const statusEffectElapsedMs = (elapsedMs: number): number => elapsedMs / STATUS_EFFECT_DURATION_MULTIPLIER;
