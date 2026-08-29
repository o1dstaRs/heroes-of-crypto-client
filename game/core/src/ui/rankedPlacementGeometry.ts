import { AttackVals, GridMath, TeamVals, type TeamType } from "@heroesofcrypto/common";

import { PlayActionType } from "../api/play_protocol";
import type { PlayAction, PlaySnapshot, PlayUnitState } from "../api/play_protocol";

export const isRangedSnapshotUnit = (unit: PlayUnitState): boolean => unit.attackType === AttackVals.RANGE;

/**
 * The unit's board footprint in cells. The snapshot decoder resolves footprintWidth/footprintHeight for
 * every unit (falling back to a `size` x `size` square for an older server), but a hand-built snapshot in
 * a test or dev fixture may still omit them, so fall back to `size` here too. `size` alone is not a
 * shape — a 2x1 and a 1x2 both carry size 2 — so nothing below may branch on it.
 */
export const snapshotUnitWidth = (unit: PlayUnitState): number =>
    Math.max(1, Math.floor(unit.footprintWidth || unit.size));

export const snapshotUnitHeight = (unit: PlayUnitState): number =>
    Math.max(1, Math.floor(unit.footprintHeight || unit.size));

/**
 * The cells a unit anchored at `anchor` occupies. `anchor` is the MAX corner — the same cell the engine
 * calls the base cell — and the footprint hangs down-left of it, so this stays interchangeable with
 * Unit.getBaseCell()/getCells() and with the base cell the server derives back out of the cell list.
 */
export const cellsForSnapshotUnitAt = (
    unit: PlayUnitState,
    anchor: { x: number; y: number },
): { x: number; y: number }[] =>
    GridMath.getFootprintCellsForAnchor(anchor, snapshotUnitWidth(unit), snapshotUnitHeight(unit));

const cellKey = (cell: { x: number; y: number }): string => `${cell.x}:${cell.y}`;

/**
 * The depth-3 default deployment zone, the one every army is auto-placed into before it is
 * rearranged. SIDE-oriented (the ranked board): LEFT deploys the LEFT columns x 1-3, RIGHT the
 * RIGHT columns x 12-14, both spanning rows y 1-14 — exactly the server's SideRectanglePlacement.
 * The old top/bottom rows sent every auto-generated PLACE_UNIT outside the server's zone, so the
 * whole army fell through to server scatter.
 */
export const DEFAULT_PLACEMENT_MIN_Y = 1;
export const DEFAULT_PLACEMENT_MAX_Y = 14;
export const defaultPlacementCols = (team: TeamType): { minX: number; maxX: number } =>
    team === TeamVals.RIGHT ? { minX: 12, maxX: 14 } : { minX: 1, maxX: 3 };

export const isDefaultPlacementCell = (cell: { x: number; y: number }, team: TeamType): boolean => {
    const cols = defaultPlacementCols(team);
    const inX = cell.x >= cols.minX && cell.x <= cols.maxX;
    const inY = cell.y >= DEFAULT_PLACEMENT_MIN_Y && cell.y <= DEFAULT_PLACEMENT_MAX_Y;
    return inX && inY;
};

/**
 * Centre-out anchor candidates for a `width` x `height` stack, as MAX-corner anchors, on the
 * SIDE-oriented zones. The tuned ladders this screen has always used transpose with the board:
 * the dense/strided centre-out ladder now walks the LATERAL axis (y), shifted by (height - 1)
 * into max-corner terms; the depth preference (ranged hides at the back of the zone, melee leads
 * at the front) walks x — back is x=1 for LEFT and x=14 for RIGHT. Both filters drop anchors
 * whose body would spill out of the zone, which the caller's cell guard would only reject later.
 */
export const fallbackPlacementAnchors = (
    team: TeamType,
    width: number,
    height: number,
    ranged: boolean,
): Array<{ x: number; y: number }> => {
    const cols = defaultPlacementCols(team);
    const ys = (height > 1 ? [7, 5, 9, 3, 11, 1, 13] : [7, 8, 6, 9, 5, 10, 4, 11, 3, 12, 2, 13, 1, 14])
        .map((y) => y + height - 1)
        .filter((y) => y - height + 1 >= DEFAULT_PLACEMENT_MIN_Y && y <= DEFAULT_PLACEMENT_MAX_Y);
    const xs = (team === TeamVals.RIGHT ? (ranged ? [14, 13, 12] : [12, 13, 14]) : ranged ? [1, 2, 3] : [3, 2, 1])
        .map((x) => (team === TeamVals.LEFT ? x + width - 1 : x))
        .filter((x) => x - width + 1 >= cols.minX && x <= cols.maxX);

    return xs.flatMap((x) => ys.map((y) => ({ x, y })));
};

const modelPlacementAnchors = (unit: PlayUnitState, team: TeamType): { x: number; y: number }[] =>
    fallbackPlacementAnchors(team, snapshotUnitWidth(unit), snapshotUnitHeight(unit), isRangedSnapshotUnit(unit));

