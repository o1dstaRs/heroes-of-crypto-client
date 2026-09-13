/** The generated reaction poses were registered at two different source scales. */
const WOLF_HIT_SCALES = [1, 1, 1.115, 1.115, 1.115, 1.115, 1.115, 1, 1] as const;
const WOLF_DEATH_SCALES = [1, 1, 1.115, 1.115, 1.115, 1.115, 1.115, 1.1] as const;

export function wolfReactionFrameScale(state: string | undefined, frameIndex: number): number {
    if (state === "hit") return WOLF_HIT_SCALES[frameIndex] ?? 1;
    if (state === "death") return WOLF_DEATH_SCALES[frameIndex] ?? 1;
    return 1;
}

/** Scale the authored body about its sole row without changing its world-space floor. */
export function wolfReactionFootAnchorY(scale: number): number {
    return (697 + (730 - 697) / scale) / 768;
}
