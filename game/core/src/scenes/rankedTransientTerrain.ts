import type { FightProperties, HoCMath } from "@heroesofcrypto/common";

import { PlayTransientCellKind } from "../api/play_protocol";

export interface RankedTerrainJournalEntry {
    sequence: number;
    team: number;
    eventsJson: string;
}

/** One live smoke / vine / fire-wall cell as an authoritative snapshot carries it. */
export interface RankedTransientCell {
    kind: number;
    x: number;
    y: number;
    lapsRemaining: number;
    team: number;
}

export interface RankedTransientTerrainSnapshot {
    transientCells?: readonly RankedTransientCell[];
    transientCellsCount?: number;
    journalTail?: readonly RankedTerrainJournalEntry[];
}

type RankedTerrainFightProperties = Pick<FightProperties, "getFireWalls" | "getVines" | "getSmokeClouds">;

const parseEvents = (eventsJson: string): unknown[] => {
    if (!eventsJson.trim()) {
        return [];
    }
    try {
        const parsed = JSON.parse(eventsJson) as unknown;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const parseCells = (value: unknown): HoCMath.XY[] | undefined => {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const cells: HoCMath.XY[] = [];
    for (const valueCell of value) {
        if (!valueCell || typeof valueCell !== "object") {
            return undefined;
        }
        const cell = valueCell as { x?: unknown; y?: unknown };
        if (
            typeof cell.x !== "number" ||
            !Number.isFinite(cell.x) ||
            typeof cell.y !== "number" ||
            !Number.isFinite(cell.y)
        ) {
            return undefined;
        }
        cells.push({ x: cell.x, y: cell.y });
    }
    return cells;
};

/**
 * Rebuild transient movement terrain that ranked snapshots do not currently carry.
 *
 * The journal tail is replayed in sequence order and the operations are idempotent: placement refreshes a
 * cell while expiry removes it. This makes the method safe both after a full scene hydrate (stores are empty)
 * and after an action replay already materialized the same terrain locally.
 */
export const reconcileRankedTransientTerrain = (
    fightProperties: RankedTerrainFightProperties,
    journalTail: readonly RankedTerrainJournalEntry[] | undefined,
): void => {
    if (!journalTail?.length) {
        return;
    }

    const vines = fightProperties.getVines();
    const fireWalls = fightProperties.getFireWalls();
    const smokeClouds = fightProperties.getSmokeClouds();
    for (const entry of [...journalTail].sort((a, b) => a.sequence - b.sequence)) {
        for (const rawEvent of parseEvents(entry.eventsJson)) {
            if (!rawEvent || typeof rawEvent !== "object") {
                continue;
            }
            const event = rawEvent as { type?: unknown; cells?: unknown; lapsRemaining?: unknown };
            const cells = parseCells(event.cells);
            if (!cells) {
                continue;
            }
            switch (event.type) {
                case "vine_placed": {
                    const laps = event.lapsRemaining;
                    if (typeof laps !== "number" || !Number.isFinite(laps) || laps <= 0) {
                        break;
                    }
                    vines.addAll(cells, laps, entry.team);
                    break;
                }
                case "vine_expired":
                    for (const cell of cells) {
                        vines.remove(cell);
                    }
                    break;
                case "fire_wall_placed": {
                    // Ranked never predicts authoritative burn damage locally; it only needs wall presence
                    // for movement cost and rendering. The server remains authoritative for wall power.
                    const laps = event.lapsRemaining;
                    if (typeof laps !== "number" || !Number.isFinite(laps) || laps <= 0) {
                        break;
                    }
                    fireWalls.addAll(cells, laps);
                    break;
                }
                case "fire_wall_expired":
                    for (const cell of cells) {
                        fireWalls.remove(cell);
                    }
                    break;
                case "smoke_placed": {
                    // Smoke was the one transient store this rebuild skipped, so every full hydrate wiped
                    // the clouds off the ranked board while the server kept halving damage through them.
                    const laps = event.lapsRemaining;
                    if (typeof laps !== "number" || !Number.isFinite(laps) || laps <= 0) {
                        break;
                    }
                    for (const cell of cells) {
                        smokeClouds.add(cell, laps);
                    }
                    break;
                }
                case "smoke_dispel":
                case "smoke_expired":
                    for (const cell of cells) {
                        smokeClouds.dispel(cell);
                    }
                    break;
            }
        }
    }
};

/**
 * Install the transient terrain exactly as the authoritative snapshot carries it: the three stores are
 * replaced wholesale, so a cell the server has since cleared never lingers and a cast older than the
 * journal tail is still on the board.
 */
export const installRankedTransientTerrain = (
    fightProperties: RankedTerrainFightProperties,
    cells: readonly RankedTransientCell[],
): void => {
    const smokeClouds = fightProperties.getSmokeClouds();
    const vines = fightProperties.getVines();
    const fireWalls = fightProperties.getFireWalls();
    smokeClouds.clear();
    vines.clear();
    fireWalls.clear();
    for (const cell of cells) {
        if (!Number.isFinite(cell.lapsRemaining) || cell.lapsRemaining <= 0) {
            continue;
        }
        const at = { x: cell.x, y: cell.y };
        switch (cell.kind) {
            case PlayTransientCellKind.SMOKE:
                smokeClouds.add(at, cell.lapsRemaining);
                break;
            case PlayTransientCellKind.VINE:
                vines.add(at, cell.lapsRemaining, cell.team);
                break;
            case PlayTransientCellKind.FIRE_WALL:
                // Ranked never predicts burn damage locally; presence and lifetime are all the scene needs.
                fireWalls.add(at, cell.lapsRemaining);
                break;
            default:
                break;
        }
    }
};

/**
 * Bring the transient stores in line with an authoritative snapshot: a server that carries the cells
 * (transientCellsCount present, even when 0) is installed verbatim; an older server falls back to the
 * bounded journal-tail rebuild.
 */
export const syncRankedTransientTerrain = (
    fightProperties: RankedTerrainFightProperties,
    snapshot: RankedTransientTerrainSnapshot,
): void => {
    if (snapshot.transientCellsCount !== undefined) {
        installRankedTransientTerrain(fightProperties, snapshot.transientCells ?? []);
        return;
    }
    reconcileRankedTransientTerrain(fightProperties, snapshot.journalTail);
};
