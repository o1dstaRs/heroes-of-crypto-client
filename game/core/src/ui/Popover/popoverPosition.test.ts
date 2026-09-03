import { describe, expect, test } from "bun:test";

import { popoverPositionAtPointer } from "./popoverPosition";

describe("popoverPositionAtPointer", () => {
    test("offsets the tooltip below and to the right of an ordinary pointer", () => {
        expect(popoverPositionAtPointer({ x: 120, y: 300 }, 800)).toEqual({ x: 130, y: 310 });
    });

    test("lifts the tooltip above a pointer near the bottom edge", () => {
        expect(popoverPositionAtPointer({ x: 120, y: 760 }, 800)).toEqual({ x: 130, y: 690 });
    });
});
