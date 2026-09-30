import { CENTAUR_TAIL_WAVE_PERIOD_MS } from "./CentaurLabIdleWind";

/** Match the current centaur's cadence, on an uninterrupted clock independent of the crouch. */
export const WHITE_TIGER_TAIL_SPEED = (Math.PI * 2 * 1000) / CENTAUR_TAIL_WAVE_PERIOD_MS;
const TAIL_PHASE_LAG = 0.55;
const TAIL_SWAY_X = 4;
const TAIL_SWAY_Y = 24;

function smoothstep(low: number, high: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
}

/** Coordinates are in the authored 768px canvas, independent of sprite facing. */
export function whiteTigerTailOffset(x: number, y: number, nowMs: number): [number, number] {
    const phase = (Number.isFinite(nowMs) ? nowMs : 0) * 0.001 * WHITE_TIGER_TAIL_SPEED;
    const u = Math.max(0, Math.min(1, (190 - x) / 150));
    const mask = smoothstep(450, 490, y) * (1 - smoothstep(615, 655, y));
    if (!u || !mask) return [0, 0];
    // The wolf's small phase lag produces one connected sway. A quadratic envelope
    // eases out of the attached root and carries the bend along the tiger's curved tail.
    const wave = mask * u ** 2 * Math.sin(phase - TAIL_PHASE_LAG * u);
    return [TAIL_SWAY_X * wave, TAIL_SWAY_Y * wave];
}

export const WHITE_TIGER_TAIL_GLSL = /* glsl */ `
vec2 tigerTailOffset(vec2 p) {
    float u = clamp((190.0 - p.x) / 150.0, 0.0, 1.0);
    float mask = smoothstep(450.0, 490.0, p.y) * (1.0 - smoothstep(615.0, 655.0, p.y));
    float wave = mask * u * u * sin(uPhase - ${TAIL_PHASE_LAG} * u);
    return vec2(${TAIL_SWAY_X.toFixed(1)}, ${TAIL_SWAY_Y.toFixed(1)}) * wave;
}`;