export const createModelPlacementActions = (snapshot: PlaySnapshot, team: TeamType): Partial<PlayAction>[] => {
    const occupied = new Set<string>();
    for (const unit of snapshot.units) {
        if (!unit.placed) {
            continue;
        }
        for (const cell of unit.cells) {
            occupied.add(cellKey(cell));
        }
    }

    // Biggest body first: it needs the largest contiguous hole, and a one-cell stack dropped in the middle
    // of the zone can leave no room for one. Ranked by footprint AREA rather than by `size`, so a two-cell
    // rectangle sorts between a 1x1 and a 2x2 instead of tying with whichever square shares its `size`.
    const unplaced = snapshot.units
        .filter((unit) => unit.team === team && !unit.dead && (!unit.placed || !unit.cells.length))
        .sort((a, b) => {
            const areaA = snapshotUnitWidth(a) * snapshotUnitHeight(a);
            const areaB = snapshotUnitWidth(b) * snapshotUnitHeight(b);
            if (areaA !== areaB) return areaB - areaA;
            const spanA = Math.max(snapshotUnitWidth(a), snapshotUnitHeight(a));
            const spanB = Math.max(snapshotUnitWidth(b), snapshotUnitHeight(b));
            if (spanA !== spanB) return spanB - spanA;
            if (isRangedSnapshotUnit(a) !== isRangedSnapshotUnit(b)) return isRangedSnapshotUnit(a) ? 1 : -1;
            return b.initiative - a.initiative;
        });

    const actions: Partial<PlayAction>[] = [];
    for (const unit of unplaced) {
        for (const anchor of modelPlacementAnchors(unit, team)) {
            const cells = cellsForSnapshotUnitAt(unit, anchor);
            if (
                cells.every(
                    (cell) =>
                        isDefaultPlacementCell(cell, team) &&
                        !occupied.has(cellKey(cell)) &&
                        Number.isInteger(cell.x) &&
                        Number.isInteger(cell.y),
                )
            ) {
                for (const cell of cells) {
                    occupied.add(cellKey(cell));
                }
                actions.push({
                    type: PlayActionType.PLACE_UNIT,
                    unitId: unit.id,
                    team,
                    unitName: unit.name,
                    cells,
                });
                break;
            }
        }
    }
    return actions;
};

/**
 * Put a freshly drafted army straight onto its own edge in one readable horizontal line. The line is
 * centred, keeps a one-cell gap whenever the complete roster fits with gaps, and aligns multi-cell
 * creatures of any footprint to the same front line as one-cell creatures. Reconnects that already
 * contain manually placed stacks fall back to the collision-safe tactical anchors above instead of
 * moving the player's existing layout.
 */
export const createInitialPlayerPlacementActions = (snapshot: PlaySnapshot, team: TeamType): Partial<PlayAction>[] => {
    const aliveTeamUnits = snapshot.units.filter((unit) => unit.team === team && !unit.dead);
    const unplaced = aliveTeamUnits.filter((unit) => !unit.placed || !unit.cells.length);
    if (!unplaced.length) {
        return [];
    }
    if (aliveTeamUnits.some((unit) => unit.placed && unit.cells.length)) {
        return createModelPlacementActions(snapshot, team);
    }

    // The line is VERTICAL on the side-oriented zones: it walks the lateral axis (y) and every
    // stack's front edge lands on the zone column nearest the battlefield centre.
    const availableSpan = DEFAULT_PLACEMENT_MAX_Y - DEFAULT_PLACEMENT_MIN_Y + 1;
    const occupiedSpan = unplaced.reduce((sum, unit) => sum + snapshotUnitHeight(unit), 0);
    const gap = occupiedSpan + Math.max(0, unplaced.length - 1) <= availableSpan ? 1 : 0;
    const lineSpan = occupiedSpan + gap * Math.max(0, unplaced.length - 1);
    // The cursor walks the line's BOTTOM edge; the anchor a cell list is built from is the max
    // corner, so each unit's anchor sits (height - 1) above it.
    let y = DEFAULT_PLACEMENT_MIN_Y + Math.max(0, Math.floor((availableSpan - lineSpan) / 2));

    return unplaced.map((unit) => {
        const width = snapshotUnitWidth(unit);
        const height = snapshotUnitHeight(unit);
        const cols = defaultPlacementCols(team);
        const anchor = {
            // Lower's front column is 3 and the footprint hangs leftward from the anchor, so the
            // anchor IS column 3; right's front column is 12 and its body extends rightward, so the
            // anchor is (12 + width - 1).
            x: team === TeamVals.RIGHT ? cols.minX + width - 1 : cols.maxX,
            y: y + height - 1,
        };
        const cells = cellsForSnapshotUnitAt(unit, anchor);
        y += height + gap;
        return {
            type: PlayActionType.PLACE_UNIT,
            unitId: unit.id,
            team,
            unitName: unit.name,
            cells,
        };
    });
};
