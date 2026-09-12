import { describe, expect, test } from "bun:test";

import {
    BATTLEFIELD_SHADOW_TUNING_BY_CREATURE,
    DEFAULT_BATTLEFIELD_SHADOW_TUNING,
    normalizeBattlefieldShadowTuning,
    readStoredBattlefieldShadowTuning,
    resetStoredBattlefieldShadowTuning,
    resolveBattlefieldShadowTuning,
    resolveBattlefieldShadowTuningForBuild,
    setBattlefieldShadowEditorActive,
    writeStoredBattlefieldShadowTuning,
} from "./battlefieldShadowTuning";

describe("battlefield shadow tuning", () => {
    test("uses the approved profile when no editor draft exists", () => {
        setBattlefieldShadowEditorActive(false);

        expect(resolveBattlefieldShadowTuning("Centaur")).toEqual(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE.Centaur);
        expect(resolveBattlefieldShadowTuning("Gargantuan")).toEqual(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE.Gargantuan);
    });

    test("keeps the editor's upper-row profile active in ordinary development gameplay", () => {
        const draft = normalizeBattlefieldShadowTuning({
            top: {
                lengthScale: 0.81,
                widthScale: 1.14,
                alpha: 0.57,
                offsetXCells: -0.12,
                offsetYCells: 0.44,
                rotationDegrees: -9,
            },
            contactAlpha: 0.19,
        });

        writeStoredBattlefieldShadowTuning("Centaur", draft);
        setBattlefieldShadowEditorActive(false);

        expect(resolveBattlefieldShadowTuningForBuild("Centaur", false)).toEqual(draft);

        resetStoredBattlefieldShadowTuning("Centaur");
    });

    test("keeps creatures outside the finalized editor roster on the shared fallback", () => {
        for (const name of ["Arachna Spider", "Unknown Creature"]) {
            expect(readStoredBattlefieldShadowTuning(name)).toEqual(DEFAULT_BATTLEFIELD_SHADOW_TUNING);
        }
    });

    test("commits the complete finalized editor roster exactly", () => {
        const expected = {
            Orc: [0.883, 0.036, 0.23],
            Scavenger: [0.883, -0.02, 0.01],
            Troglodyte: [0.93, 0.02, 0.18],
            Centaur: [0.95, -0.01, 0],
            Berserker: [0.883, 0.036, 0.07],
            "Wolf Rider": [1.01, 0.07, 0.85],
            Wolf: [0.883, 0.036, 0.34],
            Fairy: [0.883, 0.036, 0.11],
            Leprechaun: [0.883, 0.036, 0.13],
            Peasant: [0.883, 0.036, 0.24],
            Squire: [0.883, 0.036, 0.13],
            Arbalester: [0.883, -0.01, 0.08],
            Mermaid: [0.883, 0.036, 0.17],
            Dryad: [0.883, -0.01, 0.15],
            Blacksmith: [0.883, 0.036, 0.23],
            "Wandering Mage": [0.97, -0.01, 0.01],
            Troll: [0.883, 0.036, 0.14],
            Medusa: [0.883, 0, 0.18],
            Beholder: [0.883, 0.036, 0.25],
            Harpy: [0.883, 0.036, 0.34],
            Nomad: [0.883, 0, 0.07],
            Hyena: [0.883, 0.01, 0.18],
            Elf: [0.883, 0.036, 0.11],
            "White Tiger": [0.883, -0.01, 0.1],
            Satyr: [0.883, 0.036, 0.18],
            Valkyrie: [0.93, 0.01, 0.07],
            Pikeman: [0.94, 0, 0.1],
            Healer: [0.883, 0.01, 0.11],
            Wyvern: [0.883, 0.02, 0.18],
            Trent: [0.883, -0.02, 0.15],
            Manticore: [0.883, 0.06, 0.21],
            "Battle Mage": [0.883, 0.03, 0.21],
            "Goblin Knight": [0.883, 0.036, 0.26],
            Nightmare: [0.883, 0.06, 0.13],
            Efreet: [0.883, 0.036, 0.272],
            "Ogre Mage": [0.883, 0.036, 0.23],
            Unicorn: [0.92, 0, 0.1],
            Pegasus: [0.92, 0.05, 0.2],
            Griffin: [0.883, 0.036, 0.27],
            Crusader: [0.883, 0.02, 0.23],
            Zena: [0.883, 0.036, 0.25],
            Monk: [0.883, 0.036, 0.22],
            Thunderbird: [0.883, 0.07, 0.25],
            "Tsar Cannon": [0.883, 0.01, 0.32],
            Angel: [0.883, 0.036, 0.2],
            Champion: [0.883, 0.11, 0.47],
        } as const;

        for (const [name, [widthScale, offsetXCells, offsetYCells]] of Object.entries(expected)) {
            const profile = BATTLEFIELD_SHADOW_TUNING_BY_CREATURE[name];
            expect(profile?.top).toEqual({
                lengthScale: 0.678,
                widthScale,
                alpha: 0.45,
                offsetXCells,
                offsetYCells,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            });
            expect(profile?.bottom).toEqual({ ...profile?.top, lengthScale: 0.6102 });
        }
        expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE["Wolf Rider"]?.bottomAlphaOverride).toBe(0.45);
    });

    test("keeps the approved Wolf Rider profile from the editor screenshot", () => {
        expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE["Wolf Rider"]).toEqual({
            bottom: {
                lengthScale: 0.6102,
                widthScale: 1.01,
                alpha: 0.45,
                offsetXCells: 0.07,
                offsetYCells: 0.85,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            top: {
                lengthScale: 0.678,
                widthScale: 1.01,
                alpha: 0.45,
                offsetXCells: 0.07,
                offsetYCells: 0.85,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            bottomAlphaOverride: 0.45,
            contactAlpha: 0.15,
            contactShadowVisible: true,
        });
    });

    test("keeps the approved Black Dragon override and its automatic lower-row reduction", () => {
        expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE["Black Dragon"]).toEqual({
            bottom: {
                lengthScale: 0.7542,
                widthScale: 0.947,
                alpha: 0.45,
                offsetXCells: 0.08,
                offsetYCells: 0.67,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            top: {
                lengthScale: 0.838,
                widthScale: 0.947,
                alpha: 0.45,
                offsetXCells: 0.08,
                offsetYCells: 0.67,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            contactAlpha: 0.15,
            contactShadowVisible: true,
        });
    });

    test("keeps the approved Frenzied Boar override and its automatic lower-row reduction", () => {
        expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE["Frenzied Boar"]).toEqual({
            bottom: {
                lengthScale: 0.7542,
                widthScale: 0.949,
                alpha: 0.45,
                offsetXCells: 0.043,
                offsetYCells: 0.62,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            top: {
                lengthScale: 0.838,
                widthScale: 0.949,
                alpha: 0.45,
                offsetXCells: 0.043,
                offsetYCells: 0.62,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            contactAlpha: 0.15,
            contactShadowVisible: true,
        });
    });

    test("keeps the approved Cyclops shadow connected to its wide stance", () => {
        expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE.Cyclops).toEqual({
            bottom: {
                lengthScale: 0.648,
                widthScale: 0.938,
                alpha: 0.45,
                offsetXCells: 0.05,
                offsetYCells: 0.38,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            top: {
                lengthScale: 0.72,
                widthScale: 0.938,
                alpha: 0.45,
                offsetXCells: 0.05,
                offsetYCells: 0.38,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            contactAlpha: 0.15,
            contactShadowVisible: true,
        });
    });

    test("keeps the recovered Arachna Queen profile under the spider figure", () => {
        const expected = {
            bottom: {
                lengthScale: 0.7335,
                widthScale: 1.021,
                alpha: 0.45,
                offsetXCells: 0.183,
                offsetYCells: 1.606,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            top: {
                lengthScale: 0.815,
                widthScale: 1.021,
                alpha: 0.45,
                offsetXCells: 0.183,
                offsetYCells: 1.606,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            contactAlpha: 0.15,
            contactShadowVisible: true,
        };

        expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE["Arachna Queen"]).toEqual(expected);
    });

    test("keeps every other Chrome-editor individual profile", () => {
        const expectedTopRows = {
            Mantis: [0.052, 0.51, 0.814, 0.904],
            Hydra: [0.06, 0.55, 0.759, 0.971],
            Behemoth: [0.097, 1.13, 1.042, 0.994],
            Gargantuan: [0.038, 0.56, 0.776, 0.939],
            Abomination: [0.02, 0.6, 0.825, 0.915],
        } as const;

        for (const [name, [offsetXCells, offsetYCells, lengthScale, widthScale]] of Object.entries(expectedTopRows)) {
            expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE[name]?.top).toEqual({
                lengthScale,
                widthScale,
                alpha: 0.45,
                offsetXCells,
                offsetYCells,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            });
            expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE[name]?.contactAlpha).toBe(0.15);
            expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE[name]?.contactShadowVisible).toBe(true);
        }
    });

    test("keeps the approved Magic Dragon upper-row profile and derives the lower row at 90% length", () => {
        expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE["Magic Dragon"]).toEqual({
            bottom: {
                lengthScale: 0.7812,
                widthScale: 0.91,
                alpha: 0.45,
                offsetXCells: 0.089,
                offsetYCells: 0.65,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            top: {
                lengthScale: 0.868,
                widthScale: 0.91,
                alpha: 0.45,
                offsetXCells: 0.089,
                offsetYCells: 0.65,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            contactAlpha: 0.15,
            contactShadowVisible: true,
        });
    });

    test("keeps every non-Orc approved silhouette at 0.45 opacity on both extreme rows", () => {
        for (const [name, tuning] of Object.entries(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE)) {
            if (name === "Orc") continue;
            expect(tuning.top.alpha).toBe(0.45);
            expect(tuning.bottom.alpha).toBe(0.45);
        }
    });

    test("allows twice the previous vertical editing range", () => {
        expect(normalizeBattlefieldShadowTuning({ top: { offsetYCells: 1.75 } }).top.offsetYCells).toBe(1.75);
        expect(normalizeBattlefieldShadowTuning({ top: { offsetYCells: -1.75 } }).top.offsetYCells).toBe(-1.75);
        expect(normalizeBattlefieldShadowTuning({ top: { offsetYCells: 3 } }).top.offsetYCells).toBe(2);
        expect(normalizeBattlefieldShadowTuning({ top: { offsetYCells: -3 } }).top.offsetYCells).toBe(-2);
    });

    test("shortens only the far edge by 10% at the lowest row", () => {
        const tuning = normalizeBattlefieldShadowTuning({
            top: BATTLEFIELD_SHADOW_TUNING_BY_CREATURE.Orc.top,
            contactAlpha: 0.15,
        });

        expect(tuning.bottom).toEqual({
            lengthScale: 0.6102,
            widthScale: 0.883,
            alpha: 0.45,
            offsetXCells: 0.036,
            offsetYCells: 0.23,
            rotationDegrees: -14,
            segmentLengthMultipliers: [1, 1, 1, 1],
        });
    });

    test("stores four independently stretched frame quarters and carries them to lower rows", () => {
        const tuning = normalizeBattlefieldShadowTuning({
            top: { segmentLengthMultipliers: [0.1, 1.25, 2, 4] },
        });

        expect(tuning.top.segmentLengthMultipliers).toEqual([0.25, 1.25, 2, 3]);
        expect(tuning.bottom.segmentLengthMultipliers).toEqual([0.25, 1.25, 2, 3]);
    });

    test("keeps an explicit lower-row alpha when an approved creature needs one", () => {
        const tuning = normalizeBattlefieldShadowTuning({
            top: { alpha: 0.45 },
            bottomAlphaOverride: 0.45,
        });

        expect(tuning.top.alpha).toBe(0.45);
        expect(tuning.bottom.alpha).toBe(0.45);
        expect(tuning.bottomAlphaOverride).toBe(0.45);
    });
});
