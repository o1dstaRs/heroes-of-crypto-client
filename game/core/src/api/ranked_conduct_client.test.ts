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

    test("parses a lock, its matches and the appeal, and drops malformed ones", () => {
        const conduct = normalizeRankedConduct({
            lockRulesEnforced: true,
            lock: { level: 2, reason: "in_a_row", startedAt: 10, until: 20, gameIds: ["g1", 7, "g2"] },
            abandonStreak: 3,
            lockGames: [
                { gameId: "g1", finishedTime: 5, opponentUsername: "Karsk", phase: "fight", boardBp: 1200, lap: 2 },
                { nope: 1 },
            ],
            appeal: { status: "pending", note: "", createdAt: 11, decidedAt: 0 },
            appealMutedUntil: 0,
            rules: { version: "1.0", lockRulesEnforced: true, lockRulesEnforceAtMs: 9, appealMinChars: 30 },
        });
        expect(conduct.lock).toEqual({ level: 2, reason: "in_a_row", startedAt: 10, until: 20, gameIds: ["g1", "g2"] });
        expect(conduct.lockGames).toHaveLength(1);
        expect(conduct.lockGames[0]).toMatchObject({
            gameId: "g1",
            opponentUsername: "Karsk",
            reason: "",
            boardBp: 1200,
        });
        expect(conduct.appeal?.status).toBe("pending");
        expect(conduct.rules).toMatchObject({
            lockRulesEnforced: true,
            lockRulesEnforceAtMs: 9,
            appealMinChars: 30,
            appealMaxChars: 1000,
        });

        const broken = normalizeRankedConduct({ lock: { level: 4, reason: "in_a_row" }, appeal: { status: "maybe" } });
        expect(broken.lock).toBeNull();
        expect(broken.appeal).toBeNull();
        expect(broken.lockRulesEnforced).toBe(false);
        expect(normalizeRankedConduct({ lock: { level: 1, reason: "whim", until: 5 } }).lock).toBeNull();
    });

    test("the rules card is due only for a version the player hasn't acknowledged", () => {
        const conduct = normalizeRankedConduct({ rules: { version: "1.0", acceptedVersion: "" } });
        expect(rulesCardDue(conduct)).toBe(true);
        expect(rulesCardDue({ ...conduct, rules: { ...conduct.rules, acceptedVersion: "1.0" } })).toBe(false);
        expect(rulesCardDue(normalizeRankedConduct({}))).toBe(false);
        expect(rulesCardDue(undefined)).toBe(false);
    });
});
