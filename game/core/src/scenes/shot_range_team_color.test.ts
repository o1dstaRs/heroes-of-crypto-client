import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ALLY_HOVERED_SHOT_RANGE_COLOR, ENEMY_HOVERED_SHOT_RANGE_COLOR, hoveredShotRangeColor } from "./SandboxDrawer";
import { DEFAULT_SHOT_TRAJECTORY_STYLE, isShotTrajectoryStyle } from "./shotTrajectoryStyle";
import { cameraCompensatedSpriteTransform, SHOT_CASING_SIZE_SCALE, SHOT_CASING_SPACING } from "./HoverManager";

describe("hovered shot-range relationship colors", () => {
    it("uses green for an ally and red for an enemy", () => {
        expect(hoveredShotRangeColor(false)).toBe(ALLY_HOVERED_SHOT_RANGE_COLOR);
        expect(hoveredShotRangeColor(true)).toBe(ENEMY_HOVERED_SHOT_RANGE_COLOR);
    });
});

describe("shot trajectory style validation", () => {
    it("uses the approved gold casing ingots by default", () => {
        expect(DEFAULT_SHOT_TRAJECTORY_STYLE).toBe("gold-casings");
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

    it("renders the casing style from the approved bitmap sprite without vector-drawing the casings", () => {
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain('case "gold-casings"');
        expect(SHOT_CASING_SIZE_SCALE).toBe(0.93);
        expect(source).toContain("const casingLength = 22 * 1.25 * 1.15 * SHOT_CASING_SIZE_SCALE");
        expect(source).toContain('this.loadCursorTexture("shot_trajectory_hammered_bronze_casing_sprite_v4"');
        expect(source).not.toContain("images.shot_trajectory_engraved_bronze_casing_sprite_v3");
        expect(source).not.toContain("images.shot_trajectory_dark_iron_bands_casing_sprite_v5");
        expect(source).toContain("casing = new Sprite(texture)");
        expect(source).not.toContain("const drawCasing");
        expect(source).not.toContain("const casingRadius");
        expect(source).toContain('trajectoryStyle !== "gold-casings"');
    });

    it("uses the Arbalester's thirty-percent casing spacing for every shooter", () => {
        expect(SHOT_CASING_SPACING).toBeCloseTo(38 * 1.3);
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain("const casingSpacing = SHOT_CASING_SPACING");
        expect(source).not.toContain("shotCasingSpacingForUnitName");
    });

    it("cancels non-uniform camera scaling for casing sprites", () => {
        const transform = cameraCompensatedSpriteTransform({ x: 12, y: 34 }, 0, 2, { x: 4, y: 2 });
        expect(transform).toEqual({ a: 0.5, b: -0, c: -0, d: -1, tx: 12, ty: 34 });
        expect(transform.a * 4).toBe(2);
        expect(transform.d * -2).toBe(2);
    });

    it("keeps a visible dashed rail underneath the default forged ornaments", () => {
        const source = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        expect(source).toContain("drawDashes(0, arrowLen, 3.2, 0xe2ad58, 0.82)");
        expect(source).toContain("drawDashes(0, arrowLen, 1.15, 0xffffd8, 0.92)");
    });
});
