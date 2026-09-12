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
    SHOT_ARROWHEAD_WELD_SPARK_COUNT,
    SHOT_ARROWHEAD_WELD_SPARK_MAX_LENGTH,
    SHOT_ARROWHEAD_WELD_SEAM_HEIGHT_SCALE,
    SHOT_ARROWHEAD_WELD_ZONE_LENGTH_SCALE,
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

        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain('\"shot_trajectory_gold_casing_sprite_v6\"');
        expect(source).toContain('\"shot_trajectory_orc_bronze_fletching_distant_match_v8\"');
        expect(source).toContain('\"shot_trajectory_orc_bronze_arrowhead_distant_match_v8\"');
        expect(source).toContain("shotTrajectoryUsesOrcPalette(this.context.getCurrentActiveUnit()?.getName())");
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

    it("renders the approved fletching, original casing, and arrowhead bitmaps", () => {
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain('case "gold-casings"');
        expect(SHOT_FLETCHING_SIZE_SCALE).toBeCloseTo(0.8 * 0.7 * 1.1 * 0.85 * 0.85 * 1.2 * 1.15);
        expect(source).toContain("const shaftLength = SHOT_SHAFT_RENDER_LENGTH");
        expect(source).toContain("* SHOT_FLETCHING_SIZE_SCALE");
        expect(source).toContain('"shot_trajectory_gold_fletching_wide_socket_v6"');
        expect(source).toContain('"shot_trajectory_hammered_bronze_casing_sprite_v4"');
        expect(source).toContain('"shot_trajectory_gold_casing_sprite_v6"');
        expect(source).toContain('"shot_trajectory_orc_bronze_fletching_distant_match_v8"');
        expect(source).toContain('"shot_trajectory_orc_bronze_arrowhead_distant_match_v8"');
        expect(source).toContain('"shot_trajectory_gold_arrowhead_wide_socket_v6"');
        expect(source).not.toContain('"shot_trajectory_arrow_shaft_segment_distant_v4"');
        expect(source).toContain("shaft = new Sprite(renderTexture)");
        expect(source).toContain("this.hoverShotShaftSprites[shaftIndex] = shaft");
        expect(source).toContain("const sparkTravelLength = Math.max(1, arrowLen - sparkEdgeInset * 2)");
        expect(source).toContain("const shaftPhase = (this.hoverGlowPhase * SHOT_SHAFT_SPEED) % shaftSpacing");
        expect(source).toContain("shaft.roundPixels = true");
        expect(SHOT_SHAFT_THICKNESS_SCALE).toBe(1);
        expect(source).toContain("transform.c * SHOT_SHAFT_THICKNESS_SCALE");
        expect(source).toContain("transform.d * SHOT_SHAFT_THICKNESS_SCALE");
        expect(SHOT_SHAFT_TARGET_PENETRATION_SCALE).toBe(0.65);
        expect(source).toContain("const targetPenetration = shaftLength * SHOT_SHAFT_TARGET_PENETRATION_SCALE");
        expect(source).toContain("shotCasingVisibleSlice(d, shaftLength, startClearance, endClearance)");
        expect(source).toContain("frame: cropFrame.clone()");
        expect(source).toContain("orig: new Rectangle(0, 0, cropFrame.width, sourceFrame.height)");
        expect(source).not.toContain("trim: trimFrame.clone()");
        expect(source).toContain("cropTexture.update()");
        expect(source).not.toContain("cropTexture.updateUvs()");
        expect(source).toContain("let renderTexture = shaftTexture");
        expect(source).toContain("if (isBoundarySlice)");
        expect(source).toContain("renderTexture = cropTexture");
        expect(source).not.toContain("d > arrowLen + targetPenetration");
        expect(source).toContain('this.loadCursorTexture("shot_trajectory_hammered_bronze_casing_sprite_v4"');
    });

    it("reveals each casing progressively from the marked inner opening of the fletching socket", () => {
        expect(shotTrajectoryAuthoringOffsetToWorld(65, 48, SHOT_FLETCHING_AUTHORING_WIDTH)).toBeCloseTo(
            (65 * 48) / 144,
        );
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain("const startClearance = Math.max(0, fletchingOffsetAlong + projectileOriginAlong)");
        expect(source).toContain("const { sourceStartFraction, sourceEndFraction } = visibleSlice");
        expect(source).toContain("const visibleSegmentCenter =");
        expect(source).toContain("cropTexture.orig.x = 0");
        expect(source).toContain("cropTexture.orig.width = cropFrame.width");
        expect(source).not.toContain("cropTexture.trim.copyFrom(trimFrame)");
        expect(source).toContain("const lateralOffset = originLateralOffset * (1 - pathProgress)");
        expect(source).toContain("x: from.x + ux * visibleSegmentCenter + nx * lateralOffset");
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

    it("scales spark offsets from the editor arrowhead into the runtime marker size", () => {
        expect(shotTrajectoryAuthoringOffsetToWorld(-35, 56, SHOT_ARROWHEAD_AUTHORING_WIDTH)).toBe(-17.5);
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain("const contactOffsetAlong = shotTrajectoryAuthoringOffsetToWorld(");
        expect(source).toContain("const contactPositionOffset = cameraCompensatedLocalOffset(");
        expect(source).toContain("const jointX = endX + contactPositionOffset.x");
    });

    it("draws each emerging casing in front of the fletching socket hole", () => {
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain("this.context.attachToWorldRoot(fletching, 2201)");
        expect(source).toContain("this.context.attachToWorldRoot(shaft, 2202)");
        expect(source).toContain("fletching.zIndex = 2201");
        expect(source).toContain("shaft.zIndex = 2202");
    });

    it("animates evenly distributed golden sparks over the full trajectory length", () => {
        expect(SHOT_TRAJECTORY_SPARK_SPACING).toBe(64);
        expect(SHOT_TRAJECTORY_SPARK_SPEED).toBe(34);
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        const casingTreatment = source.slice(
            source.indexOf('case "gold-casings"'),
            source.indexOf('case "marching-chevrons"'),
        );
        expect(casingTreatment).toContain("sparkIndex * (sparkTravelLength / sparkCount)");
        expect(casingTreatment).toContain("this.hoverGlowPhase * SHOT_TRAJECTORY_SPARK_SPEED");
        expect(casingTreatment).toContain("sparkLateralSpread");
        expect(casingTreatment).toContain("g.circle(sparkX, sparkY");
        expect(casingTreatment).not.toContain("drawDashes(");
    });

    it("shows a small welding burst only while a casing crosses the arrowhead socket", () => {
        expect(SHOT_ARROWHEAD_WELD_SPARK_COUNT).toBe(8);
        expect(SHOT_ARROWHEAD_WELD_SPARK_MAX_LENGTH).toBe(9);
        expect(SHOT_ARROWHEAD_WELD_ZONE_LENGTH_SCALE).toBe(0.22);
        expect(SHOT_ARROWHEAD_WELD_SEAM_HEIGHT_SCALE).toBe(1.15);
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain("segmentStart <= arrowLen && segmentEnd >= arrowLen");
        expect(source).toContain("(segmentEnd - arrowLen) / shaftLength");
        expect(source).toContain("this.safeAttachGraphics(jointSparks, 5602)");
        expect(source).toContain("jointSparks.circle(0, 0");
        expect(source).toContain("const seamHalfThickness = Math.max(");
        expect(source).toContain("SHOT_ARROWHEAD_WELD_ZONE_LENGTH_SCALE *");
        expect(source).toContain("longitudinalOffset = Math.sin(sparkPhase * 0.73) * jointZoneHalfLength");
        expect(source).toContain(".moveTo(longitudinalOffset + rayUx * 0.8, seamOffset + rayUy * 0.8)");
        expect(source).toContain("arrowheadJointContactStrength > 0");
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
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain("const trajectoryTuning = getShotTrajectoryTuning()");
        expect(source).toContain("projectileOriginTuning.offsetAlong");
        expect(source).toContain("emergenceTuning.offsetPerpendicular");
        expect(source).toContain("emergenceSparkTuning.rotationDegrees");
        expect(source).toContain("emergenceJointContactStrength");
        expect(source).toContain('this.drawShotWeldSparks(\n                    "emergence"');
        expect(source).toContain("contactSparkTuning.rotationDegrees");
    });

    it("keeps casings three percent larger with the latest spacing and speed adjustments", () => {
        expect(SHOT_SHAFT_RENDER_LENGTH).toBeCloseTo(22 * 1.25 * 1.15 * 0.87 * 1.03);
        expect(SHOT_SHAFT_SPACING_SCALE).toBeCloseTo(1.3 * 1.3 * 0.93);
        expect(SHOT_SHAFT_SPACING).toBeCloseTo(38 * 1.3 * 1.3 * 0.93);
        expect(SHOT_SHAFT_SPEED).toBeCloseTo(36 * 1.3 * 1.25);
        expect(SHOT_SHAFT_RENDER_LENGTH).toBeLessThan(SHOT_SHAFT_SPACING);
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain("const shaftSpacing = SHOT_SHAFT_SPACING");
        expect(source).not.toContain("shotCasingSpacingForUnitName");
    });

    it("cancels non-uniform camera scaling for arrow-part sprites", () => {
        const transform = cameraCompensatedSpriteTransform({ x: 12, y: 34 }, 0, 2, { x: 4, y: 2 });
        expect(transform).toEqual({ a: 0.5, b: -0, c: -0, d: -1, tx: 12, ty: 34 });
        expect(transform.a * 4).toBe(2);
        expect(transform.d * -2).toBe(2);
    });

    it("keeps the contact strip fixed to the arrowhead in screen space at every angle", () => {
        const cameraScale = { x: 1.7, y: 0.85 };
        for (const angle of [0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 3]) {
            const offset = cameraCompensatedLocalOffset(11, -2, angle, cameraScale);
            const screenOffset = { x: offset.x * cameraScale.x, y: offset.y * -cameraScale.y };
            expect(screenOffset.x).toBeCloseTo(Math.cos(angle) * 11 + Math.sin(angle) * 2, 8);
            expect(screenOffset.y).toBeCloseTo(Math.sin(angle) * 11 - Math.cos(angle) * 2, 8);
        }
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain("const contactScreenAngle = screenAngle + contactRotation");
        expect(source).toContain("jointSparks.setFromMatrix(");
    });

    it("lets the dev editor hide only the green projectile-origin marker", () => {
        const editorSource = readFileSync(join(import.meta.dir, "../ui/ShotTrajectoryEditor.tsx"), "utf8");
        expect(editorSource).toContain("const [originMarkerVisible, setOriginMarkerVisible] = useState(true)");
        expect(editorSource).toContain('ЗЕЛЁНЫЙ КРУГ: {originMarkerVisible ? "ВКЛ" : "ВЫКЛ"}');
        expect(editorSource).toContain("{originMarkerVisible && (");
        expect(editorSource).toContain("startDrag(event, tuning.projectileOrigin, onOriginChange");
    });

    it("pins each palette's measured fletching and casing centerlines to the same trajectory ray", () => {
        expect(SHOT_GOLD_FLETCHING_AXIS_ANCHOR_Y).toBeCloseTo(92.5 / 176);
        expect(SHOT_GOLD_SHAFT_AXIS_ANCHOR_Y).toBeCloseTo(102 / 216);
        expect(SHOT_ORC_FLETCHING_AXIS_ANCHOR_Y).toBeCloseTo(91.5 / 176);
        expect(SHOT_ORC_SHAFT_AXIS_ANCHOR_Y).toBeCloseTo(26 / 54);
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain("fletching.anchor.set(0.5, fletchingAxisAnchorY)");
        expect(source).toContain("shaft.anchor.set(0.5, shaftAxisAnchorY)");
    });

    it("keeps one uninterrupted animated shaft sequence through the midpoint", () => {
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).not.toContain("SHOT_MIDPOINT_SHAFT_FRACTION");
        expect(source).not.toContain("hoverShotMidpointShaft");
        expect(source).not.toContain("midpointDistance");
    });

    it("keeps a visible dashed rail underneath the default forged ornaments", () => {
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain("drawDashes(0, arrowLen, 3.2, 0xe2ad58, 0.82)");
        expect(source).toContain("drawDashes(0, arrowLen, 1.15, 0xffffd8, 0.92)");
    });
});
