import { describe, expect, test } from "bun:test";

import {
    BARREL_SHADOW_EDITOR_LAYOUT,
    DEFAULT_BARREL_SHADOW_TUNING,
    normalizeBarrelShadowTuning,
} from "./barrelShadowTuning";

describe("barrel shadow tuning", () => {
    test("lines up all nine barrel variants across the upper battlefield row", () => {
        expect(BARREL_SHADOW_EDITOR_LAYOUT).toHaveLength(9);
        expect(BARREL_SHADOW_EDITOR_LAYOUT.map(({ x }) => x)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
        expect(BARREL_SHADOW_EDITOR_LAYOUT.map(({ y }) => y)).toEqual(Array(9).fill(15));
        expect(BARREL_SHADOW_EDITOR_LAYOUT.map(({ variant }) => variant)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    test("keeps the approved dark creature-style defaults", () => {
        expect(DEFAULT_BARREL_SHADOW_TUNING.alpha).toBe(0.45);
        expect(DEFAULT_BARREL_SHADOW_TUNING).toEqual({
            offsetXCells: 0.03,
            offsetYCells: 0.4,
            widthScale: 1,
            lengthCells: 0.86,
            alpha: 0.45,
            rotationDegrees: -2,
        });
        expect(normalizeBarrelShadowTuning()).toEqual(DEFAULT_BARREL_SHADOW_TUNING);
    });

    test("clamps values written by manual number inputs", () => {
        expect(
            normalizeBarrelShadowTuning({
                offsetXCells: 10,
                offsetYCells: -10,
                widthScale: 0,
                lengthCells: 99,
                alpha: 4,
                rotationDegrees: -90,
            }),
        ).toEqual({
            offsetXCells: 2,
            offsetYCells: -2,
            widthScale: 0.1,
            lengthCells: 2.5,
            alpha: 1,
            rotationDegrees: -60,
        });
    });
});
