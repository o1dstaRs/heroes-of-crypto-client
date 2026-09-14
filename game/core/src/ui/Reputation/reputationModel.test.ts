import { afterEach, describe, expect, it } from "bun:test";

import {
    reputationAccountLines,
    reputationBandLabel,
    reputationLimitsText,
    reputationLogText,
    reputationPoints,
} from "./reputationModel";
import { DEFAULT_REPUTATION_RULES, normalizeReputation, type ReputationLogEntry } from "../../api/reputation_client";
import { DEFAULT_LANGUAGE, setLanguage } from "../../i18n/i18n";

const entry = (overrides: Partial<ReputationLogEntry>): ReputationLogEntry => ({
    at: 1,
    kind: "match_completed",
    points: 1,
    gameId: "g1",
    note: "",
    reverted: false,
    opponentUsername: "Mira",
    ...overrides,
});

afterEach(() => {
    setLanguage(DEFAULT_LANGUAGE);
});

describe("reputation model", () => {
    it("parses the server's view and falls back to a fresh account for a malformed body", () => {
        const view = normalizeReputation({
            score: 72,
            band: "good",
            isNew: false,
            scoredMatches: 31,
            parts: { ledger: 61, accountAge: 4, email: 4, google: 3, wallet: 0 },
            restricted: false,
            log: [
                { at: 5, kind: "abandon", points: -12, gameId: "g2", opponentUsername: "Karsk" },
                { at: 4, kind: "nonsense" },
            ],
            rules: { enforced: false, bands: { probation: 40, good: 60, honorable: 80 } },
        });
        expect(view).toMatchObject({ score: 72, band: "good", isNew: false, scoredMatches: 31 });
        expect(view.log).toHaveLength(1);
        expect(view.rules.points.abandon).toBe(-12);
        expect(normalizeReputation("nope")).toMatchObject({ score: 50, band: "probation", isNew: true, log: [] });
    });

    it("words each change, and marks returned points and the daily limit", () => {
        expect(reputationLogText(entry({}))).toBe("Finished a ranked match vs Mira");
        expect(reputationLogText(entry({ kind: "abandon", points: -12, opponentUsername: "Karsk" }))).toBe(
            "Abandoned a ranked match vs Karsk",
        );
        expect(reputationLogText(entry({ kind: "abandon", points: 0, reverted: true }))).toBe(
            "Abandoned a ranked match vs Mira · points returned",
        );
        expect(reputationLogText(entry({ points: 0 }))).toBe(
            "Finished a ranked match vs Mira · daily limit of 5 reached",
        );
        expect(reputationLogText(entry({ kind: "missed_accept", points: -1, opponentUsername: "" }))).toBe(
            "Didn't confirm a found match in time",
        );
        expect(reputationLogText(entry({ kind: "adjust", points: 7, note: "server bug" }))).toBe(
            "Adjusted by a reviewer: server bug",
        );
    });

    it("prints points with a real minus sign and names the bands", () => {
        expect([reputationPoints(1), reputationPoints(-12), reputationPoints(0)]).toEqual(["+1", "−12", "0"]);
        expect(reputationBandLabel("honorable")).toBe("Honorable");
        setLanguage("ru");
        expect(reputationBandLabel("restricted")).toBe("Ограниченная");
    });

    it("lists the account bonuses with the ones still open, and the Restricted limits only when they apply", () => {
        const lines = reputationAccountLines(
            { parts: { ledger: 50, accountAge: 3, email: 4, google: 0, wallet: 0 } },
            DEFAULT_REPUTATION_RULES,
        );
        expect(lines.map((line) => [line.points, line.earned])).toEqual([
            [3, true],
            [4, true],
            [3, false],
            [4, false],
        ]);
        expect(reputationLimitsText({ restricted: false, score: 70 }, DEFAULT_REPUTATION_RULES)).toBe("");
        expect(reputationLimitsText({ restricted: true, score: 30 }, DEFAULT_REPUTATION_RULES)).toContain("will close");
        expect(
            reputationLimitsText({ restricted: true, score: 30 }, { ...DEFAULT_REPUTATION_RULES, enforced: true }),
        ).toContain("are closed");
    });
});
