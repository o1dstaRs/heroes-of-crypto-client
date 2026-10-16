import { describe, expect, test } from "bun:test";

import { isCarryOverUnit } from "./coopCarryOver";

describe("coop carry-over", () => {
    test("accepts only well-formed units", () => {
        expect(isCarryOverUnit({ unitName: "Peasant", cells: [{ x: 1, y: 1 }] })).toBe(true);
        expect(isCarryOverUnit({ unitName: "Peasant", cells: [{ x: 1.5, y: 1 }] })).toBe(false);
        expect(isCarryOverUnit({ unitName: 3, cells: [] })).toBe(false);
        expect(isCarryOverUnit(null)).toBe(false);
    });
});
