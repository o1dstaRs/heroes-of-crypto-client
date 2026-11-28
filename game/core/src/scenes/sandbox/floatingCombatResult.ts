import { FLOATING_RESULT_DURATION_MS } from "../../settings/statusEffectTiming";

/** Measurements in world pixels, shared with the native battlefield. */
export const FLOATING_RESULT = {
    duration: FLOATING_RESULT_DURATION_MS / 1000,
    fadeIn: 0.125,
    fadeOutFrom: 0.62,
    flagGap: 6,
    columnWidth: 160,
    columns: [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6],
    rowStep: 46,
    damage: {
        bottom: 36,
        fontSize: 60,
        strokeWidth: 5,
        shadow: { color: "#000000", blur: 4, angle: Math.PI / 6, distance: 2 },
    },
    kills: {
        bottom: 80,
        fontSize: 40,
        strokeWidth: 4,
        iconSize: 40,
        halfSpacing: 25,
        y: 55,
    },
} as const;
