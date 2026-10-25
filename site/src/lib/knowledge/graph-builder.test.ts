import { getArmorPower, ArmorAugment } from "@heroesofcrypto/common/src/augments/augment_properties";
import { ARTIFACT_POWER as A } from "@heroesofcrypto/common/src/artifacts/artifact_properties";
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

    test("Tome advice matches its 35% power in both languages, including mirror rounding", () => {
        const tome = byId.get("artifact:tome-of-amplification");
        expect(tome?.text).toContain("by 35%");
        expect(tome?.text).toContain("Mass Riot 25 → 33.75%");
        expect(tome?.textRu).toContain("Mass Riot 25 → 33,75%");
        const combos = byId.get("formula:combos-and-anti-synergies");
        expect(combos?.text).toContain("Riot 30 → 40.5%");
        expect(combos?.text).toContain("Mass Magic Mirror 32 → 43%");
        expect(combos?.text).toContain("flyers +5.4 armor but still −4 movement");
        expect(combos?.text).toContain("27% with Tome");
        expect(combos?.textRu).toContain("Riot 30 → 40,5%");
        expect(combos?.textRu).toContain("летающим +5,4 к броне");
        expect(byId.get("spell:mass-magic-mirror")?.text).toContain("Tome of Amplification makes it 43%");
        expect(byId.get("spell:mass-magic-mirror")?.textRu).toContain("с Tome of Amplification — 43%");
    });

    test("status effects link back from the abilities that apply them", () => {
        expect(byId.get("effect:stun")?.text).toMatch(/Applied by: Stun \([^)]*Squire[^)]*\)/);
        expect(
            graph.edges.some(
                (edge) => edge.from === "ability:stun" && edge.to === "effect:stun" && edge.rel === "APPLIES",
            ),
        ).toBe(true);
    });

    test("artifact-applied spells have typed source edges for AI graph expansion", () => {
        for (const [source, target] of [
            ["artifact:gravechain", "spell:gravebound"],
            ["artifact:rime-charm", "spell:quagmire"],
            ["ability:spit-ball", "spell:quagmire"],
        ]) {
            expect(graph.edges).toContainEqual({ from: source, to: target, rel: "APPLIES" });
        }
        expect(byId.get("spell:gravebound")?.text).toContain("Applied by: Gravechain");
        expect(byId.get("spell:gravebound")?.textRu).toContain("Источник: Могильная цепь (Gravechain)");
    });

    test("Last Fuse is discoverable under its old name and dynamite art", () => {
        const fuse = byId.get("artifact:last-fuse");
        expect(fuse?.nameRu).toBe("Последний фитиль");
        expect(fuse?.aliases).toContain("Pyre Oath");
        expect(fuse?.aliases).toContain("sticky dynamite");
        expect(fuse?.props).toMatchObject({ tier: 2, cursed: false });
        expect(fuse?.text).toContain("Water Shield");
        expect(fuse?.text).toContain("actual killing damage");
        expect(fuse?.text).toContain("25/50/75/100/125");
        expect(fuse?.text).toContain("power of the attacker");
        expect(fuse?.text).toContain("The killed enemy\'s own power does not change the minimum");
        expect(fuse?.text).toContain("overkill and health lost in earlier attacks do not increase");
        expect(fuse?.text).toContain("recalculated minimum damage");
        expect(fuse?.text).toContain("resurrects does not explode");
        expect(fuse?.text).toContain("Armor, magic resistance and hit rolls do not reduce");
        expect(fuse?.textRu).toContain("Water Shield");
        expect(byId.has("spell:last-fuse")).toBe(false);
        expect(byId.has("artifact:pyre-oath")).toBe(false);
    });

    test("new artifact knowledge includes luck, repeated attacks, immunity and the army curse", () => {
        const chain = byId.get("artifact:gravechain");
        expect(chain?.props).toMatchObject({ tier: 2, cursed: true });
        expect(chain?.text).toContain("Draft slot: Tier 2, one per army");
        expect(chain?.text).toContain("Two artifacts of the same tier cannot be equipped together");
        expect(chain?.text).toContain(`${A.GRAVECHAIN_CHANCE}%`);
        expect(chain?.text).toContain(`with luck +7 it reads ${A.GRAVECHAIN_CHANCE + 7}%`);
        expect(chain?.text).toContain("1×2 and 2×1 footprints");
        expect(chain?.text).toContain("separate additional attacks can");
        expect(chain?.text).toContain("Gravechain cannot be equipped together with Quiver of Echoes");
        expect(chain?.text).toContain("before percentage slows");
        expect(chain?.text).toContain("do not stop propagation");
        expect(chain?.textRu).toContain(`при удаче +7 это ${A.GRAVECHAIN_CHANCE + 7}%`);
        const slow = byId.get("spell:gravebound");
        expect(slow?.props).toMatchObject({ book: "Death", kind: "effect", polarity: "debuff" });
        expect(slow?.text).toContain("not a castable scroll");
        expect(slow?.text).toContain("56.25% of normal");
        expect(slow?.textRu).toContain("56,25%");
        expect(byId.get("unit:black-dragon")?.text).toContain("own Gravechain curse still costs 1 movement step");
        const quiver = byId.get("artifact:quiver-of-echoes");
        expect(quiver?.text).toContain("Gargantuan can throw three times");
        expect(quiver?.text).toContain(`with luck +7 it reads ${A.QUIVER_OF_ECHOES_CHANCE + 7}%`);
        expect(quiver?.textRu).toContain(`при удаче +7 это ${A.QUIVER_OF_ECHOES_CHANCE + 7}%`);
        expect(byId.get("artifact:aegis-of-the-arcane")?.text).toContain(
            `separate ${A.AEGIS_OF_THE_ARCANE_MAGIC_DEFENSE}% magic-defense roll`,
        );
        expect(byId.get("formula:resistances")?.text).toContain("Aegis of the Arcane");
        expect(byId.get("formula:resistances")?.text).toContain("immune target still relays Gravechain");
    });

    test("the AI knowledge base explains doctrine ban visibility and the public observer restriction", () => {
        expect(byId.get("doctrine:scout")?.text).toContain("all draft bans in advance");
        expect(byId.get("doctrine:spymaster")?.text).toContain("all draft bans in advance");
        expect(byId.get("doctrine:spymaster")?.text).toContain("Know the map from the starting bundle choice");
        expect(byId.get("doctrine:spymaster")?.textRu).toContain("Карта известна уже при выборе стартового бандла");
        expect(byId.get("doctrine:battle-trance")?.text).toContain("Bans are revealed as each creature level opens");
        const bans = graph.nodes.find((node) => node.name === "Draft bans");
        expect(bans?.text).toContain("Public observers always receive only bans for levels already opened");
        expect(bans?.text).toContain("hidden bans are omitted by the server");
        expect(bans?.textRu).toContain("скрытые баны сервер не отправляет");
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
        expect(byId.get("effect:stun")?.textRu).toMatch(
            /Накладывается: Оглушение \(Stun\): [^.]*Оруженосец \(Squire\)/,
        );
        expect(byId.get("doctrine:battle-trance")?.nameRu).toBe("Боевой транс");
        expect(byId.get("augment:armor-augment")?.textRu).toContain("Боевой транс (Battle Trance) — 7");
        // common's codes are spelled out: "MIND" or "ANY_ENEMY" read as English in a Russian answer.
        // FIRE PIT is the map's own name, printed in capitals in the game in every language.
        for (const node of gameNamed)
            expect(`${node.textRu} ${node.summaryRu}`.replace(/FIRE PIT/g, "")).not.toMatch(
                /\b[A-Z]{3,}(?:_[A-Z]+)*\b(?<!\bMMR|\bAOE|\bHOCAI|\bERC)/,
            );
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
            `Level 3 (6 distinct Life units — the whole draft, so only Life units are in the army): every stack grows ${SynergyKeysToPower["Life:1:3"][0]}% when the fight starts`,
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
        expect(byId.get("faq:hocai-token")?.href).toBe("/seasons/#token");
        expect(byId.get("faq:hocai-token")?.hrefRu).toBe("/ru/seasons/#token");
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
