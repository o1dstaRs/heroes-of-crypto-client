import { describe, expect, test } from "bun:test";

import { artifacts } from "./artifacts-data";
import { spells } from "./spells-data";
import { abilities } from "./units-data";

const numbers = (text: string): string[] => (text.match(/\d+(?:\.\d+)?/g) ?? []).sort();

// The Russian Knowledge Base (and the AI search's Russian answers) used to show these in English.
describe("russian descriptions", () => {
    test("every artifact has a Russian effect with the English numbers", () => {
        for (const artifact of artifacts) {
            expect(artifact.descriptionRu, artifact.name).toMatch(/[а-яё]/i);
            expect(numbers(artifact.descriptionRu), artifact.name).toEqual(numbers(artifact.description));
        }
        const rime = artifacts.find((artifact) => artifact.slug === "rime_charm");
        // Laps take the Russian plural: "на 3 круга", never "на 3 кругов".
        expect(rime?.descriptionRu).toMatch(/на \d+ (круг|круга|кругов)\./);
        expect(rime?.descriptionRu).not.toMatch(/на [234] кругов/);
    });

    test("every ability and spell has a Russian description", () => {
        expect(abilities.filter((ability) => !/[а-яё]/i.test(ability.descriptionRu)).map((ability) => ability.name)).toEqual([]);
        expect(spells.filter((spell) => !/[а-яё]/i.test(spell.descriptionRu)).map((spell) => `${spell.book}:${spell.name}`)).toEqual([]);
        // Templated ones carry the game's numbers, not a copy of them.
        const empower = spells.find((spell) => spell.name === "Empower");
        expect(numbers(empower?.descriptionRu ?? "")).toEqual(numbers(empower?.description ?? ""));
    });
});
