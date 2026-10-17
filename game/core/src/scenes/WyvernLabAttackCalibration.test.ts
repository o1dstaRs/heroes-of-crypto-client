import { expect, test } from "bun:test";
import { calibrateWyvernAttackChannel, wyvernAttackCurves } from "./WyvernLabAttackCalibration";
import { wyvernLabAttackPose, wyvernLabDisplayColor, wyvernLabMaterialColor } from "./WyvernLabWalkPalette";

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

test("body tone correction leaves acid unchanged and never touches source idle bookends", () => {
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down"]) {
        for (const frame of [0, 1, 6, 7]) expect(wyvernLabAttackPose(state, frame)).toBeUndefined();
        const pose = wyvernLabAttackPose(state, 3)!;
        const acid = [181, 198, 35] as const;
        expect(wyvernLabDisplayColor(acid, pose)).toEqual(wyvernLabMaterialColor(acid, pose));
    }
});
