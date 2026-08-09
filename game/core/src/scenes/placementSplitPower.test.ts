import { describe, expect, test } from "bun:test";

import { projectPlacementSplitStackPowers } from "./placementSplitPower";

describe("placement split stack-power projection", () => {
    test("recalculates both halves and rebases every other stack against the projected maximum", () => {
        const projection = projectPlacementSplitStackPowers(
            [
                { id: "source", experience: 1, amount: 10 },
                { id: "other", experience: 1, amount: 8 },
            ],
            "source",
            4,
        );

        expect(projection?.unitPowers.get("source")).toBe(4);
        expect(projection?.splitPower).toBe(3);
        expect(projection?.unitPowers.get("other")).toBe(5);
    });

    test("uses a stronger unrelated stack as the denominator", () => {
        const projection = projectPlacementSplitStackPowers(
            [
                { id: "source", experience: 1, amount: 10 },
                { id: "strongest", experience: 1, amount: 20 },
            ],
            "source",
            4,
        );

        expect(projection?.unitPowers.get("source")).toBe(2);
        expect(projection?.splitPower).toBe(1);
        expect(projection?.unitPowers.get("strongest")).toBe(5);
    });

    test("updates the peeled stack as the drag moves from one model to all but one", () => {
        const stacks = [{ id: "source", experience: 1, amount: 10 }];

        expect(projectPlacementSplitStackPowers(stacks, "source", 1)?.splitPower).toBe(1);
        expect(projectPlacementSplitStackPowers(stacks, "source", 4)?.splitPower).toBe(4);
        expect(projectPlacementSplitStackPowers(stacks, "source", 9)?.unitPowers.get("source")).toBe(1);
        expect(projectPlacementSplitStackPowers(stacks, "source", 9)?.splitPower).toBe(5);
    });

    test("rejects a missing source and invalid split amounts", () => {
        const stacks = [{ id: "source", experience: 1, amount: 10 }];

        expect(projectPlacementSplitStackPowers(stacks, "missing", 1)).toBeUndefined();
        expect(projectPlacementSplitStackPowers(stacks, "source", 0)).toBeUndefined();
        expect(projectPlacementSplitStackPowers(stacks, "source", 10)).toBeUndefined();
        expect(projectPlacementSplitStackPowers(stacks, "source", 1.5)).toBeUndefined();
    });
});
