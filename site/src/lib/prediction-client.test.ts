import { describe, expect, test } from "bun:test";

import { impliedShare } from "./prediction-client";

describe("prediction market odds", () => {
    test("uses even odds when neither side has a pool", () => {
        expect(impliedShare(0, 0)).toBe(0.5);
    });

    test("uses each side's share of a populated pool", () => {
        expect(impliedShare(75, 25)).toBe(0.75);
    });
});
