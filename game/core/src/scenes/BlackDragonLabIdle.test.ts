import { expect, test } from "bun:test";
import {
    blackDragonLabIdleFrame,
    BLACK_DRAGON_LAB_IDLE_FRAME_COUNT,
    BLACK_DRAGON_LAB_IDLE_CYCLE_MS,
    BLACK_DRAGON_LAB_BREATH_MS,
} from "./BlackDragonLabIdle";

test("every breath keeps folded wings and emits the chronological smoke sequence while lowering", () => {
    for (let breath = 0; breath < 4; breath++) {
        expect(blackDragonLabIdleFrame(breath * BLACK_DRAGON_LAB_BREATH_MS)).toBe(0);
        for (let frame = 16; frame < 32; frame++)
            expect(blackDragonLabIdleFrame(breath * BLACK_DRAGON_LAB_BREATH_MS + frame * 80)).toBe(frame);
    }
    expect(blackDragonLabIdleFrame(BLACK_DRAGON_LAB_IDLE_CYCLE_MS)).toBe(0);
    for (let t = 0; t < 100000; t += 37) {
        expect(blackDragonLabIdleFrame(t)).toBeGreaterThanOrEqual(0);
        expect(blackDragonLabIdleFrame(t)).toBeLessThan(BLACK_DRAGON_LAB_IDLE_FRAME_COUNT);
        expect(blackDragonLabIdleFrame(t + BLACK_DRAGON_LAB_IDLE_CYCLE_MS)).toBe(blackDragonLabIdleFrame(t));
    }
    for (const t of [-1, NaN, Infinity]) expect(blackDragonLabIdleFrame(t)).toBe(0);
});
