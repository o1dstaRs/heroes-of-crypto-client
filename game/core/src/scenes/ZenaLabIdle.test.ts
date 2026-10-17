import { expect, test } from "bun:test";
import { zenaLabIdleFrame, ZENA_IDLE_SHARPEN_DURATIONS_MS } from "./ZenaLabIdle";

test("wind follows the amount flag clock, including negative and wrapped phases", () => {
    for (let i = 0; i < 24; i++) {
        const now = ((i + 0.1) / 24) * ((Math.PI * 2) / 2.6) * 1000;
        expect(zenaLabIdleFrame(now, now, 0, 2.6)).toBe(i);
        expect(zenaLabIdleFrame(now, now, Math.PI * 4, 2.6)).toBe(i);
    }
    expect(zenaLabIdleFrame(0, 0, 0.01, 2.6)).toBe(23);
});

test("slow top-rim scrape lasts two seconds inside a three-second action, recurring every five seconds", () => {
    const start = 1234;
    expect(zenaLabIdleFrame(start + 4999, start, 0, 2.6)).toBeLessThan(24);
    for (const cycle of [1, 2, 3]) {
        const actionStart = start + cycle * 5000;
        expect(zenaLabIdleFrame(actionStart + 460, start, 0, 2.6)).toBe(30);
        expect(zenaLabIdleFrame(actionStart + 2459, start, 0, 2.6)).toBe(45);
        expect(zenaLabIdleFrame(actionStart + 2460, start, 0, 2.6)).toBe(46);
        expect(zenaLabIdleFrame(actionStart + 2999, start, 0, 2.6)).toBe(51);
        expect(zenaLabIdleFrame(actionStart + 3000, start, 0, 2.6)).toBeLessThan(24);
        let offset = 0;
        for (const [frame, duration] of ZENA_IDLE_SHARPEN_DURATIONS_MS.entries()) {
            expect(zenaLabIdleFrame(actionStart + offset, start, 0, 2.6)).toBe(24 + frame * 2);
            expect(zenaLabIdleFrame(actionStart + offset + duration - 1, start, 0, 2.6)).toBe(25 + frame * 2);
            offset += duration;
        }
    }
    const returnFromWalk = start + 5700;
    expect(zenaLabIdleFrame(returnFromWalk, returnFromWalk, 0, 2.6)).toBeLessThan(24);
    expect(zenaLabIdleFrame(returnFromWalk + 5000, returnFromWalk, 0, 2.6)).toBe(24);
});
