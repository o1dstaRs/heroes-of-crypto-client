import { expect, test } from "bun:test";
import { CHAMPION_PLUME_PERIOD_MS, championPlumePlacement, championPlumeWave } from "./ChampionLabPlume";
import { championLabWalkHeightScale, championLabWalkWidthScale } from "./ChampionLabWalkCalibration";

test("Champion plume pins a root region and completes a fast seamless ripple", () => {
    for (const time of [0, 0.5, 1, 2, 8, 25]) {
        for (const root of [0, 0.06, 0.12]) expect(Math.abs(championPlumeWave(root, time, 60))).toBe(0);
        expect(championPlumeWave(1, time + CHAMPION_PLUME_PERIOD_MS / 1000, 60)).toBeCloseTo(
            championPlumeWave(1, time, 60),
        );
    }
    expect(CHAMPION_PLUME_PERIOD_MS).toBeLessThan(1250);
    expect(
        Math.abs(championPlumeWave(1, 0, 80) - championPlumeWave(1, CHAMPION_PLUME_PERIOD_MS / 2000, 80)),
    ).toBeGreaterThan(10);
});

test("walk registration cannot shrink the separate plume", () => {
    for (let frame = 0; frame < 8; frame++) {
        const { size, canvas } = championPlumePlacement(frame);
        expect(size[0] * championLabWalkWidthScale(frame)).toBeCloseTo(96);
        expect(size[1] * championLabWalkHeightScale(frame)).toBeCloseTo(80);
        expect(canvas).toBe(768);
    }
    expect(championPlumePlacement(-1)).toEqual({ root: [490, 251], size: [96, 80], canvas: 1024 });
});
