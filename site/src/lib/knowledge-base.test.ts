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
        // A question to the assistant is not a list of required words. "tell" must not hide Medusa.
        expect(knowledgeAiSearchRank("Medusa", "Medusa Chaos petrify gaze", "tell me about medusa")).toBeLessThan(
            Number.POSITIVE_INFINITY,
        );
        expect(knowledgeAiSearchRank("Hydra", "Hydra Chaos", "tell me about medusa")).toBe(Number.POSITIVE_INFINITY);
    });

    test("finds the new artifacts and Death slow by English or Russian names", () => {
        for (const language of ["en", "ru"] as const) {
            const entries = buildKnowledgeEntries(language);
            for (const [query, name] of [
                ["Gravechain", "Gravechain"],
                ["Могильная цепь", "Gravechain"],
                ["Могильные узы", "Gravebound"],
                ["Колчан эха", "Quiver of Echoes"],
                ["Эгида тайной магии", "Aegis of the Arcane"],
            ]) {
                expect(searchKnowledgeEntries(entries, query).map((entry) => entry.name)).toContain(name);
            }
            expect(searchKnowledgeEntries(entries, "Gravechain", "spells").map((entry) => entry.name)).toContain(
                "Gravebound",
            );
            expect(entries.find((entry) => entry.name === "Gravechain")?.meta).toContain(
                language === "ru" ? "Проклятый" : "Cursed",
            );
        }
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
