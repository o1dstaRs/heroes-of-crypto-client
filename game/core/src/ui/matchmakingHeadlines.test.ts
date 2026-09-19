import { describe, expect, it } from "bun:test";

import { RU_TRANSLATIONS } from "../i18n/ru";
import { SEARCH_HEADLINES, SEARCH_HEADLINE_SECONDS, searchHeadline } from "./matchmakingHeadlines";

describe("ranked search headlines", () => {
    it("opens on the line players already know", () => {
        expect(SEARCH_HEADLINES[0]).toBe("Scouting for a worthy rival");
        expect(searchHeadline(0)).toBe(SEARCH_HEADLINES[0]);
        expect(searchHeadline(SEARCH_HEADLINE_SECONDS - 0.1)).toBe(SEARCH_HEADLINES[0]);
    });

    it("moves to the next line every rotation and wraps around", () => {
        expect(searchHeadline(SEARCH_HEADLINE_SECONDS)).toBe(SEARCH_HEADLINES[1]);
        expect(searchHeadline(SEARCH_HEADLINE_SECONDS * 2)).toBe(SEARCH_HEADLINES[2]);
        expect(searchHeadline(SEARCH_HEADLINE_SECONDS * (SEARCH_HEADLINES.length - 1))).toBe(
            SEARCH_HEADLINES[SEARCH_HEADLINES.length - 1],
        );
        // A long queue starts the cycle again rather than running out of lines.
        expect(searchHeadline(SEARCH_HEADLINE_SECONDS * SEARCH_HEADLINES.length)).toBe(SEARCH_HEADLINES[0]);
        expect(searchHeadline(SEARCH_HEADLINE_SECONDS * (SEARCH_HEADLINES.length + 1))).toBe(SEARCH_HEADLINES[1]);
    });

    it("never leaves the screen without a headline", () => {
        // A clock that has not started yet, or one that jumped backwards.
        for (const elapsed of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(SEARCH_HEADLINES).toContain(searchHeadline(elapsed) as (typeof SEARCH_HEADLINES)[number]);
        }
    });

    it("reads every line from a distinct, translated phrase", () => {
        expect(SEARCH_HEADLINES.length).toBeGreaterThan(1);
        expect(new Set(SEARCH_HEADLINES).size).toBe(SEARCH_HEADLINES.length);
        // These reach t() as a variable, so i18n.test.ts's literal scan cannot catch a missing one.
        expect(SEARCH_HEADLINES.filter((headline) => !(headline in RU_TRANSLATIONS))).toEqual([]);
    });
});
