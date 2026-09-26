import { describe, expect, test } from "bun:test";

import {
    englishNameInSource,
    factionImagePath,
    isVisualKnowledgeSource,
    knowledgeSourceTarget,
} from "./knowledge-ai-figures";

describe("knowledge ai figures", () => {
    test("only catalog pictures get a card", () => {
        expect(isVisualKnowledgeSource("unit")).toBe(true);
        expect(isVisualKnowledgeSource("faction")).toBe(true);
        expect(isVisualKnowledgeSource("ability")).toBe(true);
        expect(isVisualKnowledgeSource("artifact")).toBe(true);
        expect(isVisualKnowledgeSource("spell")).toBe(true);
        expect(isVisualKnowledgeSource("rule")).toBe(false);
        expect(isVisualKnowledgeSource("faq")).toBe(false);
    });

    test("finds the catalog card from the link, then from the id", () => {
        expect(
            knowledgeSourceTarget({
                id: "unit:hydra",
                href: "/ru/knowledge-base/?entry=Hydra#unit-hydra",
            }),
        ).toBe("unit-hydra");
        expect(knowledgeSourceTarget({ id: "ability:lightning-spin", href: "/knowledge-base/" })).toBe(
            "ability-lightning-spin",
        );
    });

    test("reads the English game name out of a Russian label", () => {
        expect(englishNameInSource("Медуза (Medusa)")).toBe("Medusa");
        expect(englishNameInSource("Hydra")).toBe("Hydra");
    });

    test("faction crests come from the id, including when the label is Russian", () => {
        expect(factionImagePath({ id: "faction:life", name: "Жизнь" })).toBe(
            "/assets/images/units/factions/life_128.webp",
        );
        expect(factionImagePath({ id: "spell:heal", name: "Heal" })).toBeUndefined();
    });
});
