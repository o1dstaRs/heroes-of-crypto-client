import { describe, expect, it } from "bun:test";

import {
    damagePredictionLayout,
    damagePredictionVerticalScaleCompensation,
    pinnedDamagePredictionAnchor,
} from "./HoverManager";

describe("damagePredictionLayout", () => {
    it("keeps the reduced prediction size identical for every target size", () => {
        expect(damagePredictionLayout(false, true).scale).toBe(1.3);
        expect(damagePredictionLayout(true, true).scale).toBe(1.3);
    });

    it("places one- and two-row predictions above the creature flag anchor", () => {
        expect(damagePredictionLayout(false, false).centerOffsetY).toBeCloseTo(24.2);
        expect(damagePredictionLayout(false, true).centerOffsetY).toBeCloseTo(42.4);
        expect(damagePredictionLayout(true, false).centerOffsetY).toBeCloseTo(24.2);
        expect(damagePredictionLayout(true, true).centerOffsetY).toBeCloseTo(42.4);
    });

    it("counter-scales the vertical axis when the battlefield camera compresses it", () => {
        const compensation = damagePredictionVerticalScaleCompensation({ x: 1, y: 0.87 });
        const layout = damagePredictionLayout(false, true, compensation);

        expect(compensation).toBeCloseTo(1 / 0.87);
        expect(layout.scale).toBe(1.3);
        expect(layout.verticalScale * 0.87).toBeCloseTo(layout.scale);
    });

    it("pins the forecast while repeated hover frames target the same creature", () => {
        const first = pinnedDamagePredictionAnchor(undefined, "target-a", { x: 100, y: 200 });
        const afterAnimatedBoundsMove = pinnedDamagePredictionAnchor(first, "target-a", { x: 100, y: 207 });
        const nextTarget = pinnedDamagePredictionAnchor(afterAnimatedBoundsMove, "target-b", { x: 300, y: 400 });

        expect(afterAnimatedBoundsMove).toBe(first);
        expect(afterAnimatedBoundsMove.position).toEqual({ x: 100, y: 200 });
        expect(nextTarget.position).toEqual({ x: 300, y: 400 });
    });
});
