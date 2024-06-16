/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { TeamType } from "../units/units_stats";
import { getRandomInt, matrixElement, shuffle } from "../utils/lib";
import { getDistance, intersect2D, Intersect2DResult, IXYDistance, XY } from "../utils/math";
import { GridSettings } from "./grid_settings";

export function getCellForPosition(gridSettings: GridSettings, position?: XY): XY | undefined {
    if (!position) {
        return undefined;
    }

    return {
        x: Math.floor((position.x + gridSettings.getMaxX()) / gridSettings.getCellSize()),
        y: Math.floor(position.y / gridSettings.getCellSize()),
    };
}

export function getCellsAroundPoint(gridSettings: GridSettings, point?: XY): XY[] {
    const cells: XY[] = [];
    if (!point) {
        return cells;
    }

    const canGoLeft = point.x > gridSettings.getMinX();
    const canGoRight = point.x < gridSettings.getMaxX();
    const canGoDown = point.y > gridSettings.getMinY();
    const canGoUp = point.y < gridSettings.getMaxY();

    if (canGoLeft && canGoUp) {
        const c = getCellForPosition(gridSettings, {
            x: point.x - gridSettings.getHalfStep(),
            y: point.y + gridSettings.getHalfStep(),
        });
        if (c) {
            cells.push(c);
        }
    }
    if (canGoRight && canGoUp) {
        const c = getCellForPosition(gridSettings, {
            x: point.x + gridSettings.getHalfStep(),
            y: point.y + gridSettings.getHalfStep(),
        });
        if (c) {
            cells.push(c);
        }
    }
    if (canGoDown && canGoLeft) {
        const c = getCellForPosition(gridSettings, {
            x: point.x - gridSettings.getHalfStep(),
            y: point.y - gridSettings.getHalfStep(),
        });
        if (c) {
            cells.push(c);
        }
    }
    if (canGoDown && canGoRight) {
        const c = getCellForPosition(gridSettings, {
            x: point.x + gridSettings.getHalfStep(),
            y: point.y - gridSettings.getHalfStep(),
        });
        if (c) {
            cells.push(c);
        }
    }

    return cells;
}

export function isPositionWithinGrid(gridSettings: GridSettings, position?: XY): boolean {
    if (!position) {
        return false;
    }

    return (
        position.x >= gridSettings.getMinX() &&
        position.x < gridSettings.getMaxX() &&
        position.y >= gridSettings.getMinY() &&
        position.y < gridSettings.getMaxY()
    );
}

export function isCellWithinGrid(gridSettings: GridSettings, cell?: XY): boolean {
    if (!cell) {
        return false;
    }

    return cell.x >= 0 && cell.x < gridSettings.getGridSize() && cell.y >= 0 && cell.y < gridSettings.getGridSize();
}

export function hasXY(desired: XY, list?: XY[]): boolean {
    if (!list?.length) {
        return false;
    }

    for (const p of list) {
        if (p.x === desired.x && p.y === desired.y) {
            return true;
        }
    }

    return false;
}

export function getPointForCell(cell: XY, minX: number, step: number, halfStep: number): XY {
    return { x: minX + (1 + cell.x) * step - halfStep, y: cell.y * step + halfStep };
}

export function getPointForCells(gridSettings: GridSettings, cells?: XY[]): XY | undefined {
    if (!cells) {
        return undefined;
    }

    if (cells.length === 1) {
        return getPointForCell(cells[0], gridSettings.getMinX(), gridSettings.getStep(), gridSettings.getHalfStep());
    }

    if (cells.length !== 4) {
        return undefined;
    }

    let xMin = Number.MAX_SAFE_INTEGER;
    let xMax = Number.MIN_SAFE_INTEGER;
    let yMin = Number.MAX_SAFE_INTEGER;
    let yMax = Number.MIN_SAFE_INTEGER;

    for (const c of cells) {
        xMin = Math.min(xMin, c.x);
        xMax = Math.max(xMax, c.x);
        yMin = Math.min(yMin, c.y);
        yMax = Math.max(yMax, c.y);
    }

    return getPointForCell(
        { x: xMin + (xMax - xMin) / 2, y: yMin + (yMax - yMin) / 2 },
        gridSettings.getMinX(),
        gridSettings.getStep(),
        gridSettings.getHalfStep(),
    );
}

