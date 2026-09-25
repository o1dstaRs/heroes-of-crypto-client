import { describe, expect, test } from "bun:test";

import { spellIconTextureKey, SPELLS_AWAITING_OWN_ICON } from "./spellIcons";

describe("spell book icons", () => {
    test("a spell with no entry is named after itself", () => {
        expect(spellIconTextureKey("Ring of Fire")).toBe("ring_of_fire_256");
        expect(spellIconTextureKey("Fire Wall")).toBe("fire_wall_256");
        expect(spellIconTextureKey("Smoke")).toBe("smoke_256");
    });

    test("the two spells with generated art keep them", () => {
        expect(spellIconTextureKey("Fire Strike")).toBe("fire_strike_chaos_256_v1");
        expect(spellIconTextureKey("Meteorite")).toBe("meteorite_chaos_256_v1");
    });

    // A spell whose icon cannot be resolved does not draw a blank card — it vanishes from the book without
    // a word. So a spell shipping ahead of its art must stand in with something real, or it is unplayable.
    test("a spell awaiting its own art resolves to a real texture, never its unpublished name", () => {
        for (const spellName of SPELLS_AWAITING_OWN_ICON) {
            const key = spellIconTextureKey(spellName);
            expect(key).not.toBe(`${spellName.toLowerCase()}_256`);
            expect(key.length).toBeGreaterThan(0);
        }
    });

    // Fireball's own art landed the day it shipped, so it resolves by name like any other spell and no
    // longer borrows Fire Strike's icon.
    test("Fireball uses its own published icon", () => {
        expect(spellIconTextureKey("Fireball")).toBe("fireball_256");
        expect(SPELLS_AWAITING_OWN_ICON).toHaveLength(0);
    });
});
