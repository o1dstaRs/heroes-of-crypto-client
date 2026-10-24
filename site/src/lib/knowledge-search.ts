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
    /** Set for creature entries, so the result row can compose a portrait instead of showing bare art. */
    creatureSlug?: string;
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
    "describe",
    "explain",
    "please",
    "say",
    "talk",
    "talking",
    "tell",
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
