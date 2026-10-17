import { Rectangle } from "pixi.js";
import { ANGEL_MELEE_CALIBRATION } from "./AngelMeleeCalibration";
import { ANGEL_CAST_MELEE_CALIBRATION } from "./AngelCastMeleeCalibration";

// Crown-to-chin axes in native source pixels, measured without wings, weapon or pose bounds.
// Idle axis (424,40) -> (444,128); rotation of the skull does not change its physical length.
export const ANGEL_IDLE_SKULL_LENGTH = Math.hypot(20, 88);
// Standing cast cels were already registered by crown (552) and sole (1247):
// 695px, exactly idle's crown (40) to sole (735). Preserve that measured body height.
const castScales = Array.from({ length: 9 }, () => 1);
export const ANGEL_ACTION_FRAME_SCALES: Readonly<Record<string, readonly number[]>> = {
    cast: [1, ...castScales, ...castScales.slice(0, -1).reverse(), 1],
    // v11 hit cels keep the idle camera scale and folded-wing profile throughout.
    hit: [1, 1, 1, 1, 1],
    melee_attack: Array.from({ length: 8 }, () => 1),
    melee_attack_up: Array.from({ length: 8 }, () => 1),
    melee_attack_down: Array.from({ length: 8 }, () => 1),
    death: [
        1,
        ANGEL_IDLE_SKULL_LENGTH / Math.hypot(9, 93),
        ANGEL_IDLE_SKULL_LENGTH / Math.hypot(10, 99),
        ANGEL_IDLE_SKULL_LENGTH / 125,
        ANGEL_IDLE_SKULL_LENGTH / Math.hypot(2, 101),
        ANGEL_IDLE_SKULL_LENGTH / Math.hypot(69, 74),
    ],
};
export function angelActionFrameScale(state: string, frame: number): number {
    return ANGEL_ACTION_FRAME_SCALES[angelActionState(state)]?.[frame] ?? 1;
}

export function angelActionFrameWidthScale(state: string, frame: number): number {
    const action = angelActionState(state);
    return (
        ANGEL_MELEE_CALIBRATION[action]?.[frame]?.widthScale ??
        ANGEL_CAST_MELEE_CALIBRATION[action]?.[frame]?.widthScale ??
        1
    );
}

export function angelActionState(state: string): string {
    return state.replace(/^attack/, "melee_attack");
}

/** Actual opaque sole contact, not the assumed centre used by the source exporter. */
export function angelActionFrameOffset(state: string, frame: number): readonly [number, number] {
    const cels = ANGEL_MELEE_CALIBRATION[angelActionState(state)];
    const support = cels?.[frame]?.support;
    if (!support) return [0, 0];
    return [cels[0].support[0] - support[0], cels[0].support[1] - support[1]];
}

/** Change only the source-pixel registration. Logical size and planted contact stay fixed. */
export function calibratedAngelActionCanvas(width: number, height: number, state: string, frame: number) {
    const melee = angelActionState(state).startsWith("melee_attack");
    const divider = width / (state === "cast" ? 768 : melee ? 1280 : 1024);
    const factor = angelActionFrameScale(state, frame);
    const horizontal = factor * angelActionFrameWidthScale(state, frame);
    const [dx, dy] = angelActionFrameOffset(state, frame);
    const left = state === "cast" ? 0 : melee ? -256 : -128;
    const top = state === "cast" ? -512 : -128;
    return {
        orig: new Rectangle(0, 0, 768 * divider, 768 * divider),
        trim: new Rectangle(
            (left * horizontal + 373.5 * (1 - horizontal) + dx) * divider,
            (top * factor + 735 * (1 - factor) + dy) * divider,
            width * horizontal,
            height * factor,
        ),
    };
}
