import { describe, expect, test } from "bun:test";

import { applyPickPreviewOrder, parsePickPreviewOrders, swapPickPreviewCards } from "./pickPreviewOrder";

describe("manual preview card order", () => {
    test("swaps distant cards without shifting the other slots", () => {
        const order = [31, 32, 21, 22, 1, 2, 11, 12];
        expect(swapPickPreviewCards(order, 31, 12)).toEqual([12, 32, 21, 22, 1, 2, 11, 31]);
        expect(order).toEqual([31, 32, 21, 22, 1, 2, 11, 12]);
    });

    test("keeps a valid roster when stored cards were removed or new ones were added", () => {
        expect(applyPickPreviewOrder([31, 32, 21, 22], [21, 999, 31, 21])).toEqual([21, 31, 32, 22]);
    });

    test("rejects malformed storage and separates level orders", () => {
        expect(parsePickPreviewOrders("broken")).toEqual({});
        expect(parsePickPreviewOrders("null")).toEqual({});
        expect(parsePickPreviewOrders("[31,32]")).toEqual({});
        expect(parsePickPreviewOrders('{"1":[21,31,21,"32",null,-1],"2":[25,24],"5":[1]}')).toEqual({
            1: [21, 31],
            2: [25, 24],
        });
    });

    test("default order and missing swap targets never drop a card", () => {
        expect(applyPickPreviewOrder([31, 32, 21])).toEqual([31, 32, 21]);
        expect(swapPickPreviewCards([31, 32, 21], 999, 21)).toEqual([31, 32, 21]);
        expect(swapPickPreviewCards([31, 32, 21], 31, 31)).toEqual([31, 32, 21]);
    });
});
