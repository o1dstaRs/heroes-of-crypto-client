/** Continuous wall-clock wind, in the same 2.6 rad/s rhythm as the count banner. */
export const NIGHTMARE_WIND_SPEED = 2.6;

function smoothstep(a: number, b: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

/** Masks authored against battlefield_side_right_distance_readable_v6, 768×768. */
export function nightmareWindWeights(x: number, y: number): [number, number] {
    const tailEdge = 244 - Math.max(0, y - 430) * 0.28;
    const tail = (1 - smoothstep(tailEdge - 22, tailEdge, x)) * smoothstep(414, 444, y);
    const maneEdge = 465 + (410 - y);
    const mane = (1 - smoothstep(maneEdge - 28, maneEdge, x)) * (1 - smoothstep(389, 412, y)) * smoothstep(200, 225, y);
    return [tail, mane];
}

export function nightmareWindOffset(x: number, y: number, seconds: number, phase = 0): [number, number] {
    const [tailMask, maneMask] = nightmareWindWeights(x, y);
    const tailU = Math.max(0, Math.min(1, (y - 424) / 256));
    const maneU = Math.max(0, Math.min(1, (640 - x) / 310));
    const wave = (u: number) => Math.sin(Math.PI * 2 * 1.15 * u - NIGHTMARE_WIND_SPEED * seconds + phase);
    const tail = tailMask * tailU ** 2 * wave(tailU);
    const mane = maneMask * maneU ** 2 * wave(maneU);
    return [24 * tail + 10 * mane, 7 * tail + 15 * mane];
}

export const NIGHTMARE_WIND_GLSL = /* glsl */ `
vec2 windWeights(vec2 p) {
    float tailEdge = 244.0 - max(0.0, p.y - 430.0) * 0.28;
    float tail = (1.0 - smoothstep(tailEdge - 22.0, tailEdge, p.x)) * smoothstep(414.0, 444.0, p.y);
    float maneEdge = 465.0 + (410.0 - p.y);
    float mane = (1.0 - smoothstep(maneEdge - 28.0, maneEdge, p.x))
        * (1.0 - smoothstep(389.0, 412.0, p.y)) * smoothstep(200.0, 225.0, p.y);
    return vec2(tail, mane);
}
vec2 windOffset(vec2 p) {
    vec2 mask = windWeights(p);
    vec2 u = clamp(vec2((p.y - 424.0) / 256.0, (640.0 - p.x) / 310.0), 0.0, 1.0);
    vec2 wave = mask * u * u * sin(6.28318530718 * 1.15 * u - 2.6 * uTime + uPhase);
    return vec2(24.0 * wave.x + 10.0 * wave.y, 7.0 * wave.x + 15.0 * wave.y);
}`;
