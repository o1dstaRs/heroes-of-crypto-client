import { describe, expect, test } from "bun:test";

import {
    BATTLEFIELD_SHADOW_TUNING_BY_CREATURE,
    DEFAULT_BATTLEFIELD_SHADOW_TUNING,
    normalizeBattlefieldShadowTuning,
    readStoredBattlefieldShadowTuning,
} from "./battlefieldShadowTuning";

describe("battlefield shadow tuning", () => {
    test("applies the final Angel profile to every explicit level-one entry", () => {
        const levelOneNames = [
            "Orc",
            "Scavenger",
            "Troglodyte",
            "Centaur",
            "Berserker",
            "Wolf Rider",
            "Wolf",
            "Fairy",
            "Leprechaun",
            "Peasant",
            "Squire",
            "Arbalester",
            "Mermaid",
            "Dryad",
            "Blacksmith",
            "Wandering Mage",
        ];

        for (const name of levelOneNames) {
            expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE[name]).toBe(DEFAULT_BATTLEFIELD_SHADOW_TUNING);
            expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE[name]?.top.lengthScale).toBe(0.678);
            expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE[name]?.top.widthScale).toBe(0.883);
            expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE[name]?.top.offsetYCells).toBe(0.272);
            expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE[name]?.contactShadowVisible).toBe(true);
        }
        for (const name of ["Harpy", "Elf", "Valkyrie", "Angel"]) {
            expect(readStoredBattlefieldShadowTuning(name)).toEqual(DEFAULT_BATTLEFIELD_SHADOW_TUNING);
        }
    });

    test("keeps the approved Black Dragon override and its automatic lower-row reduction", () => {
        expect(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE["Black Dragon"]).toEqual({
            bottom: {
                lengthScale: 0.7123,
                widthScale: 0.858907,
                alpha: 0.332143,
                offsetXCells: 0.035,
                offsetYCells: 0.594,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            top: {
                lengthScale: 0.838,
                widthScale: 0.947,
                alpha: 0.45,
                offsetXCells: 0.035,
                offsetYCells: 0.594,
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
                lengthScale: 0.7123,
                widthScale: 0.860721,
                alpha: 0.332143,
                offsetXCells: 0.043,
                offsetYCells: 0.731,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            top: {
                lengthScale: 0.838,
                widthScale: 0.949,
                alpha: 0.45,
                offsetXCells: 0.043,
                offsetYCells: 0.731,
                rotationDegrees: -14,
                segmentLengthMultipliers: [1, 1, 1, 1],
            },
            contactAlpha: 0.15,
            contactShadowVisible: true,
        });
    });

    test("allows twice the previous vertical editing range", () => {
        expect(normalizeBattlefieldShadowTuning({ top: { offsetYCells: 1.75 } }).top.offsetYCells).toBe(1.75);
        expect(normalizeBattlefieldShadowTuning({ top: { offsetYCells: -1.75 } }).top.offsetYCells).toBe(-1.75);
        expect(normalizeBattlefieldShadowTuning({ top: { offsetYCells: 3 } }).top.offsetYCells).toBe(2);
        expect(normalizeBattlefieldShadowTuning({ top: { offsetYCells: -3 } }).top.offsetYCells).toBe(-2);
    });

    test("derives the lower row automatically from the authored upper row", () => {
        const tuning = normalizeBattlefieldShadowTuning({
            top: BATTLEFIELD_SHADOW_TUNING_BY_CREATURE.Orc.top,
            contactAlpha: 0.15,
        });

        expect(tuning.bottom).toEqual({
            lengthScale: 0.5763,
            widthScale: 0.80086,
            alpha: 0.332143,
            offsetXCells: 0.036,
            offsetYCells: 0.272,
            rotationDegrees: -14,
            segmentLengthMultipliers: [1, 1, 1, 1],
        });
    });
});
