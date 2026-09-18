import { describe, expect, test } from "bun:test";

import { PRIZE_REVIEW_DAYS, prizeRulesPath } from "./prize-rules";
import { content } from "./site-data";

describe("season prize rules routes", () => {
    test("links the page in each language", () => {
        expect(prizeRulesPath("en")).toBe("/rules/prizes/");
        expect(prizeRulesPath("ru")).toBe("/ru/rules/prizes/");
    });
});

describe("season prize rules copy", () => {
    test("both languages publish the same sections, each with content", () => {
        const english = content.en.prizeRules;
        const russian = content.ru.prizeRules;
        expect(english.sections.length).toBe(4);
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

    test("both languages have a title, an intro and every link label", () => {
        for (const language of ["en", "ru"] as const) {
            const page = content[language].prizeRules;
            for (const line of [
                page.title,
                page.eyebrow,
                page.description,
                page.intro,
                page.relatedTitle,
                page.relatedLeaving,
                page.relatedReputation,
                page.relatedTerms,
            ]) {
                expect(line.length).toBeGreaterThan(0);
            }
            expect(content[language].nav.prizeRules.length).toBeGreaterThan(0);
        }
        expect(content.en.prizeRules.title).toBe("Season prizes");
        expect(content.ru.prizeRules.title).toBe("Призы сезона");
        expect(content.en.nav.prizeRules).toBe("Season prizes");
        expect(content.ru.nav.prizeRules).toBe("Призы сезона");
    });

    test("the published rules say what the server does", () => {
        const text = (language: "en" | "ru") =>
            content[language].prizeRules.sections.flatMap((section) => [...section.body, ...section.items]).join("\n");
        const english = text("en");
        expect(english).toContain("Prize places follow the gold table, the season's main result");
        expect(english).toContain("Your rating (MMR) place doesn't decide prizes.");
        expect(english).toContain("Wins over the ranked bots count like any other win.");
        expect(english).toContain("finished your calibration matches");
        expect(english).toContain("exactly one wallet linked to your account");
        expect(english).toContain("never have been linked to another account");
        expect(english).toContain("no minimum number of matches, opponents or account age");
        expect(english).toContain(`provisional for ${PRIZE_REVIEW_DAYS} days`);
        expect(english).toContain("stays empty; nobody moves up into it");
        expect(english).toContain("One named admin approves the final list");
        expect(english).toContain("held by the season's smart contract");
        expect(english).toContain("The game itself never sends tokens.");
        // The review window is the same number in Russian, and every number is plain text in both languages.
        expect(text("ru")).toContain(`${PRIZE_REVIEW_DAYS} дня`);
        expect(`${english}\n${text("ru")}`).not.toMatch(/\{\w+\}/);
    });

    test("the results page tells players about a season's prize pool in both languages", () => {
        for (const language of ["en", "ru"] as const) {
            const page = content[language].seasons;
            expect(page.prizeUnderReview).toContain("{date}");
            expect(page.prizePlacesTitle.length).toBeGreaterThan(0);
        }
        expect(content.en.seasons.prizeUnderReview).toBe("Prize places are under review until {date}");
        expect(content.ru.seasons.prizeUnderReview).toBe("Призовые места проверяются до {date}");
    });
});
