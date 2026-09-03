import { describe, expect, test } from "bun:test";

import { artifacts } from "./artifacts-data";
import {
    buildKnowledgeEntries,
    isKnowledgeSection,
    knowledgeAiSearchRank,
    knowledgeEntryId,
    knowledgeEntryMatches,
    knowledgePath,
    knowledgeSearchRank,
    searchKnowledgeEntries,
} from "./knowledge-base";
import { spells } from "./spells-data";
import { abilities, allUnits } from "./units-data";

describe("knowledge base index", () => {
    test("covers every catalog record and keeps stable unique targets", () => {
        const entries = buildKnowledgeEntries("en");
        // 11 hand-written rules topics (match flow, winning, draft, unit stats, augments, doctrines,
        // synergies, placement, turns, morale, maps) plus one entry per catalog record.
        expect(entries).toHaveLength(11 + allUnits.length + abilities.length + spells.length + artifacts.length);
        expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
        expect(new Set(entries.map((entry) => knowledgeEntryId(entry.section, entry.target))).size).toBe(
            entries.length,
        );
        expect(entries.every((entry) => entry.name && entry.description && entry.target && entry.searchText)).toBe(
            true,
        );
    });

    test("searches case- and accent-insensitively with every query token", () => {
        const entries = buildKnowledgeEntries("en");
        expect(searchKnowledgeEntries(entries, "FIRE damage", "spells").map((entry) => entry.name)).toContain(
            "Fire Strike",
        );
        expect(searchKnowledgeEntries(buildKnowledgeEntries("ru"), "мораль удача", "rules")).toHaveLength(1);
        expect(knowledgeEntryMatches("Магическая броня", "магическая")).toBe(true);
        expect(knowledgeEntryMatches("Lightning Strike damage", "lightning buff")).toBe(false);
        expect(knowledgeSearchRank("Fire", "Fire damage", "fire")).toBeLessThan(
            knowledgeSearchRank("Fire Strike", "Fire Strike damage", "fire"),
        );
    });

    test("AI search understands intent while keeping unrelated entries out", () => {
        const resurrectionRank = knowledgeAiSearchRank(
            "Resurrection",
            "Resurrection revives a fallen ally",
            "how do I bring a dead unit back",
        );
        const unrelatedRank = knowledgeAiSearchRank(
            "Fire Strike",
            "Fire Strike deals fire damage",
            "how do I bring a dead unit back",
        );

        expect(Number.isFinite(resurrectionRank)).toBe(true);
        expect(unrelatedRank).toBe(Number.POSITIVE_INFINITY);
        expect(knowledgeAiSearchRank("Лечение", "Восстанавливает здоровье", "кто может лечить")).toBeLessThan(
            Number.POSITIVE_INFINITY,
        );
    });
});

describe("knowledge base routes", () => {
    test("builds localized section and entry deep links", () => {
        expect(knowledgePath("en")).toBe("/knowledge-base/");
        expect(knowledgePath("en", { section: "units", entry: "Black Dragon" })).toBe(
            "/knowledge-base/?entry=Black+Dragon#unit-black-dragon",
        );
        expect(knowledgePath("ru", { section: "units", faction: "Chaos" })).toBe(
            "/ru/knowledge-base/?faction=chaos#units",
        );
        expect(knowledgeEntryId("spells", "Ring of Fire")).toBe("spell-ring-of-fire");
        expect(knowledgeEntryId("rules", "rules-morale")).toBe("rule-morale");
        expect(isKnowledgeSection("artifacts")).toBe(true);
        expect(isKnowledgeSection("token")).toBe(false);
    });
});
