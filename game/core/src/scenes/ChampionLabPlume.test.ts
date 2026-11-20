import { expect, test } from "bun:test";
import { championPlumePlacement } from "./ChampionLabPlume";
import { championLabWalkHeightScale, championLabWalkWidthScale } from "./ChampionLabWalkCalibration";

test("walk registration cannot shrink the separate plume", () => {
    for (let frame = 0; frame < 8; frame++) {
        const { size, canvas } = championPlumePlacement(frame);
        expect(size[0] * championLabWalkWidthScale(frame)).toBeCloseTo(96);
        expect(size[1] * championLabWalkHeightScale(frame)).toBeCloseTo(80);
        expect(canvas).toBe(768);
    }
    expect(championPlumePlacement(-1)).toEqual({ root: [490, 251], size: [96, 80], canvas: 1024 });
});
