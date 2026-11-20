import { expect, test } from "bun:test";
import { calibrateWyvernAttackChannel, wyvernAttackCurves } from "./WyvernLabAttackCalibration";

test("all attack RGB tonal landmarks use the same idle palette without reversed tone ramps", () => {
    const reference = Object.values(wyvernAttackCurves)[0].target;
    for (const [pose, curve] of Object.entries(wyvernAttackCurves)) {
        expect(curve.target).toEqual(reference);
        for (let channel = 0; channel < 3; channel++) {
            for (let i = 0; i < curve.source.length; i++) {
                expect(calibrateWyvernAttackChannel(curve.source[i][channel], pose, channel)).toBeCloseTo(
                    curve.target[i][channel],
                    4,
                );
            }
            let previous = -1;
            for (let value = 0; value <= 255; value++) {
                const corrected = calibrateWyvernAttackChannel(value, pose, channel);
                expect(corrected).toBeGreaterThanOrEqual(previous);
                expect(corrected).toBeLessThanOrEqual(255);
                previous = corrected;
            }
        }
    }
});
