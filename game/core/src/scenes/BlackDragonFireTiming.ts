// Preserve all 32 cels and their phase proportions within a 950ms complete attack.
export const BLACK_DRAGON_ATTACK_DURATION_MS = 950;
export const BLACK_DRAGON_ATTACK_SPEED = (300 / 1.38 + 1000 / 1.35 + 300) / BLACK_DRAGON_ATTACK_DURATION_MS;
export const BLACK_DRAGON_FIRE_SPEED = 1.35 * BLACK_DRAGON_ATTACK_SPEED;
export const BLACK_DRAGON_FIRE_DURATION_MS = 1000 / BLACK_DRAGON_FIRE_SPEED;
export const BLACK_DRAGON_FIRE_START_MS = 300 / 1.38 / BLACK_DRAGON_ATTACK_SPEED;
export const BLACK_DRAGON_FIRE_END_MS = BLACK_DRAGON_FIRE_START_MS + BLACK_DRAGON_FIRE_DURATION_MS;
export const BLACK_DRAGON_ATTACK_FRAME_DURATIONS_MS = Array.from(
    { length: 32 },
    (_, i) => (i < 6 ? 50 / 1.38 : i < 26 ? 50 / 1.35 : 50) / BLACK_DRAGON_ATTACK_SPEED,
);

export function blackDragonAttackElapsedMs(frame: number, elapsedInFrameMs: number): number {
    const index = Math.min(31, Math.max(0, Math.floor(frame)));
    return (
        (Math.min(index, 6) * (50 / 1.38)) / BLACK_DRAGON_ATTACK_SPEED +
        Math.min(20, Math.max(0, index - 6)) * (50 / BLACK_DRAGON_FIRE_SPEED) +
        (Math.max(0, index - 26) * 50) / BLACK_DRAGON_ATTACK_SPEED +
        Math.max(0, elapsedInFrameMs)
    );
}
