import { readAnimationSetting } from "../settings/animationLabProfile";
/** Continuous travelling wave in the loose red waistcloth; the belt stays pinned. */
export const CYCLOPS_CLOTH_PERIOD_MS = readAnimationSetting("cyclops.clothPeriodMs", 1800);
export function cyclopsClothMotion(elapsedMs: number, frame: number): [number, number, number, number] {
    const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    const root = frame === 1 ? 406 : frame === 2 ? 338 : 374;
    const hem = frame === 1 ? 618 : frame === 2 ? 574 : 590;
    return [((time % CYCLOPS_CLOTH_PERIOD_MS) / CYCLOPS_CLOTH_PERIOD_MS) * Math.PI * 2, root, hem, 1];
}
export const CYCLOPS_CLOTH_GLSL = /* glsl */ `
vec2 cyclopsClothOffset(vec2 p) {
    float u = clamp((p.y - uMotion.y) / (uMotion.z - uMotion.y), 0.0, 1.0);
    float center = mix(402.0, 389.0, u);
    float halfWidth = mix(67.0, 19.0, u);
    float mask = (1.0 - smoothstep(halfWidth - 9.0, halfWidth + 6.0, abs(p.x - center)))
        * (1.0 - smoothstep(uMotion.z + 5.0, uMotion.z + 23.0, p.y));
    float envelope = u * u * mask;
    float wave = sin(7.5 * u - uMotion.x);
    float ripple = sin(14.0 * u - 2.0 * uMotion.x + 0.6);
    return vec2(15.0 * wave + 3.0 * ripple, 3.5 * wave) * envelope;
}`;
