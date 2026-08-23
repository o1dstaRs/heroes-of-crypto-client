import { describe, expect, test } from "bun:test";
import { combatFootprintCellsForBase } from "./HoverManager";

describe("combat hover footprint", () => {
    test("a small unit highlights its anchor cell", () => {
        expect(combatFootprintCellsForBase({ x: 8, y: 9 }, 1)).toEqual([{ x: 8, y: 9 }]);
    });

    test("a large unit highlights every occupied cell down-left from its anchor", () => {
        expect(combatFootprintCellsForBase({ x: 8, y: 9 }, 2)).toEqual([
            { x: 8, y: 9 },
            { x: 7, y: 9 },
            { x: 8, y: 8 },
            { x: 7, y: 8 },
        ]);
    });

    test("a 2x1 unit highlights only two horizontal cells", () => {
        expect(combatFootprintCellsForBase({ x: 8, y: 9 }, 2, 1)).toEqual([
            { x: 8, y: 9 },
            { x: 7, y: 9 },
        ]);
    });
});
