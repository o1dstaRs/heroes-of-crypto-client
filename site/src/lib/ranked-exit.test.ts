import { describe, expect, test } from "bun:test";

import {
    buildRankedExitRulesUrl,
    casualtyPercent,
    DEFAULT_RANKED_EXIT_RULES,
    formatRuleDuration,
    normalizeRankedExitRules,
    normalizeRankedMatchExit,
    normalizeRankedMatchReason,
    normalizeRankedMatchResult,
    rankedExitLabel,
    rankedExitPreviewLabel,
    rankedExitRulesState,
    ruleTokenValue,
    splitRuleTokens,
    type RankedExitLabelKey,
} from "./ranked-exit";
import { content } from "./site-data";

const EXIT = {
    kind: "abandon",
    cause: "button",
    leaverPlayerId: "22222222-2222-4222-8222-222222222222",
    scored: true,
    unscoredReason: "",
    boardBp: 3149,
    phase: "fight",
    lap: 3,
    enforced: true,
};

const english = (key: RankedExitLabelKey): string => content.en.profile[key];
const russian = (key: RankedExitLabelKey): string => content.ru.profile[key];

describe("ranked exit parsing", () => {
    test("keeps every reason the server sends, including the exit-rule ones; anything else is a normal finish", () => {
        for (const reason of ["concede", "cancel", "abandon", "unscored", "void"]) {
            expect(normalizeRankedMatchReason(reason)).toBe(reason);
        }
        expect(normalizeRankedMatchReason("rage_quit")).toBe("normal");
        expect(normalizeRankedMatchResult("none")).toBe("none");
        expect(normalizeRankedMatchResult("weird")).toBe("draw");
    });

    test("reads an exit and tolerates missing, malformed or out-of-range fields", () => {
        expect(normalizeRankedMatchExit(EXIT)).toEqual(EXIT);
        expect(normalizeRankedMatchExit(null)).toBeNull();
        expect(normalizeRankedMatchExit({ ...EXIT, kind: "forfeit" })).toBeNull();
        expect(normalizeRankedMatchExit({ kind: "void", boardBp: 99_999, phase: "lobby", cause: 7 })).toEqual({
            kind: "void",
            cause: "button",
            leaverPlayerId: "",
            scored: false,
            unscoredReason: "",
            boardBp: 10_000,
            phase: "fight",
            lap: 0,
            enforced: false,
        });
        expect(casualtyPercent(4_999)).toBe(49);
    });
});

describe("ranked exit labels", () => {
    const exit = (overrides: Partial<typeof EXIT> = {}) => normalizeRankedMatchExit({ ...EXIT, ...overrides });

    test("names each ending the way the rules page does", () => {
        expect(rankedExitLabel(exit(), english)).toBe("Abandoned at 31% casualties");
        expect(rankedExitLabel(exit({ kind: "concede", boardBp: 6120 }), english)).toBe("Conceded at 61% casualties");
        expect(rankedExitLabel(exit({ phase: "draft", boardBp: 0 }), english)).toBe("Abandoned before the fight");
        expect(rankedExitLabel(exit({ cause: "absence" }), english)).toBe("Abandoned at 31% casualties (away time ran out)");
        expect(rankedExitLabel(exit({ scored: false, unscoredReason: "leaver_calibrating" }), english)).toBe(
            "Unscored: abandoned during calibration",
        );
        expect(rankedExitLabel(exit({ cause: "double", scored: false, leaverPlayerId: "" }), english)).toBe(
            "Unscored: both players left",
        );
        expect(rankedExitLabel(exit({ kind: "void", cause: "server", scored: false }), english)).toBe(
            "Voided: server problem",
        );
        expect(rankedExitLabel(exit(), russian)).toBe("Выход при потерях 31%");
        expect(rankedExitLabel(null, english)).toBe("");
    });

    test("an exit settled before the rules applied is shown as a preview, never as the result", () => {
        const preview = exit({ enforced: false });
        expect(rankedExitLabel(preview, english)).toBe("");
        expect(rankedExitPreviewLabel(preview, english)).toBe("Under the new leaving rules: Abandoned at 31% casualties");
        expect(rankedExitPreviewLabel(exit(), english)).toBe("");
        // A server fault is void under either rule set.
        expect(rankedExitLabel(exit({ kind: "void", enforced: false }), english)).toBe("Voided: server problem");
    });
});

describe("published rule numbers", () => {
    test("reads the rules response and keeps safe defaults for anything missing", () => {
        expect(normalizeRankedExitRules({ enforced: true, enforceAtMs: 1_790_000_000_000, absenceBudgetMs: 240_000 })).toEqual({
            ...DEFAULT_RANKED_EXIT_RULES,
            enforced: true,
            enforceAtMs: 1_790_000_000_000,
            absenceBudgetMs: 240_000,
        });
        expect(normalizeRankedExitRules("nope")).toBeNull();
    });

    test("status: in effect since a date, in effect without one, scheduled, or starting soon", () => {
        const now = Date.UTC(2026, 8, 14);
        const rules = DEFAULT_RANKED_EXIT_RULES;
        expect(rankedExitRulesState({ ...rules, enforced: true, enforceAtMs: Date.UTC(2026, 8, 20) }, now)).toBe("enforced");
        expect(rankedExitRulesState({ ...rules, enforced: true, enforceAtMs: 1 }, now)).toBe("enforced_undated");
        expect(rankedExitRulesState({ ...rules, enforceAtMs: Date.UTC(2026, 8, 21) }, now)).toBe("scheduled");
        expect(rankedExitRulesState(rules, now)).toBe("pending");
    });

    test("numbers print without plural-dependent wording and split out of the copy", () => {
        expect(formatRuleDuration(300_000, "en")).toBe("5:00");
        expect(formatRuleDuration(10_000, "ru")).toBe("10 с");
        expect(ruleTokenValue("threshold", DEFAULT_RANKED_EXIT_RULES, "en")).toBe("50%");
        expect(ruleTokenValue("cooldown", { ...DEFAULT_RANKED_EXIT_RULES, abandonCooldownMs: 90_000 }, "en")).toBe("1:30");
        expect(splitRuleTokens("Wait {cooldown}, then {threshold} of {unknown}.")).toEqual([
            { text: "Wait " },
            { token: "cooldown" },
            { text: ", then " },
            { token: "threshold" },
            { text: " of {unknown}." },
        ]);
    });

    test("the rules copy only uses tokens the page can fill, in both languages", () => {
        for (const language of ["en", "ru"] as const) {
            const rules = content[language].leavingRules;
            const texts = rules.sections.flatMap((section) => [...section.body, ...section.items]);
            for (const text of texts) {
                const leftovers = splitRuleTokens(text)
                    .filter((segment): segment is { text: string } => "text" in segment)
                    .filter((segment) => /\{\w+\}/.test(segment.text));
                expect(leftovers).toEqual([]);
            }
        }
    });

    test("builds the production and local route", () => {
        expect(buildRankedExitRulesUrl({ baseUrl: "https://mm.test/", production: true })).toBe(
            "https://mm.test/v1/ranked-exit-rules",
        );
        expect(buildRankedExitRulesUrl({ baseUrl: "http://localhost:3001", production: false })).toBe(
            "http://localhost:3001/v1/mm/ranked-exit-rules",
        );
    });
});
