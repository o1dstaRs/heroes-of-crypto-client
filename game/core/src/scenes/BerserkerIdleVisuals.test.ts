import { expect, test } from "bun:test";
import { BERSERKER_POSE_TONES, BERSERKER_REFERENCE_TONES } from "./BerserkerIdleCalibration";
import { BERSERKER_WAITING_SPEED, berserkerPaletteValue, berserkerWaitingMotion } from "./BerserkerIdleVisuals";
import { animationAtlases } from "../generated/animation_atlases";

test("Berserker palette maps measured body tones to the base and never grades neutral", () => {
    for (let c = 0; c < 3; c++)
        for (let value = 0; value < 256; value++) expect(berserkerPaletteValue(0, c, value)).toBe(value);
    for (let pose = 1; pose < BERSERKER_POSE_TONES.length; pose++)
        for (let c = 0; c < 3; c++) {
            const tones: readonly number[] = BERSERKER_POSE_TONES[pose][c];
            for (let i = 0; i < tones.length; i++) {
                // Equal source quantiles collapse naturally to a single output tone.
                const first = tones.indexOf(tones[i]);
                expect(berserkerPaletteValue(pose, c, tones[i])).toBeCloseTo(BERSERKER_REFERENCE_TONES[c][first], 7);
            }
            for (let value = 1; value < 256; value++)
                expect(berserkerPaletteValue(pose, c, value)).toBeGreaterThanOrEqual(
                    berserkerPaletteValue(pose, c, value - 1),
                );
        }
});

test("Berserker sway runs another 20 percent faster within the same rest interval", () => {
    const durations = animationAtlases["Berserker Sword"].idle.frameDurationsMs!;
    expect(BERSERKER_WAITING_SPEED / 1.3).toBeCloseTo(1.2, 10);
    const halfPeriod = durations[0] / (2 * 1.3 * 1.2);
    expect(berserkerWaitingMotion(halfPeriod - 10, durations).x).toBeGreaterThan(0);
    expect(Math.abs(berserkerWaitingMotion(halfPeriod, durations).x)).toBeLessThan(1e-10);
    expect(berserkerWaitingMotion(halfPeriod + 10, durations).x).toBeLessThan(0);
});
