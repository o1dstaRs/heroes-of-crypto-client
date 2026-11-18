import { describe, expect, test } from "bun:test";

import {
    DEFAULT_PICK_LANTERN_FIRE_TUNING,
    DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING,
    normalizePickLanternFireTuning,
    migrateLegacyLanternTunings,
    pickLanternFireBounds,
} from "./pickLanternFireTuning";

describe("pick lantern fire tuning", () => {
    test("ships one engine flame without overlapping legacy layers", () => {
        expect(DEFAULT_PICK_LANTERN_FIRE_TUNING.anchorX).toBe(29.74);
        expect(DEFAULT_PICK_LANTERN_FIRE_TUNING.anchorY).toBe(16.61);
        expect(DEFAULT_PICK_LANTERN_FIRE_TUNING.width).toBe(2.4);
        expect(DEFAULT_PICK_LANTERN_FIRE_TUNING.height).toBe(6.1);
        expect(DEFAULT_PICK_LANTERN_FIRE_TUNING.brightness).toBe(1.1);
        expect(DEFAULT_PICK_LANTERN_FIRE_TUNING.density).toBe(0.7);
        expect(DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING.enabled).toBe(false);
        expect(DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING.anchorX).toBe(29.67);
        expect(DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING.anchorY).toBe(16.76);
        expect(DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING.width).toBe(1.55);
        expect(DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING.height).toBe(4.9);
        expect(normalizePickLanternFireTuning(undefined, DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING).enabled).toBe(false);
    });

    test("migration retains custom placement without retaining the green atlas or modifying its source", () => {
        const legacy = [
            { anchorX: 31, anchorY: 20, width: 3.2, height: 7, hue: 15, source: "natural-atlas", enabled: true },
        ];
        const migrated = migrateLegacyLanternTunings(legacy);
        expect(migrated[0]).toMatchObject({
            anchorX: 31,
            anchorY: 20,
            width: 3.2,
            height: 7,
            source: "engine",
            hue: 0,
        });
        expect(migrated[1].enabled).toBe(false);
        expect(legacy[0].source).toBe("natural-atlas");
        expect(migrateLegacyLanternTunings(null)[0].source).toBe("engine");
    });

    test("keeps the lower edge fixed when height changes", () => {
        const short = normalizePickLanternFireTuning({ anchorY: 22, height: 5 });
        const tall = normalizePickLanternFireTuning({ anchorY: 22, height: 15 });

        expect(pickLanternFireBounds(short).bottom).toBe(22);
        expect(pickLanternFireBounds(tall).bottom).toBe(22);
        expect(pickLanternFireBounds(tall).top).toBe(7);
    });

    test("accepts only supported fire sources", () => {
        expect(normalizePickLanternFireTuning({ source: "engine" }).source).toBe("engine");
        expect(normalizePickLanternFireTuning({ source: "candle-video" }).source).toBe("candle-video");
        expect(normalizePickLanternFireTuning({ source: "natural-atlas" }).source).toBe("natural-atlas");
        expect(normalizePickLanternFireTuning({ source: "other" as never }).source).toBe(
            DEFAULT_PICK_LANTERN_FIRE_TUNING.source,
        );
    });

    test("clamps geometry and colour controls to editor limits", () => {
        const value = normalizePickLanternFireTuning({
            anchorX: 120,
            anchorY: -5,
            width: 0,
            height: 99,
            opacity: 8,
            hue: -200,
            blackCutoff: 2,
            density: 20,
        });

        expect(value.anchorX).toBe(100);
        expect(value.anchorY).toBe(0);
        expect(value.width).toBe(0.2);
        expect(value.height).toBe(50);
        expect(value.opacity).toBe(1.5);
        expect(value.hue).toBe(-90);
        expect(value.blackCutoff).toBe(0.75);
        expect(value.density).toBe(6);
    });
});
