/**
 * Shared rules for the "current meta" panels. The MetaSnapshot component's script block is neither
 * type-checked nor unit-tested (see site/README and the ranked-match contract test), so the logic that
 * decides what a panel shows lives here, where the site's test run covers it.
 */

import type { MetaArtifactRow, MetaComboRow, MetaCreatureRow, MetaStats } from "./meta-stats-client";

/** Games a row needs before it may headline a panel, relaxed while the ladder is young. */
export const META_GAMES_FLOORS = [8, 3, 1] as const;

/**
 * Keep the rows that clear the highest floor any row reaches, so a 1-game 100% never headlines a mature
 * ladder and a young one still shows something. An empty input stays empty.
 */
export function withGamesFloor<T extends { games: number }>(rows: readonly T[]): T[] {
    const floor = META_GAMES_FLOORS.find((candidate) => rows.some((row) => row.games >= candidate));
    return floor === undefined ? [] : rows.filter((row) => row.games >= floor);
}

export interface IMetaPanelRows {
    strongest: MetaCreatureRow[];
    weakest: MetaCreatureRow[];
    duos: MetaComboRow[];
    trios: MetaComboRow[];
    artifactsTier1: MetaArtifactRow[];
    artifactsTier2: MetaArtifactRow[];
}

/** Exactly the rows each list renders, after the floor and the per-list limits. */
export function metaPanelRows(stats: MetaStats): IMetaPanelRows {
    const creatures = withGamesFloor(stats.creatures ?? []);
    return {
        strongest: creatures.slice(0, 6),
        weakest: [...creatures].sort((a, b) => a.winRatePct - b.winRatePct || b.games - a.games).slice(0, 3),
        duos: (stats.pairs ?? []).slice(0, 4),
        trios: (stats.triples ?? []).slice(0, 3),
        artifactsTier1: withGamesFloor(stats.artifactsTier1 ?? []).slice(0, 4),
        artifactsTier2: withGamesFloor(stats.artifactsTier2 ?? []).slice(0, 4),
    };
}

/**
 * Which panels have nothing to show. A panel whose lists are all empty must say so: its headings hide with
 * their lists, so without this it renders as an empty bordered box (the combos panel did, while the ladder
 * had too few games for any duo to clear the server's floor).
 */
export function emptyMetaPanels(stats: MetaStats): { units: boolean; combos: boolean; artifacts: boolean } {
    const rows = metaPanelRows(stats);
    return {
        units: rows.strongest.length === 0 && rows.weakest.length === 0,
        combos: rows.duos.length === 0 && rows.trios.length === 0,
        artifacts: rows.artifactsTier1.length === 0 && rows.artifactsTier2.length === 0,
    };
}
