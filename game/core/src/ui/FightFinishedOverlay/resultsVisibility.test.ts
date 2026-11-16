import { expect, test } from "bun:test";
import { canShowFightResults } from "./resultsVisibility";

test("results remain hidden until replay playback has finished, then reopen on its final frame", () => {
    expect(canShowFightResults({ hasFinished: true, replayPlaybackActive: false }, false)).toBe(true);
    expect(canShowFightResults({ hasFinished: true, replayPlaybackActive: true }, false)).toBe(false);
    expect(canShowFightResults({ hasFinished: false, replayPlaybackActive: true }, false)).toBe(false);
    expect(canShowFightResults({ hasFinished: true, replayPlaybackActive: false }, false)).toBe(true);
    expect(canShowFightResults({ hasFinished: true, replayPlaybackActive: false }, true)).toBe(false);
});
