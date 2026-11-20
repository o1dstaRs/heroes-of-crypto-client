import { expect, test } from "bun:test";
import { ANGEL_MELEE_MATERIALS, ANGEL_MELEE_MATERIAL_TARGET } from "./AngelMeleeMaterialCalibration";

test("all materials preserve canonical endpoints and monotonic measured color curves", () => {
    for (const frames of Object.values(ANGEL_MELEE_MATERIALS)) {
        expect(frames).toHaveLength(8);
        expect(frames[0]).toEqual(ANGEL_MELEE_MATERIAL_TARGET);
        expect(frames[7]).toEqual(ANGEL_MELEE_MATERIAL_TARGET);
        for (const palette of frames)
            for (const material of palette)
                for (const channel of material) {
                    expect(channel).toHaveLength(7);
                    channel.forEach((v, i) => {
                        expect(v).toBeGreaterThanOrEqual(i ? channel[i - 1] : 0);
                        expect(v).toBeLessThanOrEqual(1);
                    });
                }
    }
});
