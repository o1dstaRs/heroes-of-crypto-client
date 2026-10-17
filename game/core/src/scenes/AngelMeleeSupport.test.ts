import { expect, test } from "bun:test";
import { ANGEL_MELEE_CALIBRATION } from "./AngelMeleeCalibration";
import {
    ANGEL_MELEE_SECOND_SUPPORT,
    ANGEL_MELEE_MATERIALS,
    ANGEL_MELEE_MATERIAL_TARGET,
} from "./AngelMeleeMaterialCalibration";
import { angelActionFrameOffset } from "./AngelActionRegistration";
import { angelMeleeSecondSupportOffset, angelMeleeSupportWeight } from "./AngelMeleeSupport";

test("all24cels lock both measured sole contacts without moving the upper body or scaling the figure", () => {
    for (const [state, frames] of Object.entries(ANGEL_MELEE_SECOND_SUPPORT)) {
        const first = ANGEL_MELEE_CALIBRATION[state][0].support;
        const second = frames[0];
        frames.forEach((contact, frame) => {
            const [dx, dy] = angelActionFrameOffset(state, frame);
            const [lx, ly] = angelMeleeSecondSupportOffset(state, frame);
            expect(angelMeleeSupportWeight(...first)).toBe(0);
            expect(angelMeleeSupportWeight(...second)).toBe(1);
            // Inverse sampling of the target contact must land exactly on the native sole.
            expect(second[0] - lx).toBeCloseTo(contact[0] + dx, 5);
            expect(second[1] - ly).toBeCloseTo(contact[1] + dy, 5);
            expect(angelMeleeSupportWeight(490, 400)).toBe(0);
            expect(angelMeleeSupportWeight(660, 700)).toBe(0);
            expect(ANGEL_MELEE_CALIBRATION[state][frame].widthScale).toBe(1);
        });
        expect(angelMeleeSecondSupportOffset(state, 0)).toEqual([0, 0]);
        expect(angelMeleeSecondSupportOffset(state, 7)).toEqual([0, 0]);
    }
    expect(angelMeleeSecondSupportOffset("cast", 4)).toEqual([0, 0]);
});

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
