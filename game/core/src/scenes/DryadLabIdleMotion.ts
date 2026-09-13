export const DRYAD_IDLE_PERIOD_MS = 5200;

function smoothstep(low: number, high: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
}

/** Pixel offsets in the canonical 768px figure: sway, settle, and a gentle string check. */
export function dryadIdleMotion(elapsedMs: number): [number, number, number, number] {
    const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
    const phaseMs = elapsed % DRYAD_IDLE_PERIOD_MS;
    const phase = (phaseMs / DRYAD_IDLE_PERIOD_MS) * Math.PI * 2;
    const fade = smoothstep(0, 600, elapsed);
    const draw = smoothstep(1200, 2050, phaseMs) * (1 - smoothstep(2400, 3600, phaseMs));
    return [18 * Math.sin(phase) * fade, 3 * Math.sin(2 * phase) * fade, 18 * draw, 0];
}

/** Shared authoring coordinates for the connected hand, arrow and two string segments. */
export function dryadIdleOffset(x: number, y: number, motion: readonly number[]): [number, number] {
    const upper = 1 - smoothstep(440, 680, y);
    const arm = Math.exp(-Math.pow((x - 292) / 96, 2) - Math.pow((y - 257) / 32, 2));
    const upperString = y <= 253;
    const reach = upperString ? (y - 61) / 192 : (480 - y) / 227;
    const amount = Math.max(0, Math.min(1, reach));
    const stringX = upperString ? 477 - 161 * amount : 456 - 140 * amount;
    const string =
        (1 - smoothstep(3, 40, Math.abs(x - stringX))) * smoothstep(54, 66, y) * (1 - smoothstep(476, 488, y));
    // Move the arrow longitudinally with the drawing hand. No release or projectile is created.
    const arrow = smoothstep(317, 340, x) * (1 - smoothstep(608, 680, x)) * (1 - smoothstep(3, 16, Math.abs(y - 252)));
    const handAndString = arm * (1 - string) + amount * string;
    const pull = handAndString * (1 - arrow) + arrow;
    return [motion[0] * upper - motion[2] * pull, motion[1] * upper];
}

// Equivalent field for the existing Pixi idle-filter path. All samples retain the canonical RGB/alpha.
export const DRYAD_IDLE_OFFSET_GLSL = /* glsl */ `
vec2 dryadOffset(vec2 p) {
    float upper = 1.0 - smoothstep(440.0, 680.0, p.y);
    vec2 armDelta = (p - vec2(292.0, 257.0)) / vec2(96.0, 32.0);
    float arm = exp(-dot(armDelta, armDelta));
    bool upperString = p.y <= 253.0;
    float amount = clamp(upperString ? (p.y - 61.0) / 192.0 : (480.0 - p.y) / 227.0, 0.0, 1.0);
    float stringX = upperString ? 477.0 - 161.0 * amount : 456.0 - 140.0 * amount;
    float bowstring = (1.0 - smoothstep(3.0, 40.0, abs(p.x - stringX)))
        * smoothstep(54.0, 66.0, p.y) * (1.0 - smoothstep(476.0, 488.0, p.y));
    float arrow = smoothstep(317.0, 340.0, p.x) * (1.0 - smoothstep(608.0, 680.0, p.x))
        * (1.0 - smoothstep(3.0, 16.0, abs(p.y - 252.0)));
    float pull = mix(mix(arm, amount, bowstring), 1.0, arrow);
    return vec2(uMotion.x * upper - uMotion.z * pull, uMotion.y * upper);
}`;
