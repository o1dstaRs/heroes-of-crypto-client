import { describe, expect, test } from "bun:test";

import { PRESENCE_PING_FOCUSED_MS, PRESENCE_PING_IDLE_MS, presencePingIntervalMs } from "./presenceCadence";

describe("presencePingIntervalMs", () => {
    test("polls briskly only for a tab that is both visible and focused", () => {
        expect(presencePingIntervalMs({ visible: true, focused: true })).toBe(PRESENCE_PING_FOCUSED_MS);
        expect(presencePingIntervalMs({ visible: true, focused: false })).toBe(PRESENCE_PING_IDLE_MS);
        expect(presencePingIntervalMs({ visible: false, focused: true })).toBe(PRESENCE_PING_IDLE_MS);
        expect(presencePingIntervalMs({ visible: false, focused: false })).toBe(PRESENCE_PING_IDLE_MS);
        expect(PRESENCE_PING_FOCUSED_MS).toBeLessThan(PRESENCE_PING_IDLE_MS);
    });
});
