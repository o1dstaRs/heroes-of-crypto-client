import { describe, expect, it } from "bun:test";

import {
    displayedLoadingProgress,
    minimumLoadingScreenDurationMs,
    MINIMUM_LOADING_SCREEN_DURATION_MS,
} from "./loadingProgress";

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
