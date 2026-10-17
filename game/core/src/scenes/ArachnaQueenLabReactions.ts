export const QUEEN_DEATH_PLAYBACK_SPEED = 1.3 * 1.3 * 1.2;
export const QUEEN_REACTION_DURATION_MS = { hit: 560, death: 1800 / QUEEN_DEATH_PLAYBACK_SPEED } as const;
export type QueenReaction = keyof typeof QUEEN_REACTION_DURATION_MS;
const smooth = (a: number, b: number, t: number): number => {
    const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
};
export function queenReactionPose(state: QueenReaction, elapsedMs: number) {
    const time = Math.min(QUEEN_REACTION_DURATION_MS[state], Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0));
    const impact = smooth(0, 85, time) * (1 - smooth(120, state === "hit" ? 560 : 460, time));
    return {
        recoil: -19 * impact,
        crouch: state === "hit" ? 14 * impact : 0,
        collapse: state === "death" ? smooth(170, 1320, time) : 0,
        life: state === "death" ? 1 - smooth(240, 1160, time) : 1,
        time,
    };
}
// Bright green iris centers measured on the eight approved walk cels.
export const QUEEN_WALK_EYES = [
    [518, 430],
    [518, 435],
    [516, 430],
    [516, 435],
    [516, 438],
    [516, 444],
    [517, 438],
    [518, 431],
] as const;
// Register the smaller eye independently: its distance to the main iris changes with the head pose.
export const QUEEN_WALK_FAR_EYES = [
    [498, 420],
    [498, 426],
    [504, 418],
    [496, 426],
    [497, 432],
    [500, 434],
    [502, 428],
    [499, 420],
] as const;
