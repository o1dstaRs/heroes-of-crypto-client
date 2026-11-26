/** The user-selected overhead playback is half the former 650 ms speed (1.3 seconds per cue). */
export const OVERHEAD_EFFECT_PLAYBACK_SPEED = 0.5;
export const OVERHEAD_EFFECT_DURATION_MS = 650 / OVERHEAD_EFFECT_PLAYBACK_SPEED;
/** Numbers report impact immediately and retain their established reading cadence. */
export const FLOATING_RESULT_DURATION_MS = 650;
/** Revival has a brief pause after death, then a real-time burst rather than a multi-second ghost. */
export const RESURRECTION_RISE_DELAY_MS = 150;
/**
 * The light over a raised stack: the pillar strikes and flashes as the body stands (first ~0.2 s), the rays,
 * sparks and floor sigil carry on over the living unit. The stack can act meanwhile; nothing waits on it.
 */
export const RESURRECTION_BURST_DURATION_MS = 1600;

/** Normalize authored atlases onto the shared overhead playback clock. */
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
