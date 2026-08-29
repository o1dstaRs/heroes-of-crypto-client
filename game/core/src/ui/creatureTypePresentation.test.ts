import { describe, expect, test } from "bun:test";

import { creatureTypePresentation } from "./creatureTypePresentation";

describe("creatureTypePresentation", () => {
    test("matches the draft icons for ranged walkers", () => {
        expect(creatureTypePresentation("Elf")).toEqual({ attack: "RANGE", movement: "WALK" });
    });

    test("matches the draft icons for melee flyers", () => {
        expect(creatureTypePresentation("Fairy")).toEqual({ attack: "MELEE", movement: "FLY" });
    });

    test("keeps the draft's caster-role override", () => {
        expect(creatureTypePresentation("Battle Mage")).toEqual({ attack: "MAGIC", movement: "WALK" });
    });

    test("returns no presentation for an unknown or missing unit", () => {
        expect(creatureTypePresentation("Unknown Creature")).toBeNull();
        expect(creatureTypePresentation()).toBeNull();
    });
});
