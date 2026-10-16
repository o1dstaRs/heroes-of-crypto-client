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

/** The server's GET reputation-rules response, as published: the slider, and nothing that itemizes it. */
const SERVER_RESPONSE = {
    enforced: false,
    enforceAtMs: 0,
    start: 50,
    bands: { probation: 40, good: 60, honorable: 80 },
    newUntilScored: 10,
    restrictedBlocks: ["wagers", "predictions", "chat"],
};

describe("reputation rules parsing", () => {
    test("the defaults are the published scale, and a full response reads back unchanged", () => {
        expect(DEFAULT_REPUTATION_RULES).toEqual(SERVER_RESPONSE);
        expect(normalizeReputationRules(SERVER_RESPONSE)).toEqual(SERVER_RESPONSE);
        expect(
            normalizeReputationRules({ ...SERVER_RESPONSE, enforced: true, enforceAtMs: 1_790_000_000_000 }),
        ).toEqual({
            ...SERVER_RESPONSE,
            enforced: true,
            enforceAtMs: 1_790_000_000_000,
        });
    });

    /**
     * The owner's rule (19 Sep): only the final slider is public. Nothing on this page, and nothing in what it reads,
     * may say what a match, an abandon or a confirmed email is worth — a player sees that in their own portal.
     */
    test("what itemizes the score is neither read nor kept, even when a server sends it", () => {
        const withItemization = {
            ...SERVER_RESPONSE,
            matchDailyCap: 5,
            points: { match_completed: 1, abandon: -12 },
            ageWeeksMax: 8,
            identityPoints: { email: 4, google: 3, wallet: 4 },
            ceilings: { ai_assistance: 20, win_trading: 0 },
        };
        expect(normalizeReputationRules(withItemization)).toEqual(SERVER_RESPONSE);
        expect(JSON.stringify(DEFAULT_REPUTATION_RULES)).not.toContain("points");
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
            restrictedBlocks: ["chat", "wagers", "queue", 7, "chat"],
        });
        expect(rules).toEqual({
            ...DEFAULT_REPUTATION_RULES,
            bands: { probation: 35, good: 60, honorable: 80 },
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
        // No template tokens: every number is plain text in both languages.
        expect(`${english}\n${text("ru")}`).not.toMatch(/\{\w+\}/);
    });

    /**
     * Owner, 19 Sep: the itemization is not public, only the final slider. The page may print the scale, the bands and
     * the thresholds a player has to know (60% of their turns, 3 reports in 30 days, 90 days of wallet history); it
     * may not print what any event is worth, so no line carries a signed number.
     */
    test("neither language prints what an event is worth", () => {
        for (const language of ["en", "ru"] as const) {
            for (const section of content[language].reputationRules.sections) {
                for (const line of [...section.body, ...section.items]) {
                    expect(line).not.toMatch(/[+−-]\s?\d/);
                }
            }
        }
    });
});
