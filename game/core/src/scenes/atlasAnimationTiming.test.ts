import { describe, expect, it } from "bun:test";

import { buildAtlasPingPongTiming, type AtlasMeta } from "./atlasAnimationTiming";

// Minimal atlas metadata for the timing math. Only layout/frameCount/duration fields are read by
// buildAtlasPingPongTiming; the rest of AtlasMeta (pixel sizes) is irrelevant here, hence the cast.
function makeMeta(overrides: Partial<Record<string, unknown>> = {}): AtlasMeta {
    return {
        frameWidth: 512,
        frameHeight: 512,
        atlasWidth: 5120,
        atlasHeight: 512,
        frameCount: 10,
        fps: 12,
        totalDurationSec: 1,
        layout: { cols: 10, rows: 1 },
        loopDurationMs: 1000,
        pauseMs: 200,
        ...overrides,
    } as unknown as AtlasMeta;
}

describe("buildAtlasPingPongTiming", () => {
    it("exposes the atlas layout and a deterministic cycle length", () => {
        const t = buildAtlasPingPongTiming(makeMeta());
        expect(t.cols).toBe(10);
        expect(t.rows).toBe(1);
        expect(t.frameCount).toBe(10);
        // cycle = forward (1000) + hold (200) + backward (1000) + hold (200).
        expect(t.cycleMs).toBe(2400);
    });

    it("ping-pongs forward → hold-at-end → backward → hold-at-start across the cycle", () => {
        const { frameForElapsed } = buildAtlasPingPongTiming(makeMeta());
        expect(frameForElapsed(0)).toBe(0); // start
        expect(frameForElapsed(500)).toBe(5); // mid forward
        expect(frameForElapsed(1000)).toBe(9); // reached last frame
        expect(frameForElapsed(1100)).toBe(9); // holding on the last frame
        expect(frameForElapsed(1700)).toBe(4); // mid backward
        expect(frameForElapsed(2300)).toBe(0); // holding on the first frame again
    });

    it(
        "is periodic and a pure function of ABSOLUTE time — this is what phase-locks the board sprite " +
            "and the sidebar portrait (both feed it the same wall clock)",
        () => {
            const { frameForElapsed, cycleMs } = buildAtlasPingPongTiming(makeMeta());
            for (const t of [0, 137, 500, 1000, 1234, 2100]) {
                // Same instant one (and two) full cycles later → identical frame. Because both views call
                // this with timestamps off the same time origin (performance.now() / rAF), they never drift.
                expect(frameForElapsed(t)).toBe(frameForElapsed(t + cycleMs));
                expect(frameForElapsed(t)).toBe(frameForElapsed(t + 2 * cycleMs));
            }
        },
    );

    it("guards negative timestamps (never returns NaN / out-of-range)", () => {
        const { frameForElapsed, cycleMs, frameCount } = buildAtlasPingPongTiming(makeMeta());
        const f = frameForElapsed(-100);
        expect(Number.isInteger(f)).toBe(true);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(frameCount - 1);
        // A negative time is the same phase as the equivalent positive offset within the cycle.
        expect(frameForElapsed(-100)).toBe(frameForElapsed(cycleMs - 100));
    });

    it("returns frame 0 for a single-frame (degenerate) atlas", () => {
        const { frameForElapsed } = buildAtlasPingPongTiming(makeMeta({ frameCount: 1, layout: { cols: 1, rows: 1 } }));
        expect(frameForElapsed(0)).toBe(0);
        expect(frameForElapsed(999)).toBe(0);
    });

    it("derives timing from fps/duration when loopDurationMs/pauseMs are absent", () => {
        // baseTotalMs = totalDurationSec*1000 = 1000; loop = round(1000*0.8)=800; pause = round(800*0.4)=320.
        const { cycleMs } = buildAtlasPingPongTiming(
            makeMeta({ loopDurationMs: undefined, pauseMs: undefined, totalDurationSec: 1 }),
        );
        expect(cycleMs).toBe(800 * 2 + 320 * 2);
    });
});
