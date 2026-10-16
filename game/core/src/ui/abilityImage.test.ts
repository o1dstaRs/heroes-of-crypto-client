import { describe, expect, test } from "bun:test";

import abilitiesConfig from "@heroesofcrypto/common/src/configuration/abilities.json";

import imageKeys from "../generated/image_keys.json";
import { ABILITY_IMAGE_ALIASES, abilityImageKey, resolveAbilityImage } from "./abilityImage";

// One supplied art set, on purpose: the generated map answers EVERY key on CI
// (scripts/generate_ci_stubs.js), so an assertion about art that is missing would pass there and fail
// only on a real machine. The completeness test below reads the COMMITTED key list instead, which is the
// one record of the real art that CI also has.
const ART_SET: Record<string, string> = {
    terrifying_gaze_256: "terrifying-gaze.webp",
    warding_mane_aura_256: "warding-mane-aura.webp",
};
const artLookup = (key: string): string | undefined => ART_SET[key];

describe("ability icons", () => {
    test("the key is the ability's name, lowercased with underscores", () => {
        expect(abilityImageKey("Terrifying Gaze")).toBe("terrifying_gaze_256");
        expect(abilityImageKey("Warding Mane Blessing")).toBe("warding_mane_blessing_256");
    });

    test("the conventional key wins whenever the art follows the name", () => {
        expect(resolveAbilityImage("Terrifying Gaze", artLookup)).toBe(ART_SET.terrifying_gaze_256);
    });

    // The aura family became blessings: the ability was renamed, the art kept the old file name, and the
    // pick card drew a broken-image glyph beside the creature's other icons (owner report 2026-09-19).
    test("a renamed ability falls back to the art still carrying its old name", () => {
        expect(ART_SET.warding_mane_blessing_256).toBeUndefined();
        expect(resolveAbilityImage("Warding Mane Blessing", artLookup)).toBe(ART_SET.warding_mane_aura_256);
    });

    test("an ability with no art at all resolves to nothing, so the caller can draw its own fallback", () => {
        expect(resolveAbilityImage("Angelic Host Blessing", artLookup)).toBeUndefined();
        expect(resolveAbilityImage("Not An Ability", artLookup)).toBeUndefined();
    });

    // The gap this closes: nothing tied the ability list to the art list, so renaming an ability silently
    // took its icon away. Every ability the game can show must resolve against the real published art.
    test("every ability in the config resolves to published art", () => {
        const published = new Set(imageKeys as string[]);
        const abilityNames = Object.entries(abilitiesConfig as Record<string, unknown>)
            .filter(([, value]) => !!value && typeof value === "object" && "name" in (value as object))
            .map(([key]) => key);

        expect(abilityNames.length).toBeGreaterThan(50);
        const unresolved = abilityNames.filter(
            (name) => !resolveAbilityImage(name, (key) => (published.has(key) ? key : undefined)),
        );
        expect(unresolved).toEqual([]);
    });

    test("every alias points at art that exists, and is needed", () => {
        const published = new Set(imageKeys as string[]);
        for (const [from, to] of Object.entries(ABILITY_IMAGE_ALIASES)) {
            expect(published.has(to)).toBe(true);
            // An alias whose own key has since been published is dead weight — delete it with the rename.
            expect(published.has(from)).toBe(false);
        }
    });
});
