/** Five complete body poses: grip, crouch, lift, release, and closed-eye grip. */
export const CYCLOPS_IDLE_FULL_BODY_FRAME_COUNT = 5;
export const CYCLOPS_IDLE_FULL_BODY_PERIOD_MS = 3600;

/** The stone's small toss is driven by the same painted shoulders, arms, and torso as each pose. */
export function cyclopsIdleFullBodyFrame(elapsedMs: number): number {
    const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) % CYCLOPS_IDLE_FULL_BODY_PERIOD_MS;
    // Two 110ms blinks per 3.6s cycle, both while the painted body is at rest.
    if (time >= 700 && time < 810) return 4;
    if (time < 1400) return 0;
    if (time < 1600) return 1;
    if (time < 1800) return 2;
    if (time < 1980) return 3;
    if (time < 2160) return 2;
    if (time < 2340) return 1;
    if (time < 3160) return 0;
    if (time < 3270) return 4;
    return 0;
}
