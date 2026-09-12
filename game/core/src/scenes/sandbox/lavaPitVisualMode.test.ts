import { describe, expect, test } from "bun:test";

import {
    lavaPitFireEnabledForScene,
    lavaPitVisualModeForScene,
    lavaPitVisualState,
    normalizeLavaPitVisualMode,
    shouldUseExtinguishedPitLayers,
} from "./lavaPitVisualMode";

describe("lava pit visual mode", () => {
    test("defaults unknown stored values to the burning production look", () => {
        expect(normalizeLavaPitVisualMode(undefined)).toBe("burning");
        expect(normalizeLavaPitVisualMode("other")).toBe("burning");
        expect(normalizeLavaPitVisualMode("extinguished")).toBe("extinguished");
    });

    test("keeps the approved animated-fire look outside the editor", () => {
        expect(lavaPitVisualModeForScene(false, "extinguished")).toBe("burning");
        expect(lavaPitVisualModeForScene(true, "extinguished")).toBe("extinguished");
        expect(lavaPitFireEnabledForScene(false, false)).toBe(true);
        expect(lavaPitFireEnabledForScene(false, true)).toBe(true);
        expect(lavaPitFireEnabledForScene(true, false)).toBe(false);
        expect(lavaPitFireEnabledForScene(true, true)).toBe(true);
    });

    test("uses the extinguished pit for the authoritative dried combat state", () => {
        expect(lavaPitVisualState(false, "burning")).toEqual({ liveFire: true, extinguishedPit: false });
        expect(lavaPitVisualState(false, "extinguished")).toEqual({
            liveFire: false,
            extinguishedPit: true,
        });
        expect(lavaPitVisualState(true, "extinguished")).toEqual({
            liveFire: false,
            extinguishedPit: true,
        });
        expect(lavaPitVisualState(true, "burning")).toEqual({
            liveFire: false,
            extinguishedPit: true,
        });
    });

    test("does not show the extinguished artwork just because the animated fire layer is disabled", () => {
        const burningPit = lavaPitVisualState(false, "burning");
        const extinguishedPit = lavaPitVisualState(true, "burning");

        expect(shouldUseExtinguishedPitLayers(burningPit, false)).toBe(false);
        expect(shouldUseExtinguishedPitLayers(burningPit, true)).toBe(false);
        expect(shouldUseExtinguishedPitLayers(extinguishedPit, false)).toBe(true);
    });
});
