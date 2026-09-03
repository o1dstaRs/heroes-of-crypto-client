import { Graphics } from "pixi.js";
import { GridSettings, type HoCMath } from "@heroesofcrypto/common";

import { projectBattlefieldPoint, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";
import {
    battlefieldRowCount,
    isMovementAreaEditorActive,
    movementAreaBottomLiftForCell,
    movementAreaTopLiftForCell,
    resolveMovementAreaTuning,
    type MovementAreaTuning,
} from "./movementAreaTuning";

/** Enemy movement and enemy placement intentionally share one visual contract. */
export const ENEMY_MOVEMENT_HIGHLIGHT_COLOR = 0xff3b3b;

/** Leave the floor artwork's grout visible between independently highlighted movement cells. */
export const MOVEMENT_TILE_INSET_CELLS = 0.028;

/** A restrained breathing wash ranging from 6.5% to 8% opacity. */
export const movementFillAlphaForPhase = (phase: number): number => {
    const pulse = (Math.sin(phase * 0.65) + 1) * 0.5;
    return 0.065 + pulse * 0.015;
};

type TunedCellGeometryCache = {
    readonly polygons: Map<string, number[]>;
    readonly corners: Map<string, number[]>;
};

const MAX_CACHED_TUNED_CELLS = 1024;
const tunedCellGeometryCaches = new WeakMap<GridSettings, WeakMap<MovementAreaTuning, TunedCellGeometryCache>>();

const tunedCellGeometryCacheFor = (gs: GridSettings, tuning: MovementAreaTuning): TunedCellGeometryCache => {
    let byTuning = tunedCellGeometryCaches.get(gs);
    if (!byTuning) {
        byTuning = new WeakMap();
        tunedCellGeometryCaches.set(gs, byTuning);
    }
    let cache = byTuning.get(tuning);
    if (!cache) {
        cache = { polygons: new Map(), corners: new Map() };
        byTuning.set(tuning, cache);
    }
    return cache;
};

const cacheTunedCellGeometry = (cache: Map<string, number[]>, key: string, value: number[]): void => {
    if (cache.size >= MAX_CACHED_TUNED_CELLS) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, value.slice());
};

/** The inset projected face used by every movement-range wash. */
const tunedCellFillBounds = (
    cell: HoCMath.XY,
    gs: GridSettings,
    insetCells: number,
    tuning: MovementAreaTuning = resolveMovementAreaTuning(),
): { left: number; bottom: number; right: number; top: number } => {
    const step = gs.getStep();
    const inset = Math.max(0, Math.min(0.49, insetCells)) * step;
    const left = gs.getMinX() + cell.x * step + inset;
    const baseBottom = gs.getMinY() + cell.y * step + inset;
    const bottom = baseBottom + movementAreaBottomLiftForCell(cell, gs, tuning) * step;
    const right = left + step - inset * 2;
    // Only this upper edge moves. In particular, the painted lower seam, horizontal bounds and all other
    // rows remain identical to the regular projected cell geometry.
    const top = baseBottom + step - inset * 2 + movementAreaTopLiftForCell(cell, gs, tuning) * step;
    return { left, bottom, right, top };
};

/** Shared visual-fill geometry. It changes rendering only; grid mechanics keep their regular square cells. */
export function tunedCellFillPolygon(
    cell: HoCMath.XY,
    gs: GridSettings,
    insetCells = 0,
    tuning: MovementAreaTuning = resolveMovementAreaTuning(),
): number[] {
    const cache = tunedCellGeometryCacheFor(gs, tuning).polygons;
    const cacheKey = `${cell.x},${cell.y},${insetCells}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached.slice();
    const { left, bottom, right, top } = tunedCellFillBounds(cell, gs, insetCells, tuning);
    const result = projectedRectPoints(left, bottom, right, top, gs);
    cacheTunedCellGeometry(cache, cacheKey, result);
    return result;
}

/** Stable four corners for meshes/boundary accents that cannot consume the polygon's projection samples. */
export function tunedCellFillCornerPoints(
    cell: HoCMath.XY,
    gs: GridSettings,
    insetCells = 0,
    tuning: MovementAreaTuning = resolveMovementAreaTuning(),
): number[] {
    const cache = tunedCellGeometryCacheFor(gs, tuning).corners;
    const cacheKey = `${cell.x},${cell.y},${insetCells}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached.slice();
    const { left, bottom, right, top } = tunedCellFillBounds(cell, gs, insetCells, tuning);
    const bottomLeft = projectBattlefieldPoint({ x: left, y: bottom }, gs);
    const bottomRight = projectBattlefieldPoint({ x: right, y: bottom }, gs);
    const topRight = projectBattlefieldPoint({ x: right, y: top }, gs);
    const topLeft = projectBattlefieldPoint({ x: left, y: top }, gs);
    const result = [
        bottomLeft.x,
        bottomLeft.y,
        bottomRight.x,
        bottomRight.y,
        topRight.x,
        topRight.y,
        topLeft.x,
        topLeft.y,
        bottomLeft.x,
        bottomLeft.y,
    ];
    cacheTunedCellGeometry(cache, cacheKey, result);
    return result;
}

export function movementTilePolygon(
    cell: HoCMath.XY,
    gs: GridSettings,
    tuning: MovementAreaTuning = resolveMovementAreaTuning(),
): number[] {
    return tunedCellFillPolygon(cell, gs, MOVEMENT_TILE_INSET_CELLS, tuning);
}

/** Fill only cell interiors, preserving the painted seams between adjacent cells. */
export function drawMovementArea(
    g: Graphics,
    cells: readonly HoCMath.XY[],
    gs: GridSettings,
    color: number,
    phase: number,
    opacityScale = 1,
): void {
    if (!cells.length) return;
    const alpha = movementFillAlphaForPhase(phase) * opacityScale;

    for (const cell of cells) {
        g.poly(movementTilePolygon(cell, gs)).fill({ color, alpha });
    }
}

/** Exact two-row calibration overlay used only by /dev/movement-area-editor. */
export function drawMovementAreaCalibration(g: Graphics, gs: GridSettings): void {
    if (!isMovementAreaEditorActive()) return;
    const tuning = resolveMovementAreaTuning();
    if (!tuning.guidesVisible) return;

    const rowCount = battlefieldRowCount(gs);
    const columnCount = Math.max(1, Math.round((gs.getMaxX() - gs.getMinX()) / gs.getStep()));
    const rows = [rowCount - 1, rowCount - 2].filter((row) => row >= 0);
    const colors = [0x32e6ff, 0xffb13b];

    rows.forEach((y, rowIndex) => {
        for (let x = 0; x < columnCount; x += 1) {
            g.poly(movementTilePolygon({ x, y }, gs, tuning))
                .fill({ color: colors[rowIndex], alpha: 0.13 })
                .stroke({ color: colors[rowIndex], alpha: 0.95, width: 1.5 });
        }
    });
}
