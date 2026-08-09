import { describe, expect, test } from "bun:test";
import { remainingAugmentPoints } from "./augmentSelectionState";

describe("remainingAugmentPoints", () => {
    test("restores the unspent ranked budget from authoritative selections", () => {
        expect(
            remainingAugmentPoints(7, {
                placement: 2,
                armor: 2,
                might: 0,
                empower: 3,
                sniper: 0,
                movement: 0,
            }),
        ).toBe(0);
    });

    test("never exposes a negative point balance while reconciling", () => {
        expect(
            remainingAugmentPoints(5, {
                placement: 0,
                armor: 3,
                might: 3,
                empower: 0,
                sniper: 0,
                movement: 0,
            }),
        ).toBe(0);
    });
});
