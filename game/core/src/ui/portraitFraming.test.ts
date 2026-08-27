import { getCreaturesByLevel } from "@heroesofcrypto/common";
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
    test("uses each uploaded pick/sandbox portrait directly for every active creature", () => {
        const activeCreatureIds = [1, 2, 3, 4]
            .flatMap((level) => [...getCreaturesByLevel(level)])
            .sort((a, b) => a - b);

        expect(PICK_PORTRAIT_FRAMING).toEqual({});
        for (const creatureId of activeCreatureIds) {
            const slug = UNIT_ID_TO_NAME[creatureId].toLowerCase().replaceAll(" ", "_");
            expect(UNIT_ID_TO_IMAGE[creatureId]).toContain(`${slug}_pick_sandbox_x2.webp`);
            expect(fullBodyCreatureImage(creatureId)).toBe(UNIT_ID_TO_IMAGE[creatureId]);
            expect(resolveCreaturePortraitVisual(creatureId)).toMatchObject({
                source: UNIT_ID_TO_IMAGE[creatureId],
                framing: DEFAULT_PORTRAIT_FRAMING,
            });
        }
    });

    test("retains the previous checkpoint for editor recovery without applying it in production", () => {
        expect(Object.keys(PORTRAIT_FRAMING_CHECKPOINT_X).length).toBeGreaterThan(50);
        expect(PORTRAIT_FRAMING_STORAGE_KEY).toBe("hoc-dev-portrait-framing-v3");
    });

    test("keeps independent left-sidebar placement independent from pick framing", () => {
        expect(
            resolveCreaturePortraitArtPlacement(DEFAULT_PORTRAIT_FRAMING, {
                independentSource: true,
                scale: 1,
                offsetX: 0,
                offsetY: 0,
            }),
        ).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    });

    test("normalizes portrait editor limits", () => {
        expect(normalizePortraitFraming({ offsetX: -150 }).offsetX).toBe(PORTRAIT_OFFSET_X_MIN);
        expect(normalizePortraitFraming({ offsetX: 75 }).offsetX).toBe(PORTRAIT_OFFSET_X_MAX);
        expect(normalizePortraitFraming({ offsetY: -250 }).offsetY).toBe(PORTRAIT_OFFSET_Y_MIN);
        expect(normalizePortraitFraming({ offsetY: 250 }).offsetY).toBe(PORTRAIT_OFFSET_Y_MAX);
        expect(normalizePortraitFraming({ scale: 8 }).scale).toBe(PORTRAIT_SCALE_MAX);
        expect(normalizePortraitFraming({ scale: 0.1 }).scale).toBe(PORTRAIT_SCALE_MIN);
    });
});
