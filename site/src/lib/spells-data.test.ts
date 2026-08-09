/*
 * -----------------------------------------------------------------------------
 * The codex derives its spells from the game's own spells.json, but a few links back to the game data
 * are curated by hand here — and a hand-kept list drifts the moment a new spell lands. These tests pin
 * the curated lists against the data they claim to mirror.
 *
 * Regression guard: Vine Throw shipped as a castable ability and was never added to abilityCastSpells,
 * so the codex filed Trent's throw under "effect" — a passive that just happens to you — with no link
 * back to the ability that casts it.
 * -----------------------------------------------------------------------------
 */

import abilitiesJson from "@heroesofcrypto/common/src/configuration/abilities.json";
import spellsJson from "@heroesofcrypto/common/src/configuration/spells.json";
import { describe, expect, test } from "bun:test";

import { spells } from "./spells-data";

const castableAbilityNames = Object.values(abilitiesJson as Record<string, { name: string; can_be_cast?: boolean }>)
    .filter((ability) => ability.can_be_cast)
    .map((ability) => ability.name)
    .sort();

describe("spell codex", () => {
    test("labels offensive magic as damage rather than debuffs", () => {
        for (const name of [
            "Fire Strike",
            "Fire Wall",
            "Lightning Strike",
            "Meteorite",
            "Meteor Shower",
            "Ring of Fire",
        ]) {
            const spell = spells.find((entry) => entry.name === name);
            expect(spell, `${name} should be present`).toBeDefined();
            expect(spell?.polarity, `${name} should be damage`).toBe("damage");
        }
    });

    test("files Empower under Order while retaining its Nightmare caster", () => {
        const empower = spells.find((entry) => entry.name === "Empower");

        expect(empower?.book).toBe("Order");
        expect(empower?.casters.map((caster) => caster.name)).toContain("Nightmare");
    });

    test("omits every artifact effect, including retired Holy Cross", () => {
        const rawArtifactNames = Object.values(spellsJson.System)
            .filter((entry) => entry.desc.some((line) => /^Artifact\./i.test(line.trim())))
            .map((entry) => entry.name);

        expect(spells.find((entry) => entry.name === "Holy Cross")).toBeUndefined();
        expect(spells.filter((entry) => rawArtifactNames.includes(entry.name))).toEqual([]);
    });

    test("files every castable ability as an ability-cast spell, not a passive effect", () => {
        for (const name of castableAbilityNames) {
            const spell = spells.find((entry) => entry.name === name);
            // Every can_be_cast ability has a matching System spell it applies; if that ever stops being
            // true, this is the place to learn it rather than a silently missing codex page.
            expect(spell, `${name} is castable but has no spell entry`).toBeDefined();
            expect(spell?.kind, `${name} should be listed as ability-cast`).toBe("ability");
        }
    });

    test("links every ability-cast spell back to the ability that casts it", () => {
        for (const spell of spells.filter((entry) => entry.kind === "ability")) {
            // These have no spellbook carrier, so appliedBy is the only route from the spell page to the
            // ability page. An empty list renders as an orphan.
            expect(spell.appliedBy.length, `${spell.name} has no ability link`).toBeGreaterThan(0);
        }
    });
});
