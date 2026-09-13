import { describe, expect, test } from "bun:test";

import { allowClientErrorReport, clientErrorPayload } from "./clientErrorReport";

describe("client error reports", () => {
    test("shape an Error, a string and an odd value", () => {
        const fromError = clientErrorPayload(new Error("boom"), "react", "/sandbox/x", 5);
        expect(fromError.message).toBe("boom");
        expect(fromError.stack).toContain("boom");
        expect(fromError.context).toBe("/sandbox/x");
        expect(fromError.at).toBe(5);
        expect(clientErrorPayload("plain", "window").message).toBe("plain");
        expect(clientErrorPayload({ code: 7 }, "unhandledrejection").message).toBe('{"code":7}');
    });

    test("at most six reports per sliding minute", () => {
        const sent: number[] = [];
        for (let i = 0; i < 6; i++) {
            expect(allowClientErrorReport(1_000 + i, sent)).toBe(true);
        }
        expect(allowClientErrorReport(2_000, sent)).toBe(false);
        expect(allowClientErrorReport(1_000 + 60_001, sent)).toBe(true);
    });
});
