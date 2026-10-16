import { describe, expect, test } from "bun:test";

import {
    englishNameInSource,
    factionImagePath,
    isDownsideQualifier,
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

    test("an artifact downside is not the Curse spell", () => {
        expect(isDownsideQualifier(" (downside): all your units lose 1 movement step")).toBe(true);
        expect(isDownsideQualifier("(недостаток): вся армия теряет шаг")).toBe(true);
        expect(isDownsideQualifier(" forces the lowest damage roll")).toBe(false);
        expect(isDownsideQualifier("d Ward reduces morale")).toBe(false);
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
