import { expect, test } from "bun:test";
import {
    ANGEL_ACTION_FRAME_SCALES,
    calibratedAngelActionCanvas,
    angelActionFrameScale,
    angelActionFrameWidthScale,
    angelActionFrameOffset,
} from "./AngelActionRegistration";
import { ANGEL_MELEE_CALIBRATION } from "./AngelMeleeCalibration";
import { angelSwordBlade } from "./AngelSwordGlow";

test("every action cel has its own calibration; logical size and planted contact stay unchanged", () => {
    for (const [state, count] of [
        ["cast", 19],
        ["hit", 5],
        ["death", 6],
        ["melee_attack", 8],
        ["melee_attack_up", 8],
        ["melee_attack_down", 8],
    ] as const) {
        expect(ANGEL_ACTION_FRAME_SCALES[state]).toHaveLength(count);
        for (let frame = 0; frame < count; frame++)
            for (const divider of [1, 2, 4]) {
                const width = state === "cast" ? 768 : state.startsWith("melee_attack") ? 1280 : 1024,
                    height = state === "cast" ? 1280 : state.startsWith("melee_attack") ? 1024 : 896;
                const { orig, trim } = calibratedAngelActionCanvas(width / divider, height / divider, state, frame);
                const factor = angelActionFrameScale(state, frame);
                expect(orig.width).toBe(768 / divider);
                expect(orig.height).toBe(768 / divider);
                expect(factor).toBeLessThanOrEqual(1);
                const [dx, dy] = angelActionFrameOffset(state, frame);
                const px = state === "cast" ? 373.5 : state.startsWith("melee_attack") ? 629.5 : 501.5,
                    py = state === "cast" ? 1247 : 863;
                expect(trim.x + (px * factor * angelActionFrameWidthScale(state, frame)) / divider).toBeCloseTo(
                    (373.5 + dx) / divider,
                );
                expect(trim.y + (py * factor) / divider).toBeCloseTo((735 + dy) / divider);
                expect(angelSwordBlade(state, frame, true)).toBeDefined();
            }
        expect(angelActionFrameScale(state, 0)).toBe(1);
        if (state !== "death") expect(angelActionFrameScale(state, count - 1)).toBe(1);
    }
});

// Measured skull sections, independent of pose/wing bounds: preserve native 350px summed width.
test("cast and strikes correct widening without changing the standing height", () => {
    for (const [state, frame, measuredWidth] of [["cast", 9, 374]] as const) {
        expect(angelActionFrameWidthScale(state, frame) * measuredWidth).toBeCloseTo(350, 3);
        expect(angelActionFrameScale(state, frame)).toBe(1);
        expect(angelActionFrameWidthScale(state.replace("melee_attack", "attack"), frame)).toBe(
            angelActionFrameWidthScale(state, frame),
        );
    }
});

test("all strikes preserve the camera scale and register the measured planted sole through idle seams", () => {
    for (const [state, cels] of Object.entries(ANGEL_MELEE_CALIBRATION)) {
        for (let frame = 0; frame < cels.length; frame++) {
            expect(angelActionFrameWidthScale(state, frame)).toBe(1);
            expect(angelActionFrameWidthScale(state.replace("melee_attack", "attack"), frame)).toBe(1);
            for (const divider of [1, 2, 4]) {
                const { trim } = calibratedAngelActionCanvas(1280 / divider, 1024 / divider, state, frame);
                const [x, y] = cels[frame].support;
                expect(trim.x + (x + 256) / divider).toBeCloseTo(cels[0].support[0] / divider, 5);
                expect(trim.y + (y + 128) / divider).toBeCloseTo(cels[0].support[1] / divider, 5);
                expect(trim.width).toBe(1280 / divider);
                expect(trim.height).toBe(1024 / divider);
            }
        }
        expect(angelActionFrameOffset(state, 0)).toEqual([0, 0]);
        expect(angelActionFrameOffset(state, 7)).toEqual([0, 0]);
    }
});
