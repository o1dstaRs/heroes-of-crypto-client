import { CREATURES_JSON } from "@heroesofcrypto/common";

import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

/**
 * The creature catalogue as the UI reads it: creatures.json indexed by name, with the faction each entry
 * sits under. One index for every surface that describes a creature without a live Unit behind it — the
 * draft's detail panel, the portal's hover cards — so they all quote the same numbers.
 */
export interface CreatureCatalogConfig {
    name: string;
    exp: number;
    hp: number;
    attack: number;
    attack_damage_min: number;
    attack_damage_max: number;
    armor: number;
    initiative: number;
    steps: number;
    movement_type: string;
    magic_resist: number;
    attack_type: string;
    range_shots: number;
    shot_distance: number;
    level: number;
    size: number;
    footprint_width?: number;
    footprint_height?: number;
    abilities?: string[];
}

export interface CreatureCatalogEntry {
    faction: string;
    config: CreatureCatalogConfig;
}

// Ranked turns every drafted creature into a stack worth roughly 1000 creature experience. Keep every
// readout on the same rule as play_session so the amount shown is the amount that reaches placement.
export const STARTING_STACK_EXPERIENCE_BUDGET = 1000;

export const startingStackAmount = (config: CreatureCatalogConfig): number =>
    config.exp > 0 ? Math.max(1, Math.ceil(STARTING_STACK_EXPERIENCE_BUDGET / config.exp)) : 1;

// Index every creature by name once (creatures.json is faction -> { name -> config }, plus a version key).
const creatureConfigByName: Map<string, CreatureCatalogEntry> = (() => {
    const map = new Map<string, CreatureCatalogEntry>();
    for (const faction of Object.keys(CREATURES_JSON)) {
        const roster = (CREATURES_JSON as Record<string, unknown>)[faction];
        if (!roster || typeof roster !== "object") {
            continue; // skip the top-level "version" number
        }
        for (const [unitName, config] of Object.entries(roster as Record<string, CreatureCatalogConfig>)) {
            map.set(unitName, { faction, config });
        }
    }
    return map;
})();

/** The catalogue entry behind a creature id, or undefined for an id the client does not know. */
export const creatureCatalogEntry = (creatureId: number): CreatureCatalogEntry | undefined => {
    const name = UNIT_ID_TO_NAME[creatureId];
    return name ? creatureConfigByName.get(name) : undefined;
};
