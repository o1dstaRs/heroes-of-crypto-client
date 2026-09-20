export const MANTICORE_IDLE_PERIOD_MS = 4400 / (1.15 * 1.2);
const smoothstep = (lo: number, hi: number, value: number): number => {
    const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
};

/** Crouch in pixels, tail sweep in pixels, and eye intensity; one continuous authored cycle. */
export function manticoreIdleMotion(elapsedMs: number): [number, number, number, number] {
    const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
    const phase = ((time % MANTICORE_IDLE_PERIOD_MS) / MANTICORE_IDLE_PERIOD_MS) * Math.PI * 2;
    const fade = smoothstep(0, 650 / (1.15 * 1.2), time);
    return [
        16 * (0.5 - 0.5 * Math.cos(phase)) * fade,
        24 * Math.sin(phase - 0.65) * fade,
        3 * Math.sin(phase * 2 - 0.65) * fade,
        (0.64 + 0.25 * Math.sin(phase * 2) + 0.06 * Math.sin(phase * 6)) * fade,
    ];
}

/** Forward deformation in source coordinates. All four planted paws remain stationary. */
export function manticoreIdleOffset(x: number, y: number, motion: readonly number[]): [number, number] {
    const body = 1 - smoothstep(560, 690, y);
    const tail = (1 - smoothstep(155, 205, x)) * (1 - smoothstep(490, 570, y));
    return [motion[1] * tail, motion[0] * body + motion[2] * tail];
}
export const MANTICORE_IDLE_OFFSET_GLSL = /* glsl */ `
vec2 idleOffset(vec2 p) {
    float body = 1.0 - smoothstep(560.0, 690.0, p.y);
    float tail = (1.0 - smoothstep(155.0, 205.0, p.x))
        * (1.0 - smoothstep(490.0, 570.0, p.y));
    return vec2(uMotion.y * tail, uMotion.x * body + uMotion.z * tail);
}`;
