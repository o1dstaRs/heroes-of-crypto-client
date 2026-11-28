import { describe, expect, test } from "bun:test";

import { popoverPositionAtPointer } from "./popoverPosition";

describe("popoverPositionAtPointer", () => {
    const viewport = { width: 1000, height: 800 };
    const tooltip = { width: 240, height: 60 };

    test("offsets the tooltip below and to the right of an ordinary pointer", () => {
        expect(popoverPositionAtPointer({ x: 120, y: 300 }, tooltip, viewport)).toEqual({ x: 132, y: 312 });
    });

    test("lifts the tooltip above a pointer near the bottom edge", () => {
        expect(popoverPositionAtPointer({ x: 120, y: 760 }, tooltip, viewport)).toEqual({ x: 132, y: 688 });
    });

    test("flips at the right edge as well so the whole hint stays readable", () => {
        expect(popoverPositionAtPointer({ x: 980, y: 760 }, tooltip, viewport)).toEqual({ x: 728, y: 688 });
    });
});
