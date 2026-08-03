import type { FightProperties, HoCMath } from "@heroesofcrypto/common";

export interface RankedTerrainJournalEntry {
    sequence: number;
    team: number;
    eventsJson: string;
}

type RankedTerrainFightProperties = Pick<FightProperties, "getFireWalls" | "getVines">;

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
            }
        }
    }
};
