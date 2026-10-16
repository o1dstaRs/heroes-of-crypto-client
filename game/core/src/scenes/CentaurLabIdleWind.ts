export const CENTAUR_TAIL_WAVE_PERIOD_MS = 2550 / 1.3 / 1.2;
export const CENTAUR_HAIR_WAVE_PERIOD_MS = 3400;

function smoothstep(low: number, high: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
}

/** Independent travelling waves; neither clock restarts at an atlas-frame boundary. */
export function centaurIdleWindMotion(elapsedMs: number): [number, number, number, number] {
    const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
    const gesture = time % 5100;
    const hairFree = 1 - smoothstep(3300, 3600, gesture) * (1 - smoothstep(4780, 5080, gesture));
    return [
        (time / CENTAUR_TAIL_WAVE_PERIOD_MS) * Math.PI * 2,
        (time / CENTAUR_HAIR_WAVE_PERIOD_MS) * Math.PI * 2 + 1.7,
        smoothstep(0, 450, time),
        hairFree,
    ];
}

/** Original 896×768 artwork coordinates. Body, helmet, arm, spear and hoof contacts stay fixed. */
export function centaurIdleWindOffset(x: number, y: number, motion: readonly number[]): [number, number] {
    const tailEdge = 248 - Math.max(0, Math.min(1, (y - 380) / 340)) * 78;
    const tailMask = (1 - smoothstep(tailEdge - 12, tailEdge, x)) * smoothstep(374, 394, y);
    const tailU = Math.max(0, Math.min(1, (y - 380) / 310));
    // The flag's u^4 envelope anchors the root and lets the loose ends billow.
    const tail = tailMask * tailU ** 4 * Math.sin(Math.PI * 2 * 1.15 * tailU - motion[0]);
    const hairEdge =
        y < 140 ? 468 - (y - 90) * 0.84 : y < 230 ? 426 - (y - 140) * (57 / 90) : 369 - (y - 230) * (19 / 80);
    const hairMask =
        (1 - smoothstep(hairEdge - 10, hairEdge, x)) * smoothstep(90, 116, y) * (1 - smoothstep(286, 310, y));
    const hairU = Math.max(0, Math.min(1, (y - 90) / 210));
    const hair = hairMask * Math.sqrt(hairU) * Math.sin(Math.PI * 2 * 1.05 * hairU - motion[1]) * motion[3];
    // Only the soft black crest above the helmet moves. Its attached lower edge and height stay fixed.
    const crestBase = 42 + 0.008 * (x - 520) ** 2;
    const crestMask =
        smoothstep(430, 444, x) * (1 - smoothstep(595, 608, x)) * (1 - smoothstep(crestBase - 14, crestBase - 3, y));
    const crestU = Math.max(0, Math.min(1, (crestBase - y) / 38));
    const crest = crestMask * crestU * Math.sin(0.025 * (x - 450) - motion[1] + 0.8);
    return [(28 * tail + 28 * hair + 24 * crest) * motion[2], (10 * tail + 2.5 * hair) * motion[2]];
}

export const CENTAUR_IDLE_WIND_GLSL = /* glsl */ `
vec2 centaurWindOffset(vec2 p) {
    float tailEdge = 248.0 - clamp((p.y - 380.0) / 340.0, 0.0, 1.0) * 78.0;
    float tailMask = (1.0 - smoothstep(tailEdge - 12.0, tailEdge, p.x)) * smoothstep(374.0, 394.0, p.y);
    float tailU = clamp((p.y - 380.0) / 310.0, 0.0, 1.0);
    float tail = tailMask * pow(tailU, 4.0) * sin(6.28318530718 * 1.15 * tailU - uMotion.x);
    float hairEdge = p.y < 140.0 ? 468.0 - (p.y - 90.0) * 0.84
        : p.y < 230.0 ? 426.0 - (p.y - 140.0) * (57.0 / 90.0) : 369.0 - (p.y - 230.0) * (19.0 / 80.0);
    float hairMask = (1.0 - smoothstep(hairEdge - 10.0, hairEdge, p.x))
        * smoothstep(90.0, 116.0, p.y) * (1.0 - smoothstep(286.0, 310.0, p.y));
    float hairU = clamp((p.y - 90.0) / 210.0, 0.0, 1.0);
    float hair = hairMask * sqrt(hairU) * sin(6.28318530718 * 1.05 * hairU - uMotion.y) * uMotion.w;
    float crestBase = 42.0 + 0.008 * (p.x - 520.0) * (p.x - 520.0);
    float crestMask = smoothstep(430.0, 444.0, p.x) * (1.0 - smoothstep(595.0, 608.0, p.x))
        * (1.0 - smoothstep(crestBase - 14.0, crestBase - 3.0, p.y));
    float crestU = clamp((crestBase - p.y) / 38.0, 0.0, 1.0);
    float crest = crestMask * crestU * sin(0.025 * (p.x - 450.0) - uMotion.y + 0.8);
    return vec2(28.0 * tail + 28.0 * hair + 24.0 * crest, 10.0 * tail + 2.5 * hair) * uMotion.z;
}`;
