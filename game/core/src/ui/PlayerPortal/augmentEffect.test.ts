import { describe, expect, test } from "bun:test";

import { augmentEffectSummary } from "./augmentEffect";

// The hover card quotes the level's real numbers off the engine's own power tables, so a recorded build
// can never claim an effect the fight did not apply.
describe("augment effect summary", () => {
    test("reads each leveled augment's numbers off the shared power tables", () => {
        expect(augmentEffectSummary("Armor", 2)).toBe("+13% armor and +13 magic armor for every unit");
        expect(augmentEffectSummary("Might", 3)).toBe("+27% melee damage for every unit");
        expect(augmentEffectSummary("Empower", 1)).toBe("+7% magic damage from spells, abilities and effects");
        expect(augmentEffectSummary("Sniper", 3)).toBe("+27% ranged damage and +70% shooting range");
        expect(augmentEffectSummary("Movement", 2)).toBe("+2 movement steps for every unit");
    });

    test("tells the placement tiers apart without a map shape to quote rows from", () => {
        expect(augmentEffectSummary("Placement", 1)).toBe("Standard deployment zone");
        expect(augmentEffectSummary("Placement", 2)).toBe("Wider deployment zone");
        expect(augmentEffectSummary("Placement", 3)).toBe("Widest deployment zone, up to the board's edge");
    });

    test("falls back to the augment's generic line for a level the tables do not know", () => {
        expect(augmentEffectSummary("Armor", 9)).toBe("Raises physical Armor and adds flat Magic Armor to every unit.");
        expect(augmentEffectSummary("Movement", 5)).toBe("Adds movement steps to every unit.");
    });
});
