import { afterEach, describe, expect, it } from "bun:test";

import { reputationBandLabel, reputationBarPct, reputationLimitsText } from "./reputationModel";
import { DEFAULT_REPUTATION_RULES, normalizeReputation } from "../../api/reputation_client";
import { DEFAULT_LANGUAGE, setLanguage } from "../../i18n/i18n";

afterEach(() => {
    setLanguage(DEFAULT_LANGUAGE);
});

describe("reputation model", () => {
    it("parses the server's view and falls back to a fresh account for a malformed body", () => {
        const view = normalizeReputation({
            score: 72,
            band: "good",
            isNew: false,
            restricted: false,
            rules: { enforced: false, bands: { probation: 40, good: 60, honorable: 80 } },
        });
        expect(view).toEqual({
            score: 72,
            band: "good",
            isNew: false,
            restricted: false,
            rules: DEFAULT_REPUTATION_RULES,
        });
        expect(normalizeReputation("nope")).toMatchObject({ score: 50, band: "probation", isNew: true });
    });

    /**
     * Owner, 20 Sep: the portal shows the final score, never what makes it up. The server stopped sending the
     * ledger and the account parts; this pins that a client cannot resurrect them from a response that still
     * carries them — a field parsed here is a field the page (and devtools) can read.
     */
    it("keeps nothing that itemizes the score, even from a server that still sends it", () => {
        const view = normalizeReputation({
            score: 69,
            band: "good",
            isNew: false,
            restricted: false,
            scoredMatches: 31,
            ceiling: 20,
            parts: { ledger: 61, accountAge: 8, email: 4, google: 3, wallet: 0 },
            log: [{ at: 5, kind: "abandon", points: -12, gameId: "g2", opponentUsername: "Karsk" }],
            rules: { points: { abandon: -12 }, identityPoints: { email: 4 }, matchDailyCap: 5 },
        });

        expect(Object.keys(view).sort()).toEqual(["band", "isNew", "restricted", "rules", "score"]);
        expect(Object.keys(view.rules).sort()).toEqual([
            "bands",
            "enforceAtMs",
            "enforced",
            "newUntilScored",
            "restrictedBlocks",
            "start",
        ]);
        expect(JSON.stringify(view)).not.toContain("-12");
    });

    it("names the bands in the player's language and places the marker on the bar", () => {
        expect(reputationBandLabel("honorable")).toBe("Honorable");
        expect([reputationBarPct(-5), reputationBarPct(69), reputationBarPct(140)]).toEqual([0, 69, 100]);
        setLanguage("ru");
        expect(reputationBandLabel("restricted")).toBe("Ограниченная");
    });

    it("spells out the Restricted limits only when they apply", () => {
        expect(reputationLimitsText({ restricted: false, score: 70 }, DEFAULT_REPUTATION_RULES)).toBe("");
        expect(reputationLimitsText({ restricted: true, score: 30 }, DEFAULT_REPUTATION_RULES)).toContain("will close");
        expect(
            reputationLimitsText({ restricted: true, score: 30 }, { ...DEFAULT_REPUTATION_RULES, enforced: true }),
        ).toContain("are closed");
    });
});
