import { describe, expect, test } from "bun:test";
import {
    DEFAULT_PICK_LANTERN_FIRE_TUNING,
    DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING,
    normalizePickLanternFireTuning,
    pickLanternFireBounds,
} from "./pickLanternFireTuning";

describe("pick lantern fire tuning", () => {
    test("ships both approved local fire presets", () => {
        expect(DEFAULT_PICK_LANTERN_FIRE_TUNING.anchorX).toBe(29.74);
        expect(DEFAULT_PICK_LANTERN_FIRE_TUNING.anchorY).toBe(16.61);
        expect(DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING.anchorX).toBe(29.67);
        expect(DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING.anchorY).toBe(16.76);
    });

    test("keeps the lower edge fixed when height changes", () => {
        const short = normalizePickLanternFireTuning({ anchorY: 22, height: 5 });
        const tall = normalizePickLanternFireTuning({ anchorY: 22, height: 15 });
        expect(pickLanternFireBounds(short).bottom).toBe(22);
        expect(pickLanternFireBounds(tall).bottom).toBe(22);
        expect(pickLanternFireBounds(tall).top).toBe(7);
    });

    test("accepts only supported sources and clamps editor limits", () => {
        expect(normalizePickLanternFireTuning({ source: "candle-video" }).source).toBe("candle-video");
        expect(normalizePickLanternFireTuning({ source: "other" as never }).source).toBe("natural-atlas");
        const value = normalizePickLanternFireTuning({ anchorX: 120, height: 99, density: 20 });
        expect(value.anchorX).toBe(100);
        expect(value.height).toBe(50);
        expect(value.density).toBe(6);
    });
});