export function getRandomCellAroundPosition(
    gridSettings: GridSettings,
    gridMatrix: number[][],
    teamType: TeamType,
    position: XY,
): XY | undefined {
    const cell = getCellForPosition(gridSettings, position);
    if (!cell) {
        return undefined;
    }

    let proposedCell: XY | undefined;
    if (teamType === TeamType.LOWER) {
        if (!gridMatrix[cell.y + 1][cell.x + 1]) {
            proposedCell = { x: cell.x + 1, y: cell.y + 1 };
        } else {
            const rnd = getRandomInt(0, 2);
            if (rnd) {
                if (!gridMatrix[cell.y + 1][cell.x]) {
                    proposedCell = { x: cell.x, y: cell.y + 1 };
                }
            } else if (!gridMatrix[cell.y][cell.x + 1]) {
                proposedCell = { x: cell.x + 1, y: cell.y };
            }
        }
    } else if (teamType === TeamType.UPPER) {
        if (!gridMatrix[cell.y - 1][cell.x - 1]) {
            proposedCell = { x: cell.x - 1, y: cell.y - 1 };
        } else {
            const rnd = getRandomInt(0, 2);
            if (rnd) {
                if (!gridMatrix[cell.y - 1][cell.x]) {
                    proposedCell = { x: cell.x, y: cell.y - 1 };
                }
            } else if (!gridMatrix[cell.y][cell.x - 1]) {
                proposedCell = { x: cell.x - 1, y: cell.y };
            }
        }
    }

    if (!proposedCell) {
        const cells = [
            { x: cell.x + 1, y: cell.y + 1 },
            { x: cell.x - 1, y: cell.y - 1 },
            { x: cell.x - 1, y: cell.y + 1 },
            { x: cell.x + 1, y: cell.y - 1 },
            { x: cell.x + 1, y: cell.y },
            { x: cell.x, y: cell.y + 1 },
            { x: cell.x - 1, y: cell.y },
            { x: cell.x, y: cell.y - 1 },
        ];
        while (!proposedCell && cells.length) {
            const rnd = getRandomInt(0, cells.length);
            const c = cells[rnd];
            if (!gridMatrix[c.y][c.x]) {
                proposedCell = c;
            }
            cells.splice(rnd, 1);
        }
    }

    return proposedCell;
}

export function arePointsConnected(gridSettings: GridSettings, pointA: XY, pointB: XY): boolean {
    const xDiff = Math.abs(pointA.x - pointB.x);
    const yDiff = Math.abs(pointA.y - pointB.y);
    const xSame = xDiff <= gridSettings.getMovementDelta();
    const ySame = yDiff <= gridSettings.getMovementDelta();
    if (xSame) {
        if (yDiff <= gridSettings.getStep() + gridSettings.getMovementDelta()) {
            return true;
        }
    } else if (ySame) {
        if (xDiff <= gridSettings.getStep() + gridSettings.getMovementDelta()) {
            return true;
        }
    } else {
        return getDistance(pointA, pointB) <= gridSettings.getDiagonalStep() + gridSettings.getMovementDelta();
    }
    return false;
}

export function getClosestCrossingPoint(position: XY, crossingPoints: XY[]): XY | undefined {
    let currentClosestPoint;
    let currentClosestDistance = Number.MAX_SAFE_INTEGER;
    for (const point of crossingPoints) {
        if (point.x != null && point.y != null) {
            const pt = { x: point.x, y: point.y };
            const distance = getDistance(position, pt);
            if (distance < currentClosestDistance) {
                currentClosestDistance = distance;
                currentClosestPoint = pt;
            }
        }
    }

    return currentClosestPoint;
}

export function getCrossingPoints(
    fromPosition: XY,
    toPosition: XY,
    closestVerticalAndHorizontal: XY[],
): Intersect2DResult[] {
    const ret: Intersect2DResult[] = [];
    let idx = 0;
    while (idx < closestVerticalAndHorizontal.length) {
        const pointA = closestVerticalAndHorizontal[idx++];
        const pointB = closestVerticalAndHorizontal[idx++];
        ret.push(intersect2D(pointA, pointB, fromPosition, toPosition));
    }

    return ret;
}

export function getClosestVH(gridSettings: GridSettings, fromPosition: XY, toPosition: XY): XY[] {
    const step = gridSettings.getStep();

    const vh: XY[] = [];
    let diff = fromPosition.x - toPosition.x;
    if (diff) {
        let x: number;
        if (diff < 0) {
            x = 2 * step + Math.floor(fromPosition.x / step) * step;
            vh.push(
                {
                    x,
                    y: gridSettings.getMinY(),
                },
                {
                    x,
                    y: gridSettings.getMaxY(),
                },
            );
        } else if (diff > 0) {
            x = Math.floor(fromPosition.x / step) * step - step;
            vh.push(
                {
                    x,
                    y: gridSettings.getMinY(),
                },
                {
                    x,
                    y: gridSettings.getMaxY(),
                },
            );
        }
    }

    diff = fromPosition.y - toPosition.y;
    if (diff) {
        let y: number;
        if (diff < 0) {
            y = 2 * step + Math.floor(fromPosition.y / step) * step;
            vh.push(
                {
                    x: gridSettings.getMinX(),
                    y,
                },
                {
                    x: gridSettings.getMaxX(),
                    y,
                },
            );
        } else if (diff > 0) {
            y = Math.floor(fromPosition.y / step) * step - step;
            vh.push(
                {
                    x: gridSettings.getMinX(),
                    y,
                },
                {
                    x: gridSettings.getMaxX(),
                    y,
                },
            );
        }
    }

    return vh;
}

