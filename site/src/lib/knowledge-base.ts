import { artifacts } from "./artifacts-data";
import { localizedFactionName } from "./localization";
import { spells } from "./spells-data";
import { abilities, allUnits, attackLabel, movementLabel } from "./units-data";
import type { Language } from "./site-data";

export const knowledgeSections = ["overview", "rules", "units", "abilities", "spells", "artifacts"] as const;
export type KnowledgeSection = (typeof knowledgeSections)[number];
export type KnowledgeCatalogSection = Exclude<KnowledgeSection, "overview">;

export interface KnowledgeEntry {
    key: string;
    section: KnowledgeCatalogSection;
    name: string;
    description: string;
    meta: string;
    image: string;
    target: string;
    searchText: string;
}

interface KnowledgePathOptions {
    section?: KnowledgeSection;
    entry?: string;
    faction?: string;
    query?: string;
}

export const isKnowledgeSection = (value: string | null | undefined): value is KnowledgeSection =>
    knowledgeSections.includes(value as KnowledgeSection);

export const normalizeKnowledgeQuery = (value: string): string =>
    value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase()
        .replace(/[^a-zа-яё0-9%+.-]+/giu, " ")
        .trim();

export const knowledgeEntryMatches = (searchText: string, query: string): boolean => {
    const normalizedQuery = normalizeKnowledgeQuery(query);
    if (!normalizedQuery) return true;
    const haystack = normalizeKnowledgeQuery(searchText);
    return normalizedQuery.split(/\s+/).every((token) => haystack.includes(token));
};

const knowledgeAiStopWords = new Set([
    "a",
    "about",
    "all",
    "an",
    "and",
    "any",
    "are",
    "best",
    "bring",
    "can",
    "could",
    "do",
    "does",
    "find",
    "for",
    "from",
    "give",
    "how",
    "i",
    "in",
    "is",
    "me",
    "of",
    "on",
    "show",
    "that",
    "the",
    "to",
    "unit",
    "units",
    "what",
    "which",
    "with",
    "you",
    "а",
    "в",
    "все",
    "где",
    "для",
    "есть",
    "и",
    "из",
    "как",
    "какие",
    "какой",
    "который",
    "мне",
    "может",
    "можно",
    "на",
    "найди",
    "о",
    "покажи",
    "про",
    "с",
    "что",
    "кто",
    "это",
    "юнит",
    "юниты",
]);

const knowledgeAiConcepts = [
    [
        "heal",
        "healer",
        "healing",
        "heals",
        "regenerate",
        "regeneration",
        "restore",
        "restoration",
        "revive",
        "resurrect",
        "resurrection",
        "лечит",
        "лечить",
        "лечение",
        "регенерация",
        "восстановление",
        "возрождение",
        "воскресить",
        "воскрешение",
    ],
    [
        "dead",
        "death",
        "die",
        "fallen",
        "kill",
        "revive",
        "resurrect",
        "resurrection",
        "смерть",
        "погиб",
        "убить",
        "воскрешение",
    ],
    [
        "armor",
        "barrier",
        "defence",
        "defense",
        "protect",
        "protection",
        "resist",
        "resistance",
        "shield",
        "броня",
        "защита",
        "сопротивление",
        "щит",
    ],
    ["attack", "damage", "hit", "power", "strike", "атака", "атаковать", "сила", "удар", "урон"],
    ["fast", "initiative", "move", "movement", "quick", "speed", "быстрый", "движение", "инициатива", "скорость"],
    ["fly", "flying", "flight", "airborne", "летающий", "летать", "полет"],
    ["archer", "distance", "range", "ranged", "shoot", "shooter", "дальний", "дистанция", "стрелок", "стрельба"],
    ["cast", "caster", "magic", "spell", "колдовство", "маг", "магия", "заклинание"],
    ["burn", "fire", "flame", "ignite", "lava", "огонь", "ожог", "пламя", "поджог", "лава"],
    ["poison", "toxic", "venom", "яд", "ядовитый", "отравление"],
    ["control", "disable", "skip", "stun", "контроль", "оглушение", "пропуск"],
    ["create", "spawn", "summon", "призвать", "призыв", "создать"],
    ["critical", "crit", "luck", "крит", "критический", "удача"],
    ["morale", "tempo", "turn", "мораль", "темп", "ход"],
] as const;

