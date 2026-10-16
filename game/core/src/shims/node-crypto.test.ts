import { createHash as nodeCreateHash } from "node:crypto";

import { describe, expect, it } from "bun:test";

import { createHash as browserCreateHash } from "./node-crypto";

const samples = ["", "abc", "The quick brown fox jumps over the lazy dog", '{"key":"ild-v3-wf","names":["a","b"]}'];

describe("browser sha256 shim", () => {
    it("matches node:crypto for the dataset fingerprint shape", () => {
        for (const sample of samples) {
            expect(browserCreateHash("sha256").update(sample).digest("hex")).toBe(
                nodeCreateHash("sha256").update(sample).digest("hex"),
            );
        }
    });

    it("rejects the hash and digest forms the search import does not use", () => {
        expect(() => browserCreateHash("md5")).toThrow("sha256");
        expect(() => browserCreateHash("sha256").digest("base64" as "hex")).toThrow("hex");
    });
});
