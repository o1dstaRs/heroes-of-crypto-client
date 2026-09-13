import { describe, expect, test } from "bun:test";

import { normalizeRankedConduct, rulesCardDue } from "./ranked_conduct_client";

describe("ranked conduct client", () => {
    test("parses the server's record and falls back to the published defaults for missing fields", () => {
        const conduct = normalizeRankedConduct({
            calibrating: true,
            serialLeaves: 2,
            abandonCooldownUntil: 1_234,
            rules: { version: "1.0", acceptedVersion: "", enforced: false, enforceAtMs: 0 },
        });
        expect(conduct).toMatchObject({
            calibrating: true,
            serialLeaves: 2,
            serialLeaveLimit: 3,
            abandonCooldownUntil: 1_234,
        });
        expect(conduct.rules).toMatchObject({
            version: "1.0",
            enforced: false,
            absenceBudgetMs: 300_000,
            afkMissedTurns: 4,
        });
        expect(normalizeRankedConduct("not json").rules.version).toBe("");
    });

    test("the rules card is due only for a version the player hasn't acknowledged", () => {
        const conduct = normalizeRankedConduct({ rules: { version: "1.0", acceptedVersion: "" } });
        expect(rulesCardDue(conduct)).toBe(true);
        expect(rulesCardDue({ ...conduct, rules: { ...conduct.rules, acceptedVersion: "1.0" } })).toBe(false);
        expect(rulesCardDue(normalizeRankedConduct({}))).toBe(false);
        expect(rulesCardDue(undefined)).toBe(false);
    });
});
