import { describe, expect, test } from "bun:test";

import { createPremiumRequestGate } from "./premiumRequestGate";

describe("Premium request ordering", () => {
    test("a slow poll is allowed to finish instead of being superseded every interval", () => {
        const gate = createPremiumRequestGate();
        const poll = gate.begin("read")!;
        expect(gate.begin("read")).toBeUndefined();
        expect(gate.isCurrent(poll)).toBe(true);
        expect(gate.finish(poll)).toBe(true);
        expect(gate.begin("read")).toBeDefined();
    });

    test("an apply supersedes the old poll, blocks duplicate clicks, and resumes polling on completion", () => {
        const gate = createPremiumRequestGate();
        const poll = gate.begin("read")!;
        const apply = gate.begin("apply")!;
        expect(gate.isCurrent(poll)).toBe(false);
        expect(gate.finish(poll)).toBe(false);
        expect(gate.begin("apply")).toBeUndefined();
        expect(gate.begin("read")).toBeUndefined();
        expect(gate.isCurrent(apply)).toBe(true);
        expect(gate.finish(apply)).toBe(true);
        expect(gate.begin("read")).toBeDefined();
    });

    test("a response from the previous match or account cannot publish or unlock a newer request", () => {
        const gate = createPremiumRequestGate();
        const previous = gate.begin("apply")!;
        gate.reset();
        const next = gate.begin("apply")!;
        expect(gate.isCurrent(previous)).toBe(false);
        expect(gate.finish(previous)).toBe(false);
        expect(gate.isCurrent(next)).toBe(true);
        gate.reset();
        expect(gate.isCurrent(next)).toBe(false);
    });
});
