export const FAIRY_LAB_ATTACK_DURATIONS_MS = [100, 180, 110, 170, 200, 140] as const;

// Milliseconds, hip translation X/Y, forward lean in radians. Whole upper-body
// motion joins the authored hand poses; the boots remain on their contact row.
const keys = [
    [0, 0, 0, 0],
    [100, -4, 2, -0.012],
    [260, -16, 12, -0.065],
    [390, 14, 8, 0.075],
    [470, 20, 12, 0.105],
    [560, 16, 10, 0.085],
    [760, 2, 2, 0.012],
    [900, 0, 0, 0],
] as const;

export function fairyLabAttackMotion(state: string | undefined, elapsedMs: number): [number, number, number] {
    if (!state || !["melee_attack", "melee_attack_up", "melee_attack_down"].includes(state)) return [0, 0, 0];
    const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    for (let i = 1; i < keys.length; i++) {
        if (time > keys[i][0]) continue;
        const a = keys[i - 1];
        const b = keys[i];
        const phase = Math.min(1, (time - a[0]) / (b[0] - a[0]));
        const t = phase * phase * (3 - 2 * phase);
        const motion = [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
        if (state === "melee_attack_up") motion[1] *= 0.35;
        if (state === "melee_attack_down") {
            motion[1] *= 1.55;
            motion[2] *= 1.25;
        }
        return motion as [number, number, number];
    }
    return [0, 0, 0];
}

export function fairyLabAttackElapsed(frame: number, elapsedInFrame: number, durations: readonly number[]): number {
    let elapsed = Math.max(0, elapsedInFrame);
    for (let i = 0; i < Math.min(frame, durations.length); i++) elapsed += durations[i];
    return elapsed;
}
