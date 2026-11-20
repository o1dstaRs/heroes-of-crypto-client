import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ALLY_HOVERED_SHOT_RANGE_COLOR, ENEMY_HOVERED_SHOT_RANGE_COLOR, hoveredShotRangeColor } from "./SandboxDrawer";
import { DEFAULT_SHOT_TRAJECTORY_STYLE, isShotTrajectoryStyle } from "./shotTrajectoryStyle";
import {
    DEFAULT_SHOT_TRAJECTORY_TUNING,
    normalizeShotTrajectoryTuning,
    SHOT_ARROWHEAD_AUTHORING_WIDTH,
    SHOT_FLETCHING_AUTHORING_WIDTH,
    SHOT_TRAJECTORY_TUNING_STORAGE_KEY,
    shotCasingVisibleSlice,
    shotTrajectoryAuthoringOffsetToWorld,
} from "./shotTrajectoryTuning";
import {
    cameraCompensatedLocalOffset,
    cameraCompensatedSpriteTransform,
    shotTrajectoryUsesOrcPalette,
    SHOT_FLETCHING_SIZE_SCALE,
    SHOT_GOLD_FLETCHING_AXIS_ANCHOR_Y,
    SHOT_GOLD_SHAFT_AXIS_ANCHOR_Y,
    SHOT_TRAJECTORY_SPARK_SPACING,
    SHOT_TRAJECTORY_SPARK_SPEED,
    SHOT_ORC_FLETCHING_AXIS_ANCHOR_Y,
    SHOT_ORC_SHAFT_AXIS_ANCHOR_Y,
    SHOT_SHAFT_RENDER_LENGTH,
    SHOT_SHAFT_SPACING,
    SHOT_SHAFT_SPACING_SCALE,
    SHOT_SHAFT_SPEED,
    SHOT_SHAFT_THICKNESS_SCALE,
    SHOT_SHAFT_TARGET_PENETRATION_SCALE,
} from "./HoverManager";

describe("hovered shot-range relationship colors", () => {
    it("uses green for an ally and red for an enemy", () => {
        expect(hoveredShotRangeColor(false)).toBe(ALLY_HOVERED_SHOT_RANGE_COLOR);
        expect(hoveredShotRangeColor(true)).toBe(ENEMY_HOVERED_SHOT_RANGE_COLOR);
    });
});

