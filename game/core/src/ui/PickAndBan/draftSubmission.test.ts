import { describe, expect, it } from "bun:test";

import { runDraftSubmission } from "./draftSubmission";

describe("runDraftSubmission", () => {
    it("keeps a successful or synchronous submission locked", async () => {
        expect(await runDraftSubmission(() => true)).toBe(true);
        expect(await runDraftSubmission(() => undefined)).toBe(true);
    });

    it("releases the confirmation lock after an authoritative rejection", async () => {
        expect(await runDraftSubmission(() => false)).toBe(false);
    });

    it("releases the confirmation lock after a transport failure", async () => {
        expect(
            await runDraftSubmission(async () => {
                throw new Error("network unavailable");
            }),
        ).toBe(false);
    });
});
