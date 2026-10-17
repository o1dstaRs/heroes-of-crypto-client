export const UNICORN_PAW_PERIOD_MS = 3000;
export const UNICORN_IDLE_DURATIONS_MS = [2100, 150, 150, 250, 200, 150] as const;
export function unicornIdleFrame(elapsedMs: number): number {
    let time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) % UNICORN_PAW_PERIOD_MS;
    for (let i = 0; i < UNICORN_IDLE_DURATIONS_MS.length; i++) {
        if (time < UNICORN_IDLE_DURATIONS_MS[i]) return i;
        time -= UNICORN_IDLE_DURATIONS_MS[i];
    }
    return 0;
}
/** Dust is visible during the forward contact and backward scrape poses, never delayed into recovery. */
export function unicornDustAge(elapsedMs: number): number {
    const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) % UNICORN_PAW_PERIOD_MS;
    return time >= 2250 && time < 2650 ? (time - 2250) / 400 : -1;
}
// The static torso/rump and all legs are outside these wind regions. Pawing is authored in the atlas.
export const UNICORN_IDLE_GLSL = /* glsl */ `
vec2 unicornIdleOffset(vec2 p) {
    float tailU = clamp((p.y - 440.0) / 260.0, 0.0, 1.0);
    float tailMask = 1.0 - smoothstep(75.0, 120.0, p.x);
    float tailWave = tailMask * tailU * tailU * sin(4.2 * tailU + uPhase);
    float maneU = clamp((555.0 - p.x) / 245.0, 0.0, 1.0);
    float maneEdge = 555.0 - 0.44 * (p.y - 145.0);
    float maneLeft = 435.0 - .5 * (p.y - 145.0);
    float maneMask = smoothstep(maneLeft, maneLeft + 24.0, p.x) * smoothstep(125.0, 170.0, p.y) * (1.0 - smoothstep(380.0, 440.0, p.y))
        * (1.0 - smoothstep(maneEdge - 48.0, maneEdge, p.x));
    float maneWave = maneMask * maneU * maneU * sin(4.2 * maneU + uPhase);
    return vec2(32.0, 10.0) * tailWave + vec2(-15.0, 23.0) * maneWave;
}`;