describe("shot trajectory style validation", () => {
    it("uses the approved separated arrow parts by default", () => {
        expect(DEFAULT_SHOT_TRAJECTORY_STYLE).toBe("gold-casings");
    });

    it("uses the approved Orc bronze set for every ranged creature", () => {
        expect(shotTrajectoryUsesOrcPalette("Orc")).toBe(true);
        expect(shotTrajectoryUsesOrcPalette("Arbalester")).toBe(true);
        expect(shotTrajectoryUsesOrcPalette(undefined)).toBe(true);
    });

    it("accepts the selectable treatments and rejects unknown values", () => {
        expect(isShotTrajectoryStyle("ember-dashes")).toBe(true);
        expect(isShotTrajectoryStyle("solid-gold")).toBe(true);
        expect(isShotTrajectoryStyle("twin-tracer")).toBe(true);
        expect(isShotTrajectoryStyle("marching-chevrons")).toBe(true);
        expect(isShotTrajectoryStyle("double-chevron-pulses")).toBe(true);
        expect(isShotTrajectoryStyle("forged-double-chevrons")).toBe(true);
        expect(isShotTrajectoryStyle("ember-double-chevrons")).toBe(true);
        expect(isShotTrajectoryStyle("gold-casings")).toBe(true);
        expect(isShotTrajectoryStyle("unknown")).toBe(false);
    });

    it("loads the approved fletching, casing, and arrowhead bitmaps by key", () => {
        // Approved Point X5 shot-trajectory art: these keys name canonical assets, so a rename silently
        // falls back to a missing texture.
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        for (const key of [
            "shot_trajectory_gold_fletching_wide_socket_v6",
            "shot_trajectory_gold_casing_sprite_v6",
            "shot_trajectory_gold_arrowhead_wide_socket_v6",
            "shot_trajectory_orc_bronze_fletching_distant_match_v8",
            "shot_trajectory_hammered_bronze_casing_sprite_v4",
            "shot_trajectory_orc_bronze_arrowhead_distant_match_v8",
        ]) {
            expect(source).toContain(`this.loadCursorTexture("${key}"`);
        }
        expect(SHOT_FLETCHING_SIZE_SCALE).toBeCloseTo(0.8 * 0.7 * 1.1 * 0.85 * 0.85 * 1.2 * 1.15);
        expect(SHOT_SHAFT_THICKNESS_SCALE).toBe(1);
        expect(SHOT_SHAFT_TARGET_PENETRATION_SCALE).toBe(0.65);
    });

    it("reveals each casing progressively from the marked inner opening of the fletching socket", () => {
        expect(shotCasingVisibleSlice(60, 20, 65, 100)).toEqual({
            sourceStartFraction: 0.75,
            sourceEndFraction: 1,
        });
        expect(shotCasingVisibleSlice(65, 20, 65, 100)).toEqual({
            sourceStartFraction: 0.5,
            sourceEndFraction: 1,
        });
        expect(shotCasingVisibleSlice(57.5, 20, 65, 100)).toEqual({
            sourceStartFraction: 0.875,
            sourceEndFraction: 1,
        });
        expect(shotCasingVisibleSlice(50, 20, 65, 100)).toBeUndefined();
    });

    it.each([
        [65, 48, SHOT_FLETCHING_AUTHORING_WIDTH, (65 * 48) / 144],
        [-35, 56, SHOT_ARROWHEAD_AUTHORING_WIDTH, -17.5],
    ])("scales authoring offset %p at marker size %p into world units", (offset, size, authoringWidth, expected) => {
        expect(shotTrajectoryAuthoringOffsetToWorld(offset, size, authoringWidth)).toBeCloseTo(expected);
    });

    it("persists independently editable fletching, projectile-origin, and both weld-spark tunings", () => {
        expect(SHOT_TRAJECTORY_TUNING_STORAGE_KEY).toBe("hoc-dev-shot-trajectory-tuning-v3");
        expect(DEFAULT_SHOT_TRAJECTORY_TUNING.emergence).toEqual({
            offsetAlong: -11,
            offsetPerpendicular: 0,
            rotationDegrees: 0,
            scale: 1,
        });
        expect(DEFAULT_SHOT_TRAJECTORY_TUNING.projectileOrigin).toEqual({
            offsetAlong: 65,
            offsetPerpendicular: 0,
        });
        expect(DEFAULT_SHOT_TRAJECTORY_TUNING.emergenceSparks).toEqual({
            offsetAlong: 4,
            offsetPerpendicular: 0,
            rotationDegrees: 0,
            scale: 0.7,
        });
        expect(DEFAULT_SHOT_TRAJECTORY_TUNING.contactSparks).toEqual({
            offsetAlong: 5,
            offsetPerpendicular: -2,
            rotationDegrees: 3,
            scale: 0.87,
        });
        const normalized = normalizeShotTrajectoryTuning({
            emergence: { offsetAlong: 25, offsetPerpendicular: -12, rotationDegrees: 17, scale: 1.25 },
            projectileOrigin: { offsetAlong: 31, offsetPerpendicular: 8 },
            emergenceSparks: { offsetAlong: 5, offsetPerpendicular: -4, rotationDegrees: 9, scale: 1.1 },
            contactSparks: { offsetAlong: -9, offsetPerpendicular: 14, rotationDegrees: -28, scale: 1.8 },
        });
        expect(normalized.emergence).toEqual({
            offsetAlong: 25,
            offsetPerpendicular: -12,
            rotationDegrees: 17,
            scale: 1.25,
        });
        expect(normalized.projectileOrigin).toEqual({
            offsetAlong: 31,
            offsetPerpendicular: 8,
        });
        expect(normalized.emergenceSparks).toEqual({
            offsetAlong: 5,
            offsetPerpendicular: -4,
            rotationDegrees: 9,
            scale: 1.1,
        });
        expect(normalized.contactSparks).toEqual({
            offsetAlong: -9,
            offsetPerpendicular: 14,
            rotationDegrees: -28,
            scale: 1.8,
        });
    });

    it("keeps casings three percent larger with the latest casing and spark spacing and speed", () => {
        expect(SHOT_TRAJECTORY_SPARK_SPACING).toBe(64);
        expect(SHOT_TRAJECTORY_SPARK_SPEED).toBe(34);
        expect(SHOT_SHAFT_RENDER_LENGTH).toBeCloseTo(22 * 1.25 * 1.15 * 0.87 * 1.03);
        expect(SHOT_SHAFT_SPACING_SCALE).toBeCloseTo(1.3 * 1.3 * 0.93);
        expect(SHOT_SHAFT_SPACING).toBeCloseTo(38 * 1.3 * 1.3 * 0.93);
        expect(SHOT_SHAFT_SPEED).toBeCloseTo(36 * 1.3 * 1.25);
        expect(SHOT_SHAFT_RENDER_LENGTH).toBeLessThan(SHOT_SHAFT_SPACING);
    });

    it("cancels non-uniform camera scaling for arrow-part sprites", () => {
        const transform = cameraCompensatedSpriteTransform({ x: 12, y: 34 }, 0, 2, { x: 4, y: 2 });
        expect(transform).toEqual({ a: 0.5, b: -0, c: -0, d: -1, tx: 12, ty: 34 });
        expect(transform.a * 4).toBe(2);
        expect(transform.d * -2).toBe(2);
    });

    it("converts authoring offsets into screen space at every angle", () => {
        const cameraScale = { x: 1.7, y: 0.85 };
        for (const angle of [0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 3]) {
            const offset = cameraCompensatedLocalOffset(11, -2, angle, cameraScale);
            const screenOffset = { x: offset.x * cameraScale.x, y: offset.y * -cameraScale.y };
            expect(screenOffset.x).toBeCloseTo(Math.cos(angle) * 11 + Math.sin(angle) * 2, 8);
            expect(screenOffset.y).toBeCloseTo(Math.sin(angle) * 11 - Math.cos(angle) * 2, 8);
        }
    });

    it("pins each palette's measured fletching and casing centerlines to the same trajectory ray", () => {
        expect(SHOT_GOLD_FLETCHING_AXIS_ANCHOR_Y).toBeCloseTo(92.5 / 176);
        expect(SHOT_GOLD_SHAFT_AXIS_ANCHOR_Y).toBeCloseTo(102 / 216);
        expect(SHOT_ORC_FLETCHING_AXIS_ANCHOR_Y).toBeCloseTo(91.5 / 176);
        expect(SHOT_ORC_SHAFT_AXIS_ANCHOR_Y).toBeCloseTo(26 / 54);
    });
});
