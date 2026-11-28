import { GridMath, type HoCMath, type TeamType } from "@heroesofcrypto/common";

export interface RosterPlacementHint {
    creatureName: string;
    width: number;
    height: number;
    reason: "stack-limit" | "footprint" | "one-zone";
    team?: TeamType;
}

interface PlacementZone {
    team: TeamType;
    hasStackSlot: boolean;
    cellHashes: ReadonlySet<number> | undefined;
}

export function rosterPlacementHint(
    creatureName: string,
    width: number,
    height: number,
    zones: readonly PlacementZone[],
    areCellsEmpty: (cells: HoCMath.XY[]) => boolean,
): RosterPlacementHint | undefined {
    if (!zones.length) return undefined;
    const zonesWithSlots = zones.filter((zone) => zone.hasStackSlot);
    if (!zonesWithSlots.length) return { creatureName, width, height, reason: "stack-limit" };

    const fittingZones = zonesWithSlots.filter(({ cellHashes }) => {
        if (!cellHashes?.size) return false;
        for (const hash of cellHashes) {
            const anchor = { x: hash >> 4, y: hash & 15 };
            if (anchor.x < width - 1 || anchor.y < height - 1) continue;
            const footprint = GridMath.getFootprintCellsForAnchor(anchor, width, height);
            if (footprint.every((cell) => cellHashes.has((cell.x << 4) | cell.y)) && areCellsEmpty(footprint)) {
                return true;
            }
        }
        return false;
    });
    if (!fittingZones.length) return { creatureName, width, height, reason: "footprint" };
    if (zones.length > 1 && fittingZones.length === 1) {
        return { creatureName, width, height, reason: "one-zone", team: fittingZones[0].team };
    }
    return undefined;
}
