import { CreatureFactionsMap, CreatureVals, FactionVals } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import {
    CREATURE_PORTRAIT_BACKGROUND_SHADE_ALPHA,
    creaturePortraitBackgroundKey,
    creaturePortraitBackgroundOpacity,
    creaturePortraitBackgroundShadeAlpha,
} from "./creaturePortraitBackground";

describe("creaturePortraitBackgroundKey", () => {
    test("adds five percent to the previous eight-percent faction-background shade", () => {
        expect(CREATURE_PORTRAIT_BACKGROUND_SHADE_ALPHA).toBeCloseTo(0.126, 6);
    });

    test("adds another ten percent only to Life and Chaos backgrounds", () => {
        expect(creaturePortraitBackgroundOpacity(CreatureVals.PEASANT)).toBe(1);
        expect(creaturePortraitBackgroundOpacity(CreatureVals.ORC)).toBe(1);
        expect(creaturePortraitBackgroundOpacity(CreatureVals.WOLF)).toBe(1);
        expect(creaturePortraitBackgroundOpacity(CreatureVals.CENTAUR)).toBe(1);
        expect(creaturePortraitBackgroundShadeAlpha(CreatureVals.PEASANT)).toBeCloseTo(0.2134, 6);
        expect(creaturePortraitBackgroundShadeAlpha(CreatureVals.ORC)).toBeCloseTo(0.2134, 6);
        expect(creaturePortraitBackgroundShadeAlpha(CreatureVals.WOLF)).toBeCloseTo(0.126, 6);
        expect(creaturePortraitBackgroundShadeAlpha(CreatureVals.CENTAUR)).toBeCloseTo(0.126, 6);
    });

    test("uses the green X-ray leaf with corner glow for every drafted Nature level", () => {
        const background = "nature_portrait_bg_xray_leaf_corner_glow_v2_soft";
        expect(creaturePortraitBackgroundKey(CreatureVals.WOLF)).toBe(background);
        expect(creaturePortraitBackgroundKey(CreatureVals.DRYAD)).toBe(background);
        expect(creaturePortraitBackgroundKey(CreatureVals.ELF)).toBe(background);
        expect(creaturePortraitBackgroundKey(CreatureVals.TRENT)).toBe(background);
        expect(creaturePortraitBackgroundKey(CreatureVals.MANTIS)).toBe(background);
        expect(creaturePortraitBackgroundKey(CreatureVals.PEGASUS)).toBe(background);
        expect(creaturePortraitBackgroundKey(CreatureVals.ARACHNA_QUEEN)).toBe(background);
        expect(creaturePortraitBackgroundKey(CreatureVals.MAGIC_DRAGON)).toBe(background);
    });

    test("gives the summon-only Arachna Spider the late-creature background", () => {
        expect(creaturePortraitBackgroundKey(CreatureVals.ARACHNA_SPIDER)).toBe(
            "nature_portrait_bg_xray_leaf_corner_glow_v2_soft",
        );
    });

    test("uses the corner-fire Obsidian Fissure for every Chaos level", () => {
        const background = "chaos_portrait_bg_obsidian_fissure_corner_fire_v1";
        expect(creaturePortraitBackgroundKey(CreatureVals.ORC)).toBe(background);
        expect(creaturePortraitBackgroundKey(CreatureVals.MEDUSA)).toBe(background);
        expect(creaturePortraitBackgroundKey(CreatureVals.EFREET)).toBe(background);
        expect(creaturePortraitBackgroundKey(CreatureVals.BLACK_DRAGON)).toBe(background);
    });

    test("uses four-corner Golden Dawn haze for every Life creature", () => {
        const lifeCreatureIds = Object.entries(CreatureFactionsMap)
            .filter(([, faction]) => faction === FactionVals.LIFE)
            .map(([creatureId]) => Number(creatureId));

        expect(lifeCreatureIds.length).toBeGreaterThan(0);
        for (const creatureId of lifeCreatureIds) {
            expect(creaturePortraitBackgroundKey(creatureId)).toBe("life_portrait_bg_golden_dawn_four_corner_haze_v1");
        }
    });

    test("uses blood claw trails with strong red corners for every Might level", () => {
        const mightCreatureIds = Object.entries(CreatureFactionsMap)
            .filter(([, faction]) => faction === FactionVals.MIGHT)
            .map(([creatureId]) => Number(creatureId));

        expect(mightCreatureIds.length).toBeGreaterThan(0);
        for (const creatureId of mightCreatureIds) {
            expect(creaturePortraitBackgroundKey(creatureId)).toBe(
                "might_portrait_bg_blood_claw_strong_red_corners_v1",
            );
        }
    });
});
