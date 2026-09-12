import { describe, expect, test } from "bun:test";

import { footprintComparisonLayout } from "./battlefieldCreatureEditorLayout";

describe("battlefield creature editor footprint layout", () => {
    test("spreads the thirteen 2x1 creatures across balanced rows with a one-cell gutter", () => {
        expect(footprintComparisonLayout(13, 2, 16)).toEqual({
            horizontalGapCells: 1,
            rowSizes: [5, 4, 4],
        });
    });

    test("spreads the twelve 2x2 creatures evenly instead of stacking them on one row", () => {
        expect(footprintComparisonLayout(12, 2, 16)).toEqual({
            horizontalGapCells: 1,
            rowSizes: [4, 4, 4],
        });
    });

    test("rebalances rows when creatures are temporarily hidden", () => {
        expect(footprintComparisonLayout(11, 2, 16).rowSizes).toEqual([4, 4, 3]);
        expect(footprintComparisonLayout(0, 2, 16).rowSizes).toEqual([]);
    });
});
