import { describe, expect, test } from "bun:test";

import { EVENT_STREAM_RETRY_MS, SPECTATORS_FULL_RETRY_MS, eventStreamRetryDelayMs } from "./eventStreamRetry";

describe("live event stream reconnect delay", () => {
    test("backs off when the game is full of spectators", () => {
        expect(eventStreamRetryDelayMs(429)).toBe(SPECTATORS_FULL_RETRY_MS);
        expect(SPECTATORS_FULL_RETRY_MS).toBeGreaterThan(EVENT_STREAM_RETRY_MS);
    });

    test("reconnects quickly after an ordinary drop", () => {
        for (const status of [0, 500, 502, 503]) {
            expect(eventStreamRetryDelayMs(status)).toBe(EVENT_STREAM_RETRY_MS);
        }
    });
});
