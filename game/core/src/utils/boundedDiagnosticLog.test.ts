import { describe, expect, test } from "bun:test";

import { appendBoundedDiagnosticLine } from "./boundedDiagnosticLog";

describe("appendBoundedDiagnosticLine", () => {
    test("keeps the newest entries within the requested bound", () => {
        const lines = ["oldest", "middle", "newest"];

        appendBoundedDiagnosticLine(lines, "latest", 3);

        expect(lines).toEqual(["middle", "newest", "latest"]);
    });

    test("repairs an already oversized diagnostic buffer in one append", () => {
        const lines = ["one", "two", "three", "four"];

        appendBoundedDiagnosticLine(lines, "five", 2);

        expect(lines).toEqual(["four", "five"]);
    });
});
