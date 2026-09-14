import { describe, expect, test } from "bun:test";

import {
    buildReputationRulesUrl,
    DEFAULT_REPUTATION_RULES,
    normalizeReputationRules,
    reputationRulesPath,
    reputationRulesState,
    reputationRulesStatusText,
} from "./reputation-rules";
import { content } from "./site-data";

const DAY_MS = 86_400_000;

/** The server's GET reputation-rules response, as published. */
const SERVER_RESPONSE = {
    enforced: false,
    enforceAtMs: 0,
    start: 50,
    bands: { probation: 40, good: 60, honorable: 80 },
    newUntilScored: 10,
    matchDailyCap: 5,
    points: {
        match_completed: 1,
        abandon: -12,
        low_participation: -4,
        missed_accept: -1,
        report_early: -3,
        report_upheld: -10,
    },
    ageWeeksMax: 8,
    identityPoints: { email: 4, google: 3, wallet: 4 },
    walletMinAgeMs: 7_776_000_000,
    ceilings: { ai_assistance: 20, win_trading: 0 },
    restrictedBlocks: ["wagers", "predictions", "chat"],
    reportsPerDay: 5,
    reportCorroborators: 3,
    reportCorroborationWindowMs: 2_592_000_000,
    reportNoBasisLimit: 5,
    reportNoBasisWindowMs: 2_592_000_000,
    reportMuteMs: 2_592_000_000,
};

describe("reputation rules parsing", () => {
    test("the defaults are the published numbers, and a full response reads back unchanged", () => {
        expect(DEFAULT_REPUTATION_RULES).toEqual(SERVER_RESPONSE);
        expect(DEFAULT_REPUTATION_RULES.walletMinAgeMs).toBe(90 * DAY_MS);
        expect(DEFAULT_REPUTATION_RULES.reportMuteMs).toBe(30 * DAY_MS);
        expect(normalizeReputationRules(SERVER_RESPONSE)).toEqual(SERVER_RESPONSE);
        expect(
            normalizeReputationRules({ ...SERVER_RESPONSE, enforced: true, enforceAtMs: 1_790_000_000_000 }),
        ).toEqual({
            ...SERVER_RESPONSE,
            enforced: true,
            enforceAtMs: 1_790_000_000_000,
        });
    });

    test("an empty object reads as the defaults", () => {
        expect(normalizeReputationRules({})).toEqual(DEFAULT_REPUTATION_RULES);
    });

    test("a response that isn't an object is rejected", () => {
        for (const value of [null, undefined, "nope", 42, [SERVER_RESPONSE]]) {
            expect(normalizeReputationRules(value)).toBeNull();
        }
    });

    test("malformed or out-of-range values keep their defaults; valid neighbours are kept", () => {
        const rules = normalizeReputationRules({
            enforced: "yes",
            enforceAtMs: -5,
            start: 140,
            bands: { probation: 35, good: "60", honorable: Number.NaN },
            newUntilScored: 0,
            matchDailyCap: 3.7,
            points: { abandon: -15, report_upheld: "a lot", match_completed: null },
            ageWeeksMax: -1,
            identityPoints: "none",
            ceilings: { ai_assistance: 101, win_trading: 0 },
            restrictedBlocks: ["chat", "wagers", "queue", 7, "chat"],
            reportsPerDay: Number.POSITIVE_INFINITY,
        });
        expect(rules).toEqual({
            ...DEFAULT_REPUTATION_RULES,
            bands: { probation: 35, good: 60, honorable: 80 },
            matchDailyCap: 3,
            points: { ...DEFAULT_REPUTATION_RULES.points, abandon: -15 },
            restrictedBlocks: ["wagers", "chat"],
        });
    });

    test("a missing block list keeps the published one, and an empty one means nothing is closed", () => {
        expect(normalizeReputationRules({ restrictedBlocks: "chat" })?.restrictedBlocks).toEqual([
            "wagers",
            "predictions",
            "chat",
        ]);
        expect(normalizeReputationRules({ restrictedBlocks: [] })?.restrictedBlocks).toEqual([]);
    });

    test("normalizing never shares nested objects with the defaults", () => {
        const rules = normalizeReputationRules({});
        rules!.bands.honorable = 1;
        rules!.restrictedBlocks.pop();
        expect(DEFAULT_REPUTATION_RULES.bands.honorable).toBe(80);
        expect(DEFAULT_REPUTATION_RULES.restrictedBlocks).toHaveLength(3);
    });
});

