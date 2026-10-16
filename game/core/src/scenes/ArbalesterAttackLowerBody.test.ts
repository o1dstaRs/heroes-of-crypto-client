import { describe, expect, test } from "bun:test";
import { ARBALESTER_LOWER_BODY_DATA, ARBALESTER_LOWER_PROTECTION } from "./ArbalesterAttackLowerBodyData";
import { ARBALESTER_LOWER_ROWS, arbalesterAttackLowerBodyFrame } from "./ArbalesterAttackLowerBody";

describe("Arbalester leather-panel registration", () => {
    test("changes only the intermediate panel target while preserving source, knee, boot and weapon anchors", () => {
        for (const [state, frames] of Object.entries(ARBALESTER_LOWER_BODY_DATA)) {
            frames.forEach((rows, index) => {
                const frame = arbalesterAttackLowerBodyFrame(state, index + 1)!;
                expect(frame).toBeDefined();
                expect(frame.source).toEqual(new Float32Array(rows.flatMap((row) => row.slice(0, 4))));
                expect(frame.protection).toEqual(new Float32Array(ARBALESTER_LOWER_PROTECTION[state][index].flat()));
                rows.forEach((row, rowIndex) => {
                    if (rowIndex === 1) return;
                    expect(frame.target.slice(rowIndex * 4, rowIndex * 4 + 4)).toEqual(
                        new Float32Array(row.slice(4, 8)),
                    );
                });
                for (let anchor = 0; anchor < 4; anchor++) {
                    const waist = frame.source[anchor] - frame.target[anchor];
                    const knee = frame.source[8 + anchor] - frame.target[8 + anchor];
                    const panel = frame.source[4 + anchor] - frame.target[4 + anchor];
                    expect(panel).toBeCloseTo(waist + ((knee - waist) * 30) / 70, 4);
                }
            });
        }
    });

    test("retains positive horizontal intervals throughout the entire panel band", () => {
        for (const state of Object.keys(ARBALESTER_LOWER_BODY_DATA)) {
            for (let frameIndex = 1; frameIndex <= 10; frameIndex++) {
                const frame = arbalesterAttackLowerBodyFrame(state, frameIndex)!;
                for (let row = 0; row < 2; row++) {
                    for (let y = ARBALESTER_LOWER_ROWS[row]; y <= ARBALESTER_LOWER_ROWS[row + 1]; y++) {
                        const f =
                            (y - ARBALESTER_LOWER_ROWS[row]) /
                            (ARBALESTER_LOWER_ROWS[row + 1] - ARBALESTER_LOWER_ROWS[row]);
                        for (let anchor = 0; anchor < 3; anchor++) {
                            const sourceGap =
                                (frame.source[row * 4 + anchor + 1] - frame.source[row * 4 + anchor]) * (1 - f) +
                                (frame.source[(row + 1) * 4 + anchor + 1] - frame.source[(row + 1) * 4 + anchor]) * f;
                            const targetGap =
                                (frame.target[row * 4 + anchor + 1] - frame.target[row * 4 + anchor]) * (1 - f) +
                                (frame.target[(row + 1) * 4 + anchor + 1] - frame.target[(row + 1) * 4 + anchor]) * f;
                            expect(sourceGap).toBeGreaterThan(0);
                            expect(targetGap).toBeGreaterThan(0);
                        }
                    }
                }
            }
        }
    });

    test("keeps the exact idle endpoints outside the lower-body filter", () => {
        for (const state of Object.keys(ARBALESTER_LOWER_BODY_DATA)) {
            for (const frame of [0, 11, -1, 12, 1.5, Number.NaN]) {
                expect(arbalesterAttackLowerBodyFrame(state, frame)).toBeUndefined();
            }
        }
    });
});
