import { describe, expect, test } from "bun:test";

import { spellIconTextureKey } from "./spellIcons";

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
});
