/**
 * Which cited knowledge-base entries can be drawn as a picture in an AI answer, and how to find
 * the picture the catalog already rendered for them.
 */

const VISUAL_SOURCE_TYPES = new Set(["unit", "faction", "ability", "artifact", "spell"]);
const FACTION_SLUGS = new Set(["life", "chaos", "might", "nature"]);

export const isVisualKnowledgeSource = (type: string): boolean => VISUAL_SOURCE_TYPES.has(type);

/**
 * The catalog fragment for a source (`unit-hydra`), from its link hash or, failing that, its id.
 * Russian answers name a unit "Медуза (Medusa)", so the id is the stable key, not the label.
 */
export const knowledgeSourceTarget = (source: { id: string; href: string }): string => {
    const hashIndex = source.href.lastIndexOf("#");
    if (hashIndex >= 0 && hashIndex < source.href.length - 1) {
        const hash = source.href.slice(hashIndex + 1);
        try {
            return decodeURIComponent(hash);
        } catch {
            return hash;
        }
    }
    const colon = source.id.indexOf(":");
    if (colon > 0) return `${source.id.slice(0, colon)}-${source.id.slice(colon + 1)}`;
    return "";
};

/** The in-game English name, pulled out of a Russian label that keeps it in brackets. */
export const englishNameInSource = (name: string): string => {
    const match = name.match(/\(([^)]+)\)\s*$/);
    return (match?.[1] ?? name).trim();
};

/** Faction crest, or undefined when the source is not one of the four factions. */
export const factionImagePath = (source: { id: string; name: string }): string | undefined => {
    const fromId = source.id.startsWith("faction:") ? source.id.slice("faction:".length) : "";
    const slug = (fromId || source.name).toLowerCase().replace(/[^a-z]/g, "");
    if (!FACTION_SLUGS.has(slug)) return undefined;
    return `/assets/images/units/factions/${slug}_128.webp`;
};
