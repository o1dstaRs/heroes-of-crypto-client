/**
 * Ranked placement is applied on the board before the server answers. The snapshot that comes back
 * must not tear that board down when it already shows the same stacks, and a snapshot from an earlier
 * drop must not rewind a newer one that is still in flight.
 */

export const OPTIMISTIC_PLACEMENT_HOLD_MS = 1500;

export interface PlacementUnitView {
    id: string;
    team: number;
    placed: boolean;
    amountAlive: number;
    cells: readonly { x: number; y: number }[];
}

const placedCellKey = (unit: PlacementUnitView): string =>
    unit.placed
        ? unit.cells
              .map((cell) => `${cell.x}:${cell.y}`)
              .sort()
              .join("|")
        : "";

const samePlacementView = (live: PlacementUnitView, snapshot: PlacementUnitView): boolean =>
    live.placed === snapshot.placed &&
    live.amountAlive === snapshot.amountAlive &&
    placedCellKey(live) === placedCellKey(snapshot);

const ownUnits = (units: readonly PlacementUnitView[], viewerTeam: number): PlacementUnitView[] =>
    units.filter((unit) => unit.team === viewerTeam);

/** Stage and map, without the unit list. A stage change must still rebuild even if stacks match. */
export const placementContextKey = (placementUnitIdsKey: string): string => {
    const gridAt = placementUnitIdsKey.indexOf("|grid:");
    if (gridAt < 0) return placementUnitIdsKey;
    const afterGrid = placementUnitIdsKey.indexOf("|", gridAt + "|grid:".length);
    return afterGrid < 0 ? placementUnitIdsKey : placementUnitIdsKey.slice(0, afterGrid);
};

/** True when the viewer's live stacks already stand where this snapshot says they stand. */
export const viewerPlacementAlreadyShown = (
    viewerTeam: number,
    live: readonly PlacementUnitView[],
    snapshot: readonly PlacementUnitView[],
): boolean => {
    const liveOwn = ownUnits(live, viewerTeam);
    const snapshotOwn = ownUnits(snapshot, viewerTeam);
    if (liveOwn.length !== snapshotOwn.length) return false;
    const liveById = new Map(liveOwn.map((unit) => [unit.id, unit]));
    for (const unit of snapshotOwn) {
        const shown = liveById.get(unit.id);
        if (!shown || !samePlacementView(shown, unit)) return false;
    }
    return true;
};

/**
 * True when this snapshot moves stacks the player already has, rather than adding or removing one.
 * A newer local drop is then kept until the server catches up. A server-created split (new id) is
 * not a rewind and must still rebuild.
 */
export const placementSnapshotWouldRewind = (
    viewerTeam: number,
    live: readonly PlacementUnitView[],
    snapshot: readonly PlacementUnitView[],
): boolean => {
    const liveOwn = ownUnits(live, viewerTeam);
    const snapshotOwn = ownUnits(snapshot, viewerTeam);
    if (liveOwn.length === 0 || liveOwn.length !== snapshotOwn.length) return false;
    const liveById = new Map(liveOwn.map((unit) => [unit.id, unit]));
    let differs = false;
    for (const unit of snapshotOwn) {
        const shown = liveById.get(unit.id);
        if (!shown) return false;
        if (!samePlacementView(shown, unit)) differs = true;
    }
    return differs;
};

export const shouldHoldOptimisticPlacement = (input: {
    now: number;
    holdUntil: number;
    forceRebuild: boolean;
    wouldRewind: boolean;
}): boolean => !input.forceRebuild && input.wouldRewind && input.now < input.holdUntil;
