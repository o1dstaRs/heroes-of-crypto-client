import { type HoCMath } from "@heroesofcrypto/common";

/** Fire-pit base/foreground use z=50/51; gameplay targeting starts at z=55. */
export const LAVA_MOVEMENT_OVERLAY_Z_INDEX = 51.5;
/** Visible against animated fire, but 20% more transparent than the initial 4x contrast pass. */
export const LAVA_MOVEMENT_OVERLAY_OPACITY_SCALE = 3.2;

/**
 * Cells that need a second movement-area pass above the fire-pit artwork.
 *
 * Reachability stays authoritative in PathHelper. This helper only changes presentation: a creature that
 * cannot traverse lava keeps the long-standing floor-level overlay, while Made of Fire / Lava Striders
 * movement destinations are copied to the foreground layer where the pit and grate cannot hide them.
 */
export const lavaMovementOverlayCells = (
    cells: readonly HoCMath.XY[],
    canTraverseLava: boolean,
    isLavaCell: (cell: HoCMath.XY) => boolean,
): HoCMath.XY[] => (canTraverseLava ? cells.filter(isLavaCell) : []);
