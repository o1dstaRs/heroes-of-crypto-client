// Four relaxed tail swishes and two slower hair waves per authored 7.34-second idle.
export const NOMAD_TAIL_PERIOD_MS = 1835;
export const NOMAD_HAIR_PERIOD_MS = 3670;

function smoothstep(low: number, high: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
}

/** Authored 768px coordinates. Tail root, shoulder, turban and all hooves stay fixed. */
export function nomadIdleWindOffset(x: number, y: number, elapsedMs: number): [number, number] {
    const time = Number.isFinite(elapsedMs) ? elapsedMs : 0;
    const tailPhase = (time * Math.PI * 2) / NOMAD_TAIL_PERIOD_MS;
    const hairPhase = (time * Math.PI * 2) / NOMAD_HAIR_PERIOD_MS;
    const tailU = Math.max(0, Math.min(1, (y - 375) / 230));
    const tailEdge = 205 - 0.36 * (y - 375);
    const tailMask = (1 - smoothstep(tailEdge - 12, tailEdge, x)) * (1 - smoothstep(610, 640, y));
    const tail = tailMask * tailU * tailU * Math.sin(tailPhase - tailU * 0.65);
    const hairU = Math.max(0, Math.min(1, (y - 133) / 110));
    const hairEdge = 332 - 0.85 * (y - 138);
    const hairMask = (1 - smoothstep(hairEdge - 14, hairEdge - 3, x)) * (1 - smoothstep(232, 250, y));
    const hair = hairMask * hairU * Math.sin(hairPhase - hairU * 0.8);
    return [18 * tail - 9 * hair, 4 * tail + 7 * hair];
}

export const NOMAD_IDLE_WIND_GLSL = /* glsl */ `
vec2 nomadIdleWindOffset(vec2 p) {
    float tailU = clamp((p.y - 375.0) / 230.0, 0.0, 1.0);
    float tailEdge = 205.0 - 0.36 * (p.y - 375.0);
    float tailMask = (1.0 - smoothstep(tailEdge - 12.0, tailEdge, p.x))
        * (1.0 - smoothstep(610.0, 640.0, p.y));
    float tail = tailMask * tailU * tailU * sin(uTailPhase - tailU * 0.65);
    float hairU = clamp((p.y - 133.0) / 110.0, 0.0, 1.0);
    float hairEdge = 332.0 - 0.85 * (p.y - 138.0);
    float hairMask = (1.0 - smoothstep(hairEdge - 14.0, hairEdge - 3.0, p.x))
        * (1.0 - smoothstep(232.0, 250.0, p.y));
    float hair = hairMask * hairU * sin(uHairPhase - hairU * 0.8);
    return vec2(18.0 * tail - 9.0 * hair, 4.0 * tail + 7.0 * hair);
}`;
