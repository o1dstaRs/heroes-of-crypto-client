import { describe, expect, it } from "bun:test";

import { synergyEffectAtLevel, synergyLadder, synergyNextLevel } from "./synergyLadder";

describe("synergy ladder", () => {
    it("reads the engine's own numbers for every level of a one-number synergy", () => {
        // Nature's flying armour: 15 / 24 / 35, and the sentence puts a % right after the number.
        expect(synergyLadder("Nature", 2)).toEqual([{ label: "", values: ["15%", "24%", "35%"] }]);
        // Chaos movement is measured in cells, so the same shape must NOT print a percent sign.
        expect(synergyLadder("Chaos", 1)).toEqual([{ label: "", values: ["1", "2", "3"] }]);
    });

    it("follows each number separately when a synergy gives two, naming them from its own sentence", () => {
        expect(synergyLadder("Life", 2)).toEqual([
            { label: "morale", values: ["6", "13", "20"] },
            { label: "luck", values: ["2", "5", "9"] },
        ]);
    });

    it("has a ladder for all eight synergies, three values each", () => {
        for (const faction of ["Life", "Nature", "Chaos", "Might"]) {
            for (const variant of [1, 2]) {
                const rows = synergyLadder(faction, variant);
                expect(rows.length).toBeGreaterThan(0);
                for (const row of rows) {
                    expect(row.values).toHaveLength(3);
                    expect(row.values).not.toContain("—");
                }
            }
        }
    });

    it("is empty for a synergy nobody fields, rather than inventing a row", () => {
        expect(synergyLadder("Nature", 7)).toEqual([]);
        expect(synergyLadder("Nonsense", 1)).toEqual([]);
    });

    it("fills the sentence at the level asked for, clamping outside the ladder", () => {
        expect(synergyEffectAtLevel("Nature", 2, 2)).toBe("Flying units get +24% of additional armor");
        expect(synergyEffectAtLevel("Life", 2, 3)).toBe("The entire army gets +20 morale and +9 luck");
        // A locked synergy still reads its level 1 promise, and level 4 does not exist.
        expect(synergyEffectAtLevel("Might", 1, 0)).toBe(synergyEffectAtLevel("Might", 1, 1));
        expect(synergyEffectAtLevel("Might", 1, 9)).toBe(synergyEffectAtLevel("Might", 1, 3));
    });

    it("counts the units left to the next level, and stops at the top", () => {
        expect(synergyNextLevel(0)).toEqual({ level: 1, unitsAway: 2 });
        expect(synergyNextLevel(1)).toEqual({ level: 1, unitsAway: 1 });
        expect(synergyNextLevel(2)).toEqual({ level: 2, unitsAway: 2 });
        expect(synergyNextLevel(5)).toEqual({ level: 3, unitsAway: 1 });
        expect(synergyNextLevel(6)).toBeNull();
        expect(synergyNextLevel(8)).toBeNull();
    });
});
