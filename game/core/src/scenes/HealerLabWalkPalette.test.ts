import { expect, test } from "bun:test";
import { HEALER_LAB_WALK_COLOR_MATRIX } from "./HealerLabWalkPalette";

test("brings measured Healer material samples close to the canonical figure", () => {
    const samples = [
        [
            [189, 154, 133],
            [141, 117, 104],
        ], // robe
        [
            [70, 31, 16],
            [49, 24.5, 12],
        ], // hair
        [
            [232, 146, 116],
            [196, 123, 94],
        ], // face
        [
            [72, 32, 15],
            [44, 21, 9],
        ], // book
        [
            [232, 200, 176],
            [204, 173, 150.5],
        ], // shoulder
        [
            [130, 70, 36],
            [98, 60, 36],
        ], // gold
    ];
    for (const [input, target] of samples) {
        for (let channel = 0; channel < 3; channel++) {
            const offset = channel * 5;
            const corrected = input.reduce(
                (sum, value, i) => sum + value * HEALER_LAB_WALK_COLOR_MATRIX[offset + i],
                255 * HEALER_LAB_WALK_COLOR_MATRIX[offset + 4],
            );
            expect(Math.abs(corrected - target[channel])).toBeLessThan(16);
        }
    }
    expect(HEALER_LAB_WALK_COLOR_MATRIX.slice(15)).toEqual([0, 0, 0, 1, 0]);
});
