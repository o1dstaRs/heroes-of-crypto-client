import { describe, expect, it } from "bun:test";

import { appliedSynergyLevelByKey, substitutedSynergyDescription } from "./SynergySlots";

describe("synergy sidebar helpers", () => {
    it("fills every {} placeholder with the level's real numbers", () => {
        // The raw templates rendered literally ("+{} morale and +{} luck") — the owner's report.
        expect(substitutedSynergyDescription("Life:2:2")).toBe("The entire army gets +13 morale and +5 luck");
        expect(substitutedSynergyDescription("Life:1:1")).toBe(
            "Increases each unit's supply by 6% at the start of the battle",
        );
        expect(substitutedSynergyDescription("Chaos:2:3")).toBe(
            "17% chance to apply Break on attack which disables enemy abilities for 1 turn",
        );
        // Nature:1:2 is [3] since the board-slot rebalance (+2/+3/+4, common 451e4cf).
        expect(substitutedSynergyDescription("Nature:1:2")).toBe("Team can place 3 more units on the board");
        // No leftover placeholders in ANY level of any synergy.
        for (const faction of ["Life", "Chaos", "Might", "Nature"]) {
            for (const variant of [1, 2]) {
                for (const level of [1, 2, 3]) {
                    expect(substitutedSynergyDescription(`${faction}:${variant}:${level}`)).not.toContain("{}");
                }
            }
        }
    });

    it("indexes the applied one-of-two entries by faction:variant", () => {
        expect(appliedSynergyLevelByKey(["Life:2:2", "Might:1:3"])).toEqual({
            "Life:2": 2,
            "Might:1": 3,
        });
        // Zero-level and malformed entries never register as chosen.
        expect(appliedSynergyLevelByKey(["Chaos:1:0", "garbage", ""])).toEqual({});
    });
});
