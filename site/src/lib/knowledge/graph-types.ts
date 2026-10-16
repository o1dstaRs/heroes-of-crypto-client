/**
 * The compiled Knowledge Graph: every player-facing fact about Heroes of Crypto, flattened into typed
 * nodes joined by labelled edges, so an AI assistant can look things up by walking the graph instead of
 * reading the site.
 *
 * It is built from the same modules the Knowledge Base pages render from (common's creature/ability/
 * spell/artifact configs, the augment/doctrine/synergy tables, the site's rules copy), so it cannot drift
 * from what a player sees. The build writes it next to the static site as `knowledge-graph.json`; the
 * AI search service loads that file.
 */

export type KnowledgeLanguage = "en" | "ru";

export type KnowledgeNodeType =
    | "faction"
    | "unit"
    | "ability"
    | "spell"
    | "effect"
    | "artifact"
    | "augment"
    | "doctrine"
    | "synergy"
    | "rule"
    | "formula"
    | "ranked"
    | "faq"
    | "patch";

/** Which Knowledge Base tab (or standalone page) a node belongs to; the search tool filters on it. */
export type KnowledgeNodeSection =
    "rules" | "units" | "abilities" | "spells" | "artifacts" | "ranked" | "faq" | "patches";

export interface KnowledgeNode {
    /** Stable id: `<type>:<slug>` (e.g. `unit:hydra`, `rule:rule-morale`). */
    id: string;
    type: KnowledgeNodeType;
    section: KnowledgeNodeSection;
    /** English display name, exactly as the game spells it. */
    name: string;
    /** Russian display name when the site localizes it; entity names stay English in-game. */
    nameRu?: string;
    /** Other spellings the same thing is known by (slug, buff name, old name, ...). */
    aliases?: string[];
    /** Where the entity lives on the site (English page), so answers can link to it. */
    href: string;
    /** The same link on the Russian site. */
    hrefRu?: string;
    /** One line, English. */
    summary: string;
    summaryRu?: string;
    /** Markdown facts, English. */
    text: string;
    textRu?: string;
    /** Short facets (faction, level, kind, book, tier, ...) for filtering and lexical matching. */
    tags: string[];
    /** Extra search terms that are not part of the visible text (synonyms, topic words). */
    keywords?: string[];
    /** Structured numbers for the assistant to quote precisely. */
    props?: Record<string, string | number | boolean | string[]>;
}

export type KnowledgeEdgeRelation =
    | "IN_FACTION"
    | "HAS_ABILITY"
    | "CASTS"
    | "APPLIES"
    | "GRANTS"
    | "CONFLICTS_WITH"
    | "SYNERGY_OF"
    | "MENTIONS"
    | "RELATED";

export interface KnowledgeEdge {
    from: string;
    to: string;
    rel: KnowledgeEdgeRelation;
    /** Small qualifier such as a scroll count or the level a bonus unlocks at. */
    note?: string;
}

export interface KnowledgeGraph {
    schema: 1;
    builtAt: string;
    source: {
        site: string;
        clientCommit?: string;
        commonCommit?: string;
    };
    languages: KnowledgeLanguage[];
    counts: Record<string, number>;
    nodes: KnowledgeNode[];
    edges: KnowledgeEdge[];
}
