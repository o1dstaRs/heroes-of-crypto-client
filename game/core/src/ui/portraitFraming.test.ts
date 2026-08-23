import { CreatureVals, getCreaturesByLevel } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import {
    PICK_PORTRAIT_FRAMING,
    PORTRAIT_FRAMING_CHECKPOINT_X,
    PORTRAIT_FRAMING_STORAGE_KEY,
    PORTRAIT_OFFSET_X_MAX,
    PORTRAIT_OFFSET_X_MIN,
    PORTRAIT_OFFSET_Y_MAX,
    PORTRAIT_OFFSET_Y_MIN,
    PORTRAIT_SCALE_MAX,
    PORTRAIT_SCALE_MIN,
    normalizePortraitFraming,
} from "./portraitFraming";
import { resolveCreaturePortraitArtPlacement, resolveCreaturePortraitVisual } from "./creaturePortraitVisual";
import { fullBodyCreatureImage, UNIT_ID_TO_IMAGE } from "./unit_ui_constants";

describe("committed creature portrait framing", () => {
    test("covers every active draft creature", () => {
        const activeCreatureIds = [1, 2, 3, 4]
            .flatMap((level) => [...getCreaturesByLevel(level)])
            .sort((a, b) => a - b);
        const configuredCreatureIds = Object.keys(PICK_PORTRAIT_FRAMING)
            .map(Number)
            .sort((a, b) => a - b);

        expect(configuredCreatureIds).toEqual(activeCreatureIds);
    });

    test("keeps the reviewed mixed portrait and full-body sources", () => {
        expect(PICK_PORTRAIT_FRAMING[1]).toEqual({
            source: "full",
            fit: "cover",
            scale: 2.78,
            offsetX: -4,
            offsetY: 84,
            background: "none",
        });
        expect(PICK_PORTRAIT_FRAMING[2]).toEqual({
            source: "portrait",
            fit: "cover",
            scale: 3.01,
            offsetX: 13,
            offsetY: 100,
            background: "none",
        });
        expect(PICK_PORTRAIT_FRAMING[57]).toEqual({
            source: "full",
            fit: "contain",
            scale: 2.95,
            offsetX: -83,
            offsetY: -10,
            background: "none",
        });
    });

    test("saves the approved baseline as portrait checkpoint X", () => {
        expect(PICK_PORTRAIT_FRAMING).toEqual(PORTRAIT_FRAMING_CHECKPOINT_X);
        expect(PORTRAIT_FRAMING_STORAGE_KEY).toBe("hoc-dev-portrait-framing-v3");
        expect(PORTRAIT_FRAMING_CHECKPOINT_X[CreatureVals.WOLF_RIDER]).toEqual({
            source: "full",
            fit: "contain",
            scale: 3.38,
            offsetX: -32,
            offsetY: 93,
            background: "none",
        });

        const approved = {
            8: { source: "full", fit: "contain", scale: 3.82, offsetX: 0, offsetY: 80, background: "none" },
            9: { source: "full", fit: "contain", scale: 3.35, offsetX: -100, offsetY: 3, background: "none" },
            10: { source: "full", fit: "contain", scale: 2.84, offsetX: -71, offsetY: 5, background: "none" },
            15: { source: "portrait", fit: "cover", scale: 2.58, offsetX: 17, offsetY: 30, background: "none" },
            16: { source: "portrait", fit: "contain", scale: 2.53, offsetX: -50, offsetY: 22, background: "none" },
            19: { source: "full", fit: "contain", scale: 3.11, offsetX: -73, offsetY: 49, background: "none" },
            20: { source: "full", fit: "contain", scale: 3.35, offsetX: -91, offsetY: 49, background: "none" },
            25: { source: "full", fit: "contain", scale: 2.87, offsetX: -93, offsetY: 23, background: "none" },
            27: { source: "full", fit: "contain", scale: 3.64, offsetX: -60, offsetY: 47, background: "none" },
            35: { source: "portrait", fit: "cover", scale: 2.73, offsetX: 50, offsetY: -60, background: "none" },
            39: { source: "full", fit: "contain", scale: 2.16, offsetX: -44, offsetY: -14, background: "none" },
            40: { source: "full", fit: "cover", scale: 3.81, offsetX: -15, offsetY: 100, background: "none" },
            41: { source: "full", fit: "contain", scale: 3.5, offsetX: -5, offsetY: 73, background: "none" },
            43: { source: "full", fit: "contain", scale: 3.1, offsetX: -96, offsetY: -3, background: "none" },
            44: { source: "full", fit: "contain", scale: 3.93, offsetX: -58, offsetY: 4, background: "none" },
            51: { source: "portrait", fit: "contain", scale: 2.08, offsetX: -48, offsetY: -27, background: "none" },
            53: { source: "portrait", fit: "cover", scale: 2.89, offsetX: -72, offsetY: 16, background: "none" },
            57: { source: "full", fit: "contain", scale: 2.95, offsetX: -83, offsetY: -10, background: "none" },
        } as const;

        for (const [creatureId, framing] of Object.entries(approved)) {
            expect(PORTRAIT_FRAMING_CHECKPOINT_X[Number(creatureId)]).toEqual(framing);
        }
    });

    test("keeps dedicated left-sidebar art independent from the pick-card crop", () => {
        const wolfRiderFraming = PICK_PORTRAIT_FRAMING[CreatureVals.WOLF_RIDER]!;

        expect(
            resolveCreaturePortraitArtPlacement(wolfRiderFraming, {
                independentSource: true,
                scale: 0.86,
                offsetX: 4,
                offsetY: -14,
            }),
        ).toEqual({ scale: 0.86, offsetX: 4, offsetY: -14 });
        expect(resolveCreaturePortraitArtPlacement(wolfRiderFraming)).toEqual({
            scale: 3.38,
            offsetX: -32,
            offsetY: 93,
        });
    });

    test("keeps the restored close L3 framing and original full-body sources", () => {
        const expectedFraming = {
            [CreatureVals.GOBLIN_KNIGHT]: {
                source: "full",
                fit: "contain",
                scale: 3.72,
                offsetX: 14,
                offsetY: 98,
                background: "none",
            },
            [CreatureVals.EFREET]: {
                source: "full",
                fit: "contain",
                scale: 3.82,
                offsetX: 0,
                offsetY: 80,
                background: "none",
            },
            [CreatureVals.CYCLOPS]: {
                source: "full",
                fit: "contain",
                scale: 3.3,
                offsetX: -8,
                offsetY: 90,
                background: "none",
            },
            [CreatureVals.OGRE_MAGE]: {
                source: "full",
                fit: "contain",
                scale: 3.41,
                offsetX: -14,
                offsetY: 79,
                background: "none",
            },
            [CreatureVals.MANTIS]: {
                source: "full",
                fit: "contain",
                scale: 3.64,
                offsetX: -60,
                offsetY: 47,
                background: "none",
            },
            [CreatureVals.UNICORN]: {
                source: "full",
                fit: "contain",
                scale: 2.53,
                offsetX: -56,
                offsetY: 30,
                background: "none",
            },
            [CreatureVals.PEGASUS]: {
                source: "full",
                fit: "cover",
                scale: 2.4,
                offsetX: -47,
                offsetY: 42,
                background: "none",
            },
            [CreatureVals.GRIFFIN]: {
                source: "full",
                fit: "contain",
                scale: 2.89,
                offsetX: -65,
                offsetY: 28,
                background: "none",
            },
            [CreatureVals.CRUSADER]: {
                source: "full",
                fit: "contain",
                scale: 4,
                offsetX: 1,
                offsetY: 73,
                background: "none",
            },
            [CreatureVals.ZENA]: {
                source: "full",
                fit: "contain",
                scale: 3.62,
                offsetX: 0,
                offsetY: 120,
                background: "none",
            },
            [CreatureVals.MONK]: {
                source: "full",
                fit: "cover",
                scale: 3.2,
                offsetX: -7,
                offsetY: 100,
                background: "none",
            },
            [CreatureVals.NIGHTMARE]: {
                source: "full",
                fit: "contain",
                scale: 2.79,
                offsetX: -62,
                offsetY: 33,
                background: "none",
            },
        } as const;

        for (const [creatureId, framing] of Object.entries(expectedFraming)) {
            expect(PICK_PORTRAIT_FRAMING[Number(creatureId)]).toEqual(framing);
        }
        expect(fullBodyCreatureImage(CreatureVals.GRIFFIN)).toContain("griffin_portrait_full.webp");
        expect(fullBodyCreatureImage(CreatureVals.GRIFFIN)).not.toContain("_v2");
    });

    test("allows portraits to move twice as far left while retaining the existing right limit", () => {
        expect(normalizePortraitFraming({ offsetX: -75 }).offsetX).toBe(-75);
        expect(normalizePortraitFraming({ offsetX: -150 }).offsetX).toBe(PORTRAIT_OFFSET_X_MIN);
        expect(normalizePortraitFraming({ offsetX: 75 }).offsetX).toBe(PORTRAIT_OFFSET_X_MAX);
    });

    test("allows portraits to move up and down by two full frames", () => {
        expect(normalizePortraitFraming({ offsetY: -150 }).offsetY).toBe(-150);
        expect(normalizePortraitFraming({ offsetY: -250 }).offsetY).toBe(PORTRAIT_OFFSET_Y_MIN);
        expect(normalizePortraitFraming({ offsetY: 250 }).offsetY).toBe(PORTRAIT_OFFSET_Y_MAX);
    });

    test("allows portraits to zoom up to four times", () => {
        expect(normalizePortraitFraming({ scale: 3 }).scale).toBe(3);
        expect(normalizePortraitFraming({ scale: 8 }).scale).toBe(PORTRAIT_SCALE_MAX);
        expect(normalizePortraitFraming({ scale: 0.1 }).scale).toBe(PORTRAIT_SCALE_MIN);
    });

    test("uses every creature's reviewed source and framing", () => {
        for (const creatureId of [1, 2, 3, 4].flatMap((level) => [...getCreaturesByLevel(level)])) {
            const visual = resolveCreaturePortraitVisual(creatureId);
            const framing = PICK_PORTRAIT_FRAMING[creatureId];
            expect(visual?.framing).toEqual(framing);
            expect(visual?.source).toBe(
                framing?.source === "full"
                    ? (fullBodyCreatureImage(creatureId) ?? UNIT_ID_TO_IMAGE[creatureId])
                    : UNIT_ID_TO_IMAGE[creatureId],
            );
        }
    });

    test("keeps every L2 pick portrait on the approved pre-battle-art snapshot", () => {
        const expectedLegacySources = [
            [CreatureVals.TROLL, "troll"],
            [CreatureVals.MEDUSA, "medusa"],
            [CreatureVals.BEHOLDER, "beholder"],
            [CreatureVals.HARPY, "harpy"],
            [CreatureVals.NOMAD, "nomad"],
            [CreatureVals.HYENA, "hyena"],
            [CreatureVals.ELF, "elf"],
            [CreatureVals.WHITE_TIGER, "white_tiger"],
            [CreatureVals.SATYR, "satyr"],
            [CreatureVals.VALKYRIE, "valkyrie"],
            [CreatureVals.PIKEMAN, "pikeman"],
            [CreatureVals.HEALER, "healer"],
            [CreatureVals.MANTICORE, "manticore"],
            [CreatureVals.BATTLE_MAGE, "battle_mage"],
            [CreatureVals.WYVERN, "wyvern"],
            [CreatureVals.TRENT, "trent"],
        ] as const;

        expect([...getCreaturesByLevel(2)].sort((a, b) => a - b)).toEqual(
            expectedLegacySources.map(([creatureId]) => creatureId).sort((a, b) => a - b),
        );
        for (const [creatureId, slug] of expectedLegacySources) {
            expect(UNIT_ID_TO_IMAGE[creatureId]).toContain(`pick_l2_legacy_${slug}_512.webp`);
        }
    });
});
