import { describe, expect, it } from "bun:test";

import {
    advanceLoadingProgress,
    displayedLoadingProgress,
    minimumLoadingScreenDurationMs,
    MINIMUM_LOADING_SCREEN_DURATION_MS,
} from "./loadingProgress";

describe("advanceLoadingProgress", () => {
    it("approaches a large asset update over frames without reaching uncompleted work", () => {
        let value = 0;
        for (let frame = 0; frame < 12; frame++) {
            const next = advanceLoadingProgress(value, 0.9, 1000 / 60);
            expect(next).toBeGreaterThan(value);
            expect(next).toBeLessThan(0.9);
            value = next;
        }
        expect(value).toBeGreaterThan(0.7);
    });

    it("moves at the same rate at 30, 60 and 120 Hz", () => {
        const values = [30, 60, 120].map((fps) => {
            let value = 0;
            for (let frame = 0; frame < fps / 5; frame++) value = advanceLoadingProgress(value, 0.8, 1000 / fps);
            return value;
        });
        expect(values[0]).toBeCloseTo(values[1], 10);
        expect(values[1]).toBeCloseTo(values[2], 10);
    });

    it("ignores regressing or invalid reports and caps the jump after a long frame", () => {
        expect(advanceLoadingProgress(0.6, 0.2, 16)).toBe(0.6);
        expect(advanceLoadingProgress(0.6, Number.NaN, 16)).toBe(0.6);
        expect(advanceLoadingProgress(0.6, 0.8, Number.NaN)).toBe(0.6);
        expect(advanceLoadingProgress(0.6, 0.8, -1)).toBe(0.6);
        expect(advanceLoadingProgress(0.2, 0.9, 5000)).toBe(advanceLoadingProgress(0.2, 0.9, 50));
        expect(advanceLoadingProgress(0.2, 0.9, 5000)).toBeLessThan(0.45);
    });

    it("settles exactly at completed work and never overshoots", () => {
        let value = 0.85;
        for (let frame = 0; frame < 120; frame++) value = advanceLoadingProgress(value, 1, 1000 / 60);
        expect(value).toBe(1);
        expect(advanceLoadingProgress(1, 1, 16)).toBe(1);
    });
});

describe("minimumLoadingScreenDurationMs", () => {
    it("keeps the authored reveal in sandbox without delaying ranked screens", () => {
        expect(minimumLoadingScreenDurationMs("Sandbox")).toBe(MINIMUM_LOADING_SCREEN_DURATION_MS);
        expect(minimumLoadingScreenDurationMs("Ranked Play")).toBe(0);
        expect(minimumLoadingScreenDurationMs("Replay")).toBe(0);
    });
});

describe("displayedLoadingProgress", () => {
    it("spreads a fast completed load across the full two-second minimum", () => {
        expect(displayedLoadingProgress(1, 0)).toBe(0);
        expect(displayedLoadingProgress(1, MINIMUM_LOADING_SCREEN_DURATION_MS / 2)).toBe(0.5);
        expect(displayedLoadingProgress(1, MINIMUM_LOADING_SCREEN_DURATION_MS)).toBe(1);
    });

    it("follows actual loading when it takes longer than the minimum", () => {
        expect(displayedLoadingProgress(0.2, MINIMUM_LOADING_SCREEN_DURATION_MS)).toBe(0.2);
        expect(displayedLoadingProgress(0.65, 60_000)).toBe(0.65);
        expect(displayedLoadingProgress(1, 180_000)).toBe(1);
    });

    it("never gets ahead of either time or actual work", () => {
        expect(displayedLoadingProgress(0.25, 1_000)).toBe(0.25);
        expect(displayedLoadingProgress(0.9, 1_000)).toBe(0.5);
    });

    it("clamps invalid and out-of-range inputs", () => {
        expect(displayedLoadingProgress(-1, 1_000)).toBe(0);
        expect(displayedLoadingProgress(2, 4_000)).toBe(1);
        expect(displayedLoadingProgress(Number.NaN, 4_000)).toBe(0);
    });

    it("reports real progress immediately when no minimum duration is requested", () => {
        expect(displayedLoadingProgress(0.42, 0, 0)).toBe(0.42);
        expect(displayedLoadingProgress(1, 0, 0)).toBe(1);
    });
});
