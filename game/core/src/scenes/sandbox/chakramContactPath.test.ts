import { describe, expect, test } from "bun:test";
import { chakramContactPath } from "./chakramContactPath";

describe("Chakram preselected contact route", () => {
    test("keeps a recorded detour instead of flattening it into a direct shot", () => {
        const ground = Object.freeze([
            Object.freeze({ x: 0, y: 0 }),
            Object.freeze({ x: 0, y: 10 }),
            Object.freeze({ x: 20, y: 10 }),
            Object.freeze({ x: 20, y: 0 }),
        ]);
        const path = chakramContactPath(ground, { x: 3, y: 30 }, { x: 23, y: 50 });
        expect(path).toEqual([
            { x: 3, y: 30 },
            { x: 3, y: 45 },
            { x: 23, y: 55 },
            { x: 23, y: 50 },
        ]);
    });

    test("repeated ground cells cannot produce a late turn or nonfinite coordinates", () => {
        const path = chakramContactPath(
            [
                { x: 4, y: 2 },
                { x: 4, y: 2 },
                { x: 4, y: 2 },
            ],
            { x: 4, y: 10 },
            { x: 8, y: 14 },
        );
        expect(path).toEqual([
            { x: 4, y: 10 },
            { x: 6, y: 12 },
            { x: 8, y: 14 },
        ]);
        expect(chakramContactPath([{ x: 4, y: 2 }], path[0], path[2])).toEqual([path[0], path[2]]);
    });
});
