import { describe, expect, test } from "bun:test";

import { artifacts } from "./artifacts-data";
import {
    buildKnowledgeEntries,
    isKnowledgeSection,
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
        expect(entries).toHaveLength(10 + allUnits.length + abilities.length + spells.length + artifacts.length);
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