const knowledgeAiConceptByToken = new Map<string, readonly string[]>(
    knowledgeAiConcepts.flatMap((concept) => concept.map((token) => [token, concept] as const)),
);
knowledgeAiConceptByToken.set("back", knowledgeAiConcepts[0]);

const knowledgeAiQueryTokens = (query: string): string[] => {
    const tokens = normalizeKnowledgeQuery(query).split(/\s+/).filter(Boolean);
    const meaningfulTokens = tokens.filter((token) => !knowledgeAiStopWords.has(token));
    return meaningfulTokens.length > 0 ? meaningfulTokens : tokens;
};

const knowledgeAiTermsForToken = (token: string): readonly string[] => knowledgeAiConceptByToken.get(token) ?? [token];

/**
 * A small deterministic semantic rank for the static Knowledge Base index.
 * Exact lexical matches keep their normal rank; related gameplay terms are ranked after them.
 */
export function knowledgeAiSearchRank(name: string, searchText: string, query: string): number {
    const normalizedQuery = normalizeKnowledgeQuery(query);
    if (!normalizedQuery) return 100;
    if (knowledgeEntryMatches(searchText, query)) return knowledgeSearchRank(name, searchText, query);

    const normalizedName = normalizeKnowledgeQuery(name);
    const haystack = normalizeKnowledgeQuery(searchText);
    const nameWords = new Set(normalizedName.split(/\s+/));
    const haystackWords = new Set(haystack.split(/\s+/));
    const queryTokens = knowledgeAiQueryTokens(query);
    let rank = 10;

    for (const token of queryTokens) {
        const terms = knowledgeAiTermsForToken(token);
        const nameMatch = terms.some((term) => nameWords.has(term));
        const textMatch = nameMatch || terms.some((term) => haystackWords.has(term));
        if (!textMatch) return Number.POSITIVE_INFINITY;
        rank += nameMatch ? 0 : 2;
    }

    return rank;
}

/** Lower scores sort closer to the top of search results. */
export function knowledgeSearchRank(name: string, searchText: string, query: string): number {
    const normalizedName = normalizeKnowledgeQuery(name);
    const normalizedQuery = normalizeKnowledgeQuery(query);
    if (!normalizedQuery) return 100;
    if (normalizedName === normalizedQuery) return 0;
    if (normalizedName.startsWith(normalizedQuery)) return 1;
    const nameWords = normalizedName.split(/\s+/);
    const queryWords = normalizedQuery.split(/\s+/);
    if (queryWords.every((queryWord) => nameWords.some((nameWord) => nameWord.startsWith(queryWord)))) return 2;
    if (normalizedName.includes(normalizedQuery)) return 3;
    return normalizeKnowledgeQuery(searchText).indexOf(normalizedQuery) >= 0 ? 4 : 5;
}

const knowledgeEntryPrefixes: Record<KnowledgeCatalogSection, string> = {
    rules: "rule",
    units: "unit",
    abilities: "ability",
    spells: "spell",
    artifacts: "artifact",
};

/** Locale-independent fragment identifier used by catalogue cards and cross-links. */
export function knowledgeEntryId(section: KnowledgeCatalogSection, value: string): string {
    if (section === "rules" && value.startsWith("rules-")) return value.replace(/^rules-/, "rule-");
    const slug = normalizeKnowledgeQuery(value).replace(/[+%.]/g, " ").replace(/\s+/g, "-").replace(/^-|-$/g, "");
    return `${knowledgeEntryPrefixes[section]}-${slug}`;
}

