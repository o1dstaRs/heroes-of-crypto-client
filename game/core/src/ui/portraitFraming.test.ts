import { CreatureVals, getCreaturesByLevel } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import {
    DEFAULT_PORTRAIT_FRAMING,
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
import { fullBodyCreatureImage, UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "./unit_ui_constants";

describe("committed creature portrait framing", () => {
    test("uses neutral framing for the pre-cropped test-server portraits", () => {
        expect(PICK_PORTRAIT_FRAMING).toEqual({});

        for (const creatureId of [1, 2, 3, 4].flatMap((level) => [...getCreaturesByLevel(level)])) {
            expect(resolveCreaturePortraitVisual(creatureId)?.framing).toEqual(DEFAULT_PORTRAIT_FRAMING);
        }
    });

    test("keeps the legacy editor checkpoint available but inactive", () => {
        expect(PICK_PORTRAIT_FRAMING).not.toBe(PORTRAIT_FRAMING_CHECKPOINT_X);
        expect(PORTRAIT_FRAMING_STORAGE_KEY).toBe("hoc-dev-pick-sandbox-portrait-framing-v1");
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
        expect(
            resolveCreaturePortraitArtPlacement(DEFAULT_PORTRAIT_FRAMING, {
                independentSource: true,
                scale: 0.86,
                offsetX: 4,
                offsetY: -14,
            }),
        ).toEqual({ scale: 0.86, offsetX: 4, offsetY: -14 });
        expect(resolveCreaturePortraitArtPlacement(DEFAULT_PORTRAIT_FRAMING)).toEqual({
            scale: 1,
            offsetX: 0,
            offsetY: 0,
        });
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

    test("uses every creature's pre-cropped source without another crop", () => {
        for (const creatureId of [1, 2, 3, 4].flatMap((level) => [...getCreaturesByLevel(level)])) {
            const visual = resolveCreaturePortraitVisual(creatureId);
            expect(visual?.framing).toEqual(DEFAULT_PORTRAIT_FRAMING);
            expect(visual?.source).toBe(UNIT_ID_TO_IMAGE[creatureId]);
        }
    });

    test("uses the complete test-server pick/sandbox portrait set", () => {
        for (const [creatureId, name] of Object.entries(UNIT_ID_TO_NAME)) {
            if (Number(creatureId) === CreatureVals.NO_CREATURE) continue;
            const slug = name.toLowerCase().replaceAll(" ", "_");
            expect(UNIT_ID_TO_IMAGE[Number(creatureId)]).toContain(`${slug}_pick_sandbox_x2.webp`);
            expect(fullBodyCreatureImage(Number(creatureId))).toBe(UNIT_ID_TO_IMAGE[Number(creatureId)]);
        }
    });
});
