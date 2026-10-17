import { expect, test } from "bun:test";
import {
    behemothIdleFrame,
    BEHEMOTH_IDLE_CHEST_CONTACTS_MS,
    BEHEMOTH_IDLE_FRAME_COUNT,
    BEHEMOTH_IDLE_FRAME_MS,
    BEHEMOTH_IDLE_PERIOD_MS,
} from "./BehemothLabIdle";

test("Behemoth loops all grounded idle frames without any chest-strike phase", () => {
    expect(BEHEMOTH_IDLE_CHEST_CONTACTS_MS).toEqual([]);
    expect(BEHEMOTH_IDLE_FRAME_COUNT).toBe(32);
    expect(BEHEMOTH_IDLE_FRAME_MS).toBeCloseTo(100 / 1.4 / 1.3 / 1.2, 8);
    for (let cycle = 0; cycle < 4; cycle++) {
        for (let frame = 0; frame < BEHEMOTH_IDLE_FRAME_COUNT; frame++) {
            const start = cycle * BEHEMOTH_IDLE_PERIOD_MS + frame * BEHEMOTH_IDLE_FRAME_MS;
            expect(behemothIdleFrame(start)).toBe(frame);
            expect(behemothIdleFrame(start + BEHEMOTH_IDLE_FRAME_MS - 0.001)).toBe(frame);
        }
    }
    expect(behemothIdleFrame(-1)).toBe(0);
    expect(behemothIdleFrame(Number.NaN)).toBe(0);
});
