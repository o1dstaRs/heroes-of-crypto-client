import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";

/** Snapshot values, not object identity: units and grid settings can move/change in place. */
export const auraProjectionKey = (
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    gs: GridSettings,
    narrowing: number,
): string =>
    `${center.x}:${center.y}:${footprint.width}:${footprint.height}:${range}:${narrowing}:${gs.getCellSize()}:${gs.getMinX()}:${gs.getMaxX()}:${gs.getMinY()}:${gs.getMaxY()}`;
