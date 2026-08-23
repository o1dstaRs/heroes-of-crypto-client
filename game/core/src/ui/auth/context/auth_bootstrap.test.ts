import { describe, expect, test } from "bun:test";

import { createAuthBootstrapGate, shouldBootstrapFromStorageEvent } from "./auth_bootstrap";

describe("auth bootstrap generation gate", () => {
    test("only the newest active attempt may update auth state", () => {
        const gate = createAuthBootstrapGate();
        gate.activate();

        const oldAttempt = gate.begin();
        const newAttempt = gate.begin();

        expect(gate.isCurrent(oldAttempt)).toBe(false);
        expect(gate.isCurrent(newAttempt)).toBe(true);
    });

    test("unmount invalidates an in-flight attempt", () => {
        const gate = createAuthBootstrapGate();
        gate.activate();
        const attempt = gate.begin();

        gate.deactivate();

        expect(gate.isCurrent(attempt)).toBe(false);
    });
});

describe("auth storage events", () => {
    test("reacts only to access-token changes and storage clears", () => {
        expect(shouldBootstrapFromStorageEvent("accessToken")).toBe(true);
        expect(shouldBootstrapFromStorageEvent(null)).toBe(true);
        expect(shouldBootstrapFromStorageEvent("volume")).toBe(false);
    });
});