describe("reputation rules status", () => {
    const now = Date.UTC(2026, 8, 14);
    const copy = content.en.reputationRules;
    const formatDate = (epochMs: number) => new Date(epochMs).toISOString().slice(0, 10);

    test("the Restricted limits are in effect, dated for later, or not dated yet", () => {
        expect(reputationRulesState({ enforced: true, enforceAtMs: 0 }, now)).toBe("enforced");
        expect(reputationRulesState({ enforced: true, enforceAtMs: Date.UTC(2026, 9, 1) }, now)).toBe("enforced");
        expect(reputationRulesState({ enforced: false, enforceAtMs: Date.UTC(2026, 9, 1) }, now)).toBe("scheduled");
        expect(reputationRulesState({ enforced: false, enforceAtMs: Date.UTC(2026, 8, 1) }, now)).toBe("pending");
        expect(reputationRulesState({ enforced: false, enforceAtMs: 0 }, now)).toBe("pending");
    });

    test("the status line fills the date only when the limits are dated for later", () => {
        const rules = DEFAULT_REPUTATION_RULES;
        expect(reputationRulesStatusText({ ...rules, enforceAtMs: Date.UTC(2026, 9, 1) }, now, copy, formatDate)).toBe(
            "The Restricted limits apply from 2026-10-01.",
        );
        expect(reputationRulesStatusText(rules, now, copy, formatDate)).toBe(
            "The Restricted limits start later: until then your score is shown, but nothing is closed.",
        );
        expect(reputationRulesStatusText({ ...rules, enforced: true }, now, copy, formatDate)).toBe(
            "The Restricted limits are in effect.",
        );
    });
});

describe("reputation rules routes", () => {
    test("builds the production and local API route", () => {
        expect(buildReputationRulesUrl({ baseUrl: "https://mm.test/", production: true })).toBe(
            "https://mm.test/v1/reputation-rules",
        );
        expect(buildReputationRulesUrl({ baseUrl: "http://localhost:3001", production: false })).toBe(
            "http://localhost:3001/v1/mm/reputation-rules",
        );
    });

    test("links the page in each language", () => {
        expect(reputationRulesPath("en")).toBe("/rules/reputation/");
        expect(reputationRulesPath("ru")).toBe("/ru/rules/reputation/");
    });
});

describe("reputation rules copy", () => {
    test("both languages publish the same sections, each with content", () => {
        const english = content.en.reputationRules;
        const russian = content.ru.reputationRules;
        expect(english.sections.length).toBe(8);
        expect(russian.sections.length).toBe(english.sections.length);
        for (const [index, section] of english.sections.entries()) {
            const translated = russian.sections[index];
            expect(translated.body.length).toBe(section.body.length);
            expect(translated.items.length).toBe(section.items.length);
            for (const page of [section, translated]) {
                expect(page.title.length).toBeGreaterThan(0);
                expect(page.body.length + page.items.length).toBeGreaterThan(0);
            }
        }
    });

    test("both languages have every status line, with a date only in the scheduled one", () => {
        for (const language of ["en", "ru"] as const) {
            const page = content[language].reputationRules;
            expect(page.statusPending.length).toBeGreaterThan(0);
            expect(page.statusEnforced.length).toBeGreaterThan(0);
            expect(page.statusScheduled).toContain("{date}");
            expect(page.statusPending).not.toContain("{date}");
            expect(page.statusEnforced).not.toContain("{date}");
            expect(content[language].nav.reputationRules.length).toBeGreaterThan(0);
            expect(content[language].profile.reputationBadgeHonorable.length).toBeGreaterThan(0);
        }
        expect(content.en.nav.reputationRules).toBe("Reputation");
        expect(content.ru.nav.reputationRules).toBe("Репутация");
        expect(content.en.profile.reputationBadgeHonorable).toBe("Honorable");
        expect(content.ru.profile.reputationBadgeHonorable).toBe("Почётная репутация");
    });

    test("the published numbers match the defaults the page mirrors", () => {
        const text = (language: "en" | "ru") =>
            content[language].reputationRules.sections
                .flatMap((section) => [...section.body, ...section.items])
                .join("\n");
        const english = text("en");
        const rules = DEFAULT_REPUTATION_RULES;
        expect(english).toContain(`Everyone starts at ${rules.start}.`);
        expect(english).toContain(`Honorable, ${rules.bands.honorable}–100`);
        expect(english).toContain(`Restricted, 0–${rules.bands.probation - 1}`);
        expect(english).toContain(`first ${rules.newUntilScored} ranked matches`);
        expect(english).toContain(`−${-rules.points.abandon} for abandoning`);
        expect(english).toContain(`caps your Reputation at ${rules.ceilings.ai_assistance}`);
        // No template tokens: every number is plain text in both languages.
        expect(`${english}\n${text("ru")}`).not.toMatch(/\{\w+\}/);
    });
});
