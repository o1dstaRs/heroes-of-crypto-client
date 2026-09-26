import { expect, test } from "bun:test";
import { whiteTigerTailOffset, WHITE_TIGER_TAIL_SPEED } from "./WhiteTigerIdleTail";

test("White Tiger tail wave leaves the body, root and paw contacts fixed", () => {
    for (const time of [0, 350, 900, 1985.714, 3200, 10000]) {
        for (const [x, y] of [
            [190, 540],
            [300, 500],
            [600, 420],
            [155, 720],
            [575, 741],
        ]) {
            expect(whiteTigerTailOffset(x, y, time)).toEqual([0, 0]);
        }
    }
});

test("White Tiger tail is smooth through idle loop boundaries and continues during holds", () => {
    const end = 2780 / 4.2 / 0.8;
    const before = whiteTigerTailOffset(55, 525, end - 0.01);
    const after = whiteTigerTailOffset(55, 525, end + 0.01);
    expect(Math.abs(after[1] - before[1])).toBeLessThan(0.002);
    expect(whiteTigerTailOffset(55, 525, 100)[1]).not.toBeCloseTo(whiteTigerTailOffset(55, 525, 300)[1]);
    const period = (Math.PI * 2 * 1000) / WHITE_TIGER_TAIL_SPEED;
    expect(whiteTigerTailOffset(55, 525, period + 123)[1]).toBeCloseTo(whiteTigerTailOffset(55, 525, 123)[1]);
});
