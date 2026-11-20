import { CENTAUR_TAIL_WAVE_PERIOD_MS } from "./CentaurLabIdleWind";

/** Match the current centaur's cadence, on an uninterrupted clock independent of the crouch. */
export const WHITE_TIGER_TAIL_SPEED = (Math.PI * 2 * 1000) / CENTAUR_TAIL_WAVE_PERIOD_MS;
const TAIL_PHASE_LAG = 0.55;
const TAIL_SWAY_X = 4;
const TAIL_SWAY_Y = 24;

export const WHITE_TIGER_TAIL_GLSL = /* glsl */ `
vec2 tigerTailOffset(vec2 p) {
    float u = clamp((190.0 - p.x) / 150.0, 0.0, 1.0);
    float mask = smoothstep(450.0, 490.0, p.y) * (1.0 - smoothstep(615.0, 655.0, p.y));
    float wave = mask * u * u * sin(uPhase - ${TAIL_PHASE_LAG} * u);
    return vec2(${TAIL_SWAY_X.toFixed(1)}, ${TAIL_SWAY_Y.toFixed(1)}) * wave;
}`;
