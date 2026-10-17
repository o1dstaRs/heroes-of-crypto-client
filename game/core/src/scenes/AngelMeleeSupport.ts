import { angelActionFrameOffset, angelActionState } from "./AngelActionRegistration";
import { ANGEL_MELEE_SECOND_SUPPORT } from "./AngelMeleeMaterialCalibration";

// A second contact correction is local to the forward shin/boot. It must never
// scale the whole figure or disturb the first planted foot, torso, wings or blade.
const X0 = 405,
    X1 = 435,
    X2 = 560,
    X3 = 620,
    Y0 = 475,
    Y1 = 640;
const smooth = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
};
export function angelMeleeSupportWeight(x: number, y: number): number {
    return smooth(X0, X1, x) * (1 - smooth(X2, X3, x)) * smooth(Y0, Y1, y);
}
export function angelMeleeSecondSupportOffset(state: string, frame: number): readonly [number, number] {
    const contacts = ANGEL_MELEE_SECOND_SUPPORT[angelActionState(state)];
    const contact = contacts?.[frame];
    if (!contact) return [0, 0];
    const [dx, dy] = angelActionFrameOffset(state, frame);
    return [contacts[0][0] - contact[0] - dx, contacts[0][1] - contact[1] - dy];
}
export const ANGEL_MELEE_SUPPORT_GLSL = `
float secondSupportWeight(vec2 p) {
    return smoothstep(${X0}.0, ${X1}.0, p.x)
        * (1.0 - smoothstep(${X2}.0, ${X3}.0, p.x))
        * smoothstep(${Y0}.0, ${Y1}.0, p.y);
}`;