export function searchKnowledgeEntries(
    entries: readonly KnowledgeEntry[],
    query: string,
    section: KnowledgeCatalogSection | "all" = "all",
    limit = 60,
): KnowledgeEntry[] {
    if (!normalizeKnowledgeQuery(query)) return [];
    return entries
        .filter(
            (entry) =>
                (section === "all" || entry.section === section) && knowledgeEntryMatches(entry.searchText, query),
        )
        .sort(
            (a, b) =>
                knowledgeSearchRank(a.name, a.searchText, query) - knowledgeSearchRank(b.name, b.searchText, query) ||
                a.name.localeCompare(b.name),
        )
        .slice(0, Math.max(0, limit));
}

export function knowledgePath(language: Language, options: KnowledgePathOptions = {}): string {
    const base = `${language === "ru" ? "/ru" : ""}/knowledge-base/`;
    const params = new URLSearchParams();
    const section = options.section ?? "overview";
    if (options.entry?.trim()) params.set("entry", options.entry.trim());
    if (options.faction?.trim()) params.set("faction", options.faction.trim().toLowerCase());
    if (options.query?.trim()) params.set("q", options.query.trim());
    const query = params.toString();
    const hash =
        options.entry?.trim() && section !== "overview"
            ? knowledgeEntryId(section, options.entry.trim())
            : section !== "overview"
              ? section
              : "";
    return `${base}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

const rulesEntries = (language: Language): KnowledgeEntry[] => {
    const isRu = language === "ru";
    const topics = isRu
        ? [
              ["Цикл матча", "Драфт, апгрейды, расстановка и бой — четыре этапа матча.", "rules-loop", "фазы начало"],
              [
                  "Как победить",
                  "Уничтожьте все вражеские стеки; сужение и Армагеддон разрешают затяжной бой, а одновременная гибель обеих армий даёт ничью.",
                  "rules-victory",
                  "победа цель",
              ],
              [
                  "Драфт",
                  "Доктрина, заранее сохранённый рейтинговый бан, бандлы, порядок пиков и состав 2/2/1/1 по уровням.",
                  "rules-draft",
                  "выбор пики уровни",
              ],
              [
                  "Характеристики юнитов",
                  "Как читать здоровье, атаку, урон, броню, инициативу, движение и дальность.",
                  "rules-unit-stats",
                  "параметры карточка",
              ],
              [
                  "Апгрейды",
                  "От пяти до семи очков доктрины на расстановку, броню, ближний бой, магию, стрельбу и движение.",
                  "rules-augments",
                  "усиления улучшения",
              ],
              [
                  "Доктрины",
                  "Три доктрины драфта: сколько состава противника вы видите и сколько очков апгрейдов даёт каждая.",
                  "rules-doctrines",
                  "доктрины разведка очки Scout Spymaster Battle Trance",
              ],
              [
                  "Синергии",
                  "Бонусы фракций за 2, 4 и 6 разных юнитов в выбранном составе Жизни, Хаоса, Силы или Природы — и как определяется вариант.",
                  "rules-synergies",
                  "фракции бонусы проценты",
              ],
              [
                  "Расстановка",
                  "Зоны старта, разделение стеков, следы 1x1/2x1/2x2, линии огня, ауры и подготовка формации.",
                  "rules-placement",
                  "позиционирование поле",
              ],
              [
                  "Ходы и бой",
                  "Движение, атаки, заклинания, Hourglass, ответные удары и сопротивления.",
                  "rules-mechanics",
                  "механики действия",
              ],
              [
                  "Мораль и удача",
                  "Приоритет и пропуски ходов, модификаторы атаки, удача, защита и сила стека.",
                  "rules-morale",
                  "темп luck morale",
              ],
              [
                  "Карты и Армагеддон",
                  "Сужение поля, центральные препятствия, лава и четыре финальные волны.",
                  "rules-map",
                  "карта круг narrowing",
              ],
          ]
        : [
              [
                  "Match flow",
                  "Draft, augments, placement, and combat—the four stages of every match.",
                  "rules-loop",
                  "phases start",
              ],
              [
                  "How to win",
                  "Remove every enemy stack; narrowing and Armageddon resolve stalls, while a simultaneous wipe is a draw.",
                  "rules-victory",
                  "victory objective",
              ],
              [
                  "Draft",
                  "Doctrine, the pre-saved ranked ban, bundles, pick order, and the 2/2/1/1 roster by unit level.",
                  "rules-draft",
                  "selection picks tiers",
              ],
              [
                  "Unit statistics",
                  "How to read health, attack, damage, armor, initiative, movement, and range.",
                  "rules-unit-stats",
                  "stats card",
              ],
              [
                  "Augments",
                  "Spend the doctrine's five-to-seven points across placement, armor, melee, magic, ranged, and movement.",
                  "rules-augments",
                  "upgrades points",
              ],
              [
                  "Doctrines",
                  "The three draft doctrines: how much of the opponent you see, and the augment points it pays.",
                  "rules-doctrines",
                  "doctrines scout spymaster battle trance points",
              ],
              [
                  "Faction synergies",
                  "Bonuses unlocked by drafting 2, 4, or 6 distinct Life, Chaos, Might, or Nature units—and how the variant is determined.",
                  "rules-synergies",
                  "factions bonuses percentages",
              ],
              [
                  "Placement",
                  "Deployment zones, stack splitting, 1x1/2x1/2x2 footprints, firing lanes, auras, and formation planning.",
                  "rules-placement",
                  "positioning board",
              ],
              [
                  "Turns and combat",
                  "Movement, attacks, spells, Hourglass, responses, and three resistance types.",
                  "rules-mechanics",
                  "actions mechanics",
              ],
              [
                  "Morale and luck",
                  "Turn priority and skips, attack modifiers, luck, defense, and stack power.",
                  "rules-morale",
                  "tempo",
              ],
              [
                  "Maps and Armageddon",
                  "Battlefield narrowing, center obstacles, lava, and four final damage waves.",
                  "rules-map",
                  "lap shrinking",
              ],
          ];

    return topics.map(([name, description, target, keywords]) => ({
        key: `rules:${target}`,
        section: "rules",
        name,
        description,
        meta: isRu ? "Правила игры" : "Game rules",
        image: "/assets/images/knowledge-base/rules-live-combat.webp",
        target,
        searchText: `${name} ${description} ${keywords}`,
    }));
};

export function buildKnowledgeEntries(language: Language): KnowledgeEntry[] {
    const isRu = language === "ru";
    const attackLabels: Record<string, string> = isRu
        ? {
              MELEE: "Ближняя атака",
              RANGE: "Дальняя атака",
              MAGIC: "Магическая атака",
              MELEE_MAGIC: "Ближняя / магическая атака",
          }
        : {};
    const movementLabels: Record<string, string> = isRu ? { WALK: "пешком", FLY: "полёт", TELEPORT: "телепорт" } : {};
    const spellBookLabels: Record<string, string> = isRu
        ? { System: "Система", Life: "Жизнь", Nature: "Природа", Chaos: "Хаос", Death: "Смерть", Order: "Порядок" }
        : {};
    const spellKindLabels: Record<string, string> = isRu
        ? { spellbook: "Книга заклинаний", ability: "Способность", effect: "Эффект" }
        : { spellbook: "Spell book", ability: "Ability", effect: "Effect" };
    const polarityLabels: Record<string, string> = isRu
        ? { buff: "Бафф", debuff: "Дебафф", damage: "Урон" }
        : { buff: "Buff", debuff: "Debuff", damage: "Damage" };
    const unitEntries: KnowledgeEntry[] = allUnits.map((unit) => {
        const faction = localizedFactionName(language, unit.faction);
        const attack = attackLabels[unit.attackType] ?? attackLabel(unit.attackType);
        const movement = movementLabels[unit.movementType] ?? movementLabel(unit.movementType);
        const abilityNames = unit.abilities.map((ability) => ability.name).join(", ");
        const spellNames = unit.spells.map((spell) => spell.replace(/^[^:]+:/, "")).join(", ");
        const description = isRu
            ? `${faction}, уровень ${unit.level}. ${attack}, ${movement}. Здоровье ${unit.hp}, атака ${unit.attack}, урон ${unit.damageMin}–${unit.damageMax}.`
            : `${faction}, level ${unit.level}. ${attack}, ${movement}. ${unit.hp} health, ${unit.attack} attack, ${unit.damageMin}–${unit.damageMax} damage.`;
        return {
            key: `units:${unit.faction}:${unit.name}`,
            section: "units",
            name: unit.name,
            description,
            meta: `${faction} · ${isRu ? "Ур." : "Lv."} ${unit.level}`,
            image: unit.icon,
            target: unit.name,
            searchText: `${unit.name} ${description} ${unit.faction} ${abilityNames} ${spellNames} ${unit.attackType} ${unit.movementType}`,
        };
    });

    const abilityEntries: KnowledgeEntry[] = abilities.map((ability) => {
        const description = isRu ? ability.descriptionRu : ability.description;
        const kind = isRu
            ? ability.kind === "aura"
                ? "Аура"
                : ability.kind === "active"
                  ? "Активная"
                  : "Пассивная"
            : ability.kind === "aura"
              ? "Aura"
              : ability.kind === "active"
                ? "Active"
                : "Passive";
        const carriers = ability.units.map((unit) => unit.name).join(", ");
        const sourceCount = ability.units.length || (ability.grantedBy ? 1 : 0);
        return {
            key: `abilities:${ability.name}`,
            section: "abilities",
            name: ability.name,
            description,
            meta: `${kind} · ${sourceCount} ${isRu ? "ист." : sourceCount === 1 ? "source" : "sources"}`,
            image: ability.icon,
            target: ability.name,
            searchText: `${ability.name} ${description} ${kind} ${carriers} ${ability.grantedBy ?? ""}`,
        };
    });

    const spellEntries: KnowledgeEntry[] = spells.map((spell) => {
        const description = isRu ? spell.descriptionRu : spell.description;
        const casters = spell.casters.map((caster) => caster.name).join(", ");
        const book = spellBookLabels[spell.book] ?? spell.book;
        const kind = spellKindLabels[spell.kind] ?? spell.kind;
        const polarity = spell.polarity ? (polarityLabels[spell.polarity] ?? spell.polarity) : "";
        return {
            key: `spells:${spell.book}:${spell.name}`,
            section: "spells",
            name: spell.name,
            description,
            meta: `${book} · ${kind}${polarity ? ` · ${polarity}` : ""}`,
            image: spell.icon,
            target: spell.name,
            searchText: `${spell.name} ${description} ${book} ${kind} ${polarity} ${spell.book} ${spell.kind} ${spell.polarity ?? ""} ${casters} ${spell.appliedBy.join(" ")}`,
        };
    });

    const artifactEntries: KnowledgeEntry[] = artifacts.map((artifact) => ({
        key: `artifacts:${artifact.tier}:${artifact.name}`,
        section: "artifacts",
        name: artifact.name,
        description: artifact.description,
        meta: `${isRu ? "Уровень" : "Tier"} ${artifact.tier}${artifact.cursed ? ` · ${isRu ? "Проклятый" : "Cursed"}` : ""}`,
        image: artifact.icon,
        target: artifact.name,
        searchText: `${artifact.name} ${artifact.description} tier ${artifact.tier} ${artifact.cursed ? "cursed проклятый" : ""}`,
    }));

    return [...rulesEntries(language), ...unitEntries, ...abilityEntries, ...spellEntries, ...artifactEntries];
}