export function getClosestSideCenter(
    gridMatrix: number[][],
    gridSettings: GridSettings,
    mousePosition: XY,
    fromPosition: XY,
    toPosition: XY,
    isSmallUnitFrom: boolean,
    isSmallUnitTo: boolean,
): XY | undefined {
    const cell = getCellForPosition(gridSettings, mousePosition);
    if (!cell) {
        return undefined;
    }
    const cellPosition = getPointForCell(
        cell,
        gridSettings.getMinX(),
        gridSettings.getStep(),
        gridSettings.getHalfStep(),
    );

    const points: IXYDistance[] = [];
    const canMoveLeft = !matrixElement(gridMatrix, cell.x - 1, cell.y);
    const canMoveRight = !matrixElement(gridMatrix, cell.x + 1, cell.y);
    const canMoveUp = !matrixElement(gridMatrix, cell.x, cell.y + 1);
    const canMoveDown = !matrixElement(gridMatrix, cell.x, cell.y - 1);

    if (
        canMoveLeft &&
        (((isSmallUnitFrom === isSmallUnitTo || !isSmallUnitFrom) && fromPosition.x < toPosition.x) ||
            (isSmallUnitFrom &&
                !isSmallUnitTo &&
                fromPosition.x - gridSettings.getHalfStep() <
                    toPosition.x - (isSmallUnitTo ? gridSettings.getHalfStep() : gridSettings.getStep())))
    ) {
        points.push({
            xy: { x: cellPosition.x - gridSettings.getHalfStep(), y: cellPosition.y },
            distance: Number.MAX_VALUE,
        });
    }
    if (
        canMoveRight &&
        (((isSmallUnitFrom === isSmallUnitTo || !isSmallUnitFrom) && fromPosition.x > toPosition.x) ||
            (isSmallUnitFrom &&
                !isSmallUnitTo &&
                fromPosition.x + gridSettings.getHalfStep() >
                    toPosition.x + (isSmallUnitTo ? gridSettings.getHalfStep() : gridSettings.getStep())))
    ) {
        points.push({
            xy: { x: cellPosition.x + gridSettings.getHalfStep(), y: cellPosition.y },
            distance: Number.MAX_VALUE,
        });
    }
    if (
        canMoveDown &&
        (((isSmallUnitFrom === isSmallUnitTo || !isSmallUnitFrom) && fromPosition.y < toPosition.y) ||
            (isSmallUnitFrom &&
                !isSmallUnitTo &&
                fromPosition.y - gridSettings.getHalfStep() <
                    toPosition.y - (isSmallUnitTo ? gridSettings.getHalfStep() : gridSettings.getStep())))
    ) {
        points.push({
            xy: { x: cellPosition.x, y: cellPosition.y - gridSettings.getHalfStep() },
            distance: Number.MAX_VALUE,
        });
    }
    if (
        canMoveUp &&
        (((isSmallUnitFrom === isSmallUnitTo || !isSmallUnitFrom) && fromPosition.y > toPosition.y) ||
            (isSmallUnitFrom &&
                !isSmallUnitTo &&
                fromPosition.y + gridSettings.getHalfStep() >
                    toPosition.y + (isSmallUnitTo ? gridSettings.getHalfStep() : gridSettings.getStep())))
    ) {
        points.push({
            xy: { x: cellPosition.x, y: cellPosition.y + gridSettings.getHalfStep() },
            distance: Number.MAX_VALUE,
        });
    }

    for (const p of points) {
        p.distance = getDistance(fromPosition, p.xy);
    }

    points.sort((a: IXYDistance, b: IXYDistance) => {
        if (a.distance < b.distance) return -1;
        if (a.distance > b.distance) return 1;
        return 0;
    });

    const twoClosestPoints = points.slice(0, 2);
    shuffle(twoClosestPoints);
    if (!twoClosestPoints.length) {
        return undefined;
    }
    if (twoClosestPoints.length === 1 || !mousePosition) {
        return twoClosestPoints[0].xy;
    }

    const distanceA = getDistance(twoClosestPoints[0].xy, mousePosition);
    const distanceB = getDistance(twoClosestPoints[1].xy, mousePosition);
    if (distanceA === distanceB || distanceA < distanceB) {
        return twoClosestPoints[0].xy;
    }

    return twoClosestPoints[1].xy;
}
