import { getArmorPower, ArmorAugment } from "@heroesofcrypto/common/src/augments/augment_properties";
import { SynergyKeysToPower } from "@heroesofcrypto/common/src/synergies/synergy_properties";
import { describe, expect, test } from "bun:test";

import { buildKnowledgeGraph, slugify } from "./graph-builder";
import { artifacts } from "../artifacts-data";
import { spells } from "../spells-data";
import { abilities, allUnits } from "../units-data";

const rulesHtml = {
    en: `<section id="rule-mechanics"><p class="eyebrow">Fight</p><h3>Turns and attacks</h3><p>Fire Strike ignores armor; Hydra responds to every attack. Use the Hourglass to wait.</p></section>
<section id="rule-morale"><p class="eyebrow">Tempo</p><h3>Morale, luck, and stack power</h3><p>Morale is capped at ±20.</p></section>`,
    ru: `<section id="rule-mechanics"><p class="eyebrow">Бой</p><h3>Ходы и атаки</h3><p>Fire Strike игнорирует броню.</p></section>
<section id="rule-morale"><p class="eyebrow">Темп</p><h3>Мораль, удача и сила стека</h3><p>Мораль ограничена ±20.</p></section>`,
};

describe("knowledge graph builder", () => {
    const graph = buildKnowledgeGraph({ rulesHtml, builtAt: "2026-09-20T00:00:00.000Z", clientCommit: "abc1234" });
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));

    test("covers every catalog record exactly once with unique ids and sound edges", () => {
        expect(byId.size).toBe(graph.nodes.length);
        expect(graph.counts.unit).toBe(allUnits.length);
        expect(graph.counts.ability).toBe(abilities.length);
        expect(graph.counts.spell).toBe(spells.length);
        expect(graph.counts.artifact).toBe(artifacts.length);
        expect(graph.counts.faction).toBe(4);
        expect(graph.counts.augment).toBe(6);
        expect(graph.counts.doctrine).toBe(3);
        expect(graph.counts.synergy).toBe(8);
        expect(graph.counts.rule).toBe(2);
        expect(graph.counts.formula).toBeGreaterThanOrEqual(7);
        expect(graph.counts.ranked).toBeGreaterThan(5);
        expect(graph.counts.faq).toBeGreaterThan(3);
        expect(graph.counts.patch).toBeGreaterThan(0);
        for (const edge of graph.edges) {
            expect(byId.has(edge.from)).toBe(true);
            expect(byId.has(edge.to)).toBe(true);
            expect(edge.from).not.toBe(edge.to);
        }
        expect(graph.builtAt).toBe("2026-09-20T00:00:00.000Z");
        expect(graph.source.clientCommit).toBe("abc1234");
        expect(graph.languages).toEqual(["en", "ru"]);
    });

    test("units link to their faction, abilities and spell scrolls with the game's numbers", () => {
        const unit =
            allUnits.find((candidate) => candidate.spells.length > 0 && candidate.abilities.length > 0) ?? allUnits[0];
        const node = byId.get(`unit:${slugify(unit.name)}`);
        expect(node).toBeDefined();
        expect(node?.props?.hp).toBe(unit.hp);
        expect(node?.text).toContain(`Health: ${unit.hp}`);
        expect(node?.textRu).toContain(`Здоровье: ${unit.hp}`);
        expect(node?.href).toContain("/knowledge-base/");
        expect(node?.hrefRu?.startsWith("/ru/knowledge-base/")).toBe(true);
        const edges = graph.edges.filter((edge) => edge.from === node?.id);
        expect(edges.some((edge) => edge.rel === "IN_FACTION" && edge.to === `faction:${slugify(unit.faction)}`)).toBe(
            true,
        );
        for (const ability of unit.abilities) {
            expect(
                edges.some((edge) => edge.rel === "HAS_ABILITY" && edge.to === `ability:${slugify(ability.name)}`),
            ).toBe(true);
        }
        const scroll = unit.spells[0].replace(/^[^:]+:/, "");
        expect(
            edges.some(
                (edge) =>
                    edge.rel === "CASTS" && edge.to === `spell:${slugify(scroll)}` && edge.note?.includes("scroll"),
            ),
        ).toBe(true);
    });

    test("abilities and spells carry both languages and their carriers", () => {
        const ability = abilities.find((candidate) => candidate.units.length > 0) ?? abilities[0];
        const node = byId.get(`ability:${slugify(ability.name)}`);
        expect(node?.text).toContain(ability.description);
        expect(node?.textRu).toContain(ability.descriptionRu);
        expect(node?.text).toContain(`Carried by: ${ability.units[0].name}`);
        const spell = spells.find((candidate) => candidate.casters.length > 0) ?? spells[0];
        const spellNode = byId.get(`spell:${slugify(spell.name)}`);
        expect(spellNode?.text).toContain(`Book: ${spell.book}`);
        expect(spellNode?.text).toContain(`Casters: ${spell.casters[0].name}`);
        expect(spellNode?.textRu).toContain(spell.descriptionRu);
    });

    test("status effects link back from the abilities that apply them", () => {
        expect(byId.get("effect:stun")?.text).toMatch(/Applied by: Stun \([^)]*Squire[^)]*\)/);
        expect(
            graph.edges.some(
                (edge) => edge.from === "ability:stun" && edge.to === "effect:stun" && edge.rel === "APPLIES",
            ),
        ).toBe(true);
    });

    test("everything the game names in English has a Russian name, and the Russian text uses it", () => {
        const gameNamed = graph.nodes.filter((node) =>
            ["unit", "ability", "effect", "spell", "artifact", "doctrine"].includes(node.type),
        );
        // A new unit, ability, spell or artifact needs its Russian name in names-ru.ts.
        expect(gameNamed.filter((node) => !node.nameRu).map((node) => `${node.type}: ${node.name}`)).toEqual([]);

        const medusa = byId.get("unit:medusa");
        expect(medusa?.nameRu).toBe("Медуза");
        expect(medusa?.textRu).toContain("**Медуза (Medusa)**");
        expect(medusa?.textRu).toContain("Окаменяющий взгляд (Petrifying Gaze):");
        expect(byId.get("ability:petrifying-gaze")?.textRu).toContain("Медуза (Medusa, Хаос)");
        expect(byId.get("effect:stun")?.textRu).toMatch(/Накладывается: Оглушение \(Stun\): [^.]*Оруженосец \(Squire\)/);
        expect(byId.get("doctrine:battle-trance")?.nameRu).toBe("Боевой транс");
        expect(byId.get("augment:armor-augment")?.textRu).toContain("Боевой транс (Battle Trance) — 7");
        // common's codes are spelled out: "MIND" or "ANY_ENEMY" read as English in a Russian answer.
        // FIRE PIT is the map's own name, printed in capitals in the game in every language.
        for (const node of gameNamed)
            expect(`${node.textRu} ${node.summaryRu}`.replace(/FIRE PIT/g, "")).not.toMatch(/\b[A-Z]{3,}(?:_[A-Z]+)*\b(?<!\bMMR|\bAOE|\bHOCAI|\bERC)/);
        expect(byId.get("ability:petrifying-gaze")?.textRu).toContain("Пассивная · Разум");
        // The English graph is untouched.
        for (const node of gameNamed) expect(node.text).not.toMatch(/[а-яё]/i);
    });

    test("augments, doctrines and synergies are derived from the engine tables", () => {
        const armor = byId.get("augment:armor-augment");
        expect(armor?.text).toContain(`Level 1 (1 point): +${getArmorPower(ArmorAugment.LEVEL_1)}% base armor`);
        expect(armor?.text).toContain(`Level 3 (3 points): +${getArmorPower(ArmorAugment.LEVEL_3)}% base armor`);
        expect(byId.get("augment:placement-augment")?.text).toContain("Level 1 (free)");
        expect(byId.get("doctrine:scout")?.props?.upgradePoints).toBe(6);
        expect(byId.get("doctrine:battle-trance")?.props?.upgradePoints).toBe(7);
        const supply = byId.get("synergy:life-supply-synergy");
        expect(supply?.text).toContain(
            `Level 1 (2 distinct Life units): every stack grows ${SynergyKeysToPower["Life:1:1"][0]}% when the fight starts`,
        );
        expect(supply?.text).toContain(
            `Level 3 (6 distinct Life units): every stack grows ${SynergyKeysToPower["Life:1:3"][0]}% when the fight starts`,
        );
        expect(
            graph.edges.some(
                (edge) =>
                    edge.from === "synergy:life-supply-synergy" &&
                    edge.to === "faction:life" &&
                    edge.rel === "SYNERGY_OF",
            ),
        ).toBe(true);
        expect(byId.get("formula:morale")?.text).toContain("+3 for a move that ends closer");
    });

    test("rules come from the rendered pages in both languages and mention the entities they name", () => {
        const mechanics = byId.get("rule:rule-mechanics");
        expect(mechanics?.name).toBe("Turns and attacks");
        expect(mechanics?.nameRu).toBe("Ходы и атаки");
        expect(mechanics?.text).toContain("Hydra responds to every attack");
        expect(mechanics?.textRu).toContain("Fire Strike игнорирует броню");
        expect(mechanics?.href).toBe("/knowledge-base/?entry=rules-mechanics#rule-mechanics");
        const mentions = graph.edges
            .filter((edge) => edge.from === "rule:rule-mechanics" && edge.rel === "MENTIONS")
            .map((edge) => edge.to);
        expect(mentions).toContain("spell:fire-strike");
        expect(mentions).toContain("unit:hydra");
        expect(
            graph.edges.some(
                (edge) => edge.from === "formula:morale" && edge.to === "rule:rule-morale" && edge.rel === "RELATED",
            ),
        ).toBe(true);
    });

    test("ranked, faq, token and patch copy become searchable nodes", () => {
        expect(byId.get("ranked:leagues")?.aliases).toContain("Demigod");
        expect(graph.nodes.some((node) => node.id.startsWith("ranked:leaving-") && node.text.includes("%"))).toBe(true);
        expect(graph.nodes.some((node) => node.type === "faq" && node.name.includes("HOCAI"))).toBe(true);
        expect(byId.get("faq:hocai-token")?.text).toContain("Allocation:");
        expect(graph.nodes.filter((node) => node.type === "patch").every((node) => node.href === "/patches/")).toBe(
            true,
        );
    });

    test("builds without rendered pages and stays a reasonable size when serialized", () => {
        const bare = buildKnowledgeGraph();
        expect(bare.counts.rule ?? 0).toBe(0);
        expect(bare.counts.unit).toBe(allUnits.length);
        const bytes = JSON.stringify(graph).length;
        expect(bytes).toBeGreaterThan(100_000);
        expect(bytes).toBeLessThan(4_000_000);
    });
});
