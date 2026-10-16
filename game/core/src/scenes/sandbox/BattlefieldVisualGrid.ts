import { GridMath, GridSettings, HoCMath } from "@heroesofcrypto/common";

/**
 * Authored geometry of background_stone_tiles_sinister_16x16.webp.
 *
 * The simulation remains a regular 16x16 square grid. These four points only describe how that logical
 * square is painted in the battlefield illustration, so screen-space cell effects can follow the visible
 * stone seams without leaking perspective into pathing, distances, occupancy or combat rules.
 */
export const BATTLEFIELD_ARTWORK = Object.freeze({
    width: 1576,
    height: 1378,
    field: Object.freeze({
        topLeft: Object.freeze({ x: 205, y: 329 }),
        topRight: Object.freeze({ x: 1293, y: 329 }),
        bottomRight: Object.freeze({ x: 1561, y: 1342 }),
        bottomLeft: Object.freeze({ x: 12, y: 1342 }),
    }),
});

/** Narrow bleed under the side panels removes the bitmap's rounded dark edge from the combat frame. */
export const BATTLEFIELD_HORIZONTAL_OVERSCAN = 1.03;

/** Keep the right-hand bleed while allowing the authored lower-left border to land on the frame corner. */
export const BATTLEFIELD_HORIZONTAL_BIAS = 0.011;

/**
 * Hand-traced centres of the 17x17 painted stone seams in the source artwork (top -> bottom).
 * The floor was painted with deliberate irregularities, so a single perspective transform cannot keep
 * every gameplay edge inside the visible grooves. These points are the visual grid; mechanics stay square.
 */
export const BATTLEFIELD_GRID_ROWS = [
    { y: 331, x: [245, 300, 368, 437, 503, 568, 634, 702, 768, 833, 902, 967, 1030, 1099, 1165, 1229, 1287] },
    { y: 375, x: [236, 292, 361, 432, 499, 565, 631, 701, 768, 834, 904, 970, 1035, 1104, 1171, 1236, 1296] },
    { y: 422, x: [226, 284, 354, 425, 494, 561, 629, 700, 768, 835, 906, 973, 1039, 1110, 1178, 1244, 1306] },
    { y: 471, x: [215, 276, 347, 419, 489, 557, 627, 698, 768, 837, 908, 977, 1045, 1117, 1186, 1253, 1317] },
    { y: 522, x: [204, 266, 339, 412, 483, 553, 624, 696, 768, 838, 910, 980, 1050, 1123, 1193, 1263, 1328] },
    { y: 575, x: [193, 257, 330, 405, 478, 549, 621, 695, 768, 839, 912, 984, 1056, 1130, 1202, 1272, 1339] },
    { y: 630, x: [181, 247, 322, 398, 472, 545, 619, 693, 768, 840, 914, 988, 1061, 1137, 1210, 1282, 1351] },
    { y: 687, x: [168, 237, 313, 391, 466, 541, 616, 691, 767, 842, 917, 992, 1067, 1144, 1219, 1292, 1364] },
    { y: 747, x: [155, 227, 304, 382, 460, 536, 613, 690, 767, 843, 920, 997, 1073, 1152, 1228, 1303, 1377] },
    { y: 810, x: [142, 215, 294, 374, 453, 531, 610, 688, 767, 845, 923, 1001, 1080, 1160, 1238, 1315, 1391] },
    { y: 877, x: [127, 204, 284, 365, 446, 526, 606, 686, 767, 846, 926, 1006, 1087, 1169, 1249, 1328, 1406] },
    { y: 947, x: [112, 191, 273, 356, 439, 520, 603, 683, 767, 848, 930, 1011, 1095, 1178, 1259, 1341, 1421] },
    { y: 1020, x: [96, 178, 262, 346, 431, 515, 599, 681, 767, 850, 934, 1017, 1103, 1188, 1271, 1355, 1438] },
    { y: 1097, x: [80, 165, 249, 336, 423, 509, 595, 679, 767, 852, 938, 1023, 1111, 1198, 1284, 1370, 1455] },
    { y: 1179, x: [62, 151, 237, 325, 415, 502, 591, 677, 767, 854, 942, 1029, 1120, 1208, 1297, 1385, 1474] },
    { y: 1255, x: [45, 137, 225, 315, 407, 496, 587, 674, 767, 855, 947, 1036, 1128, 1218, 1310, 1400, 1491] },
    { y: 1339, x: [27, 122, 212, 304, 399, 490, 583, 672, 767, 858, 952, 1042, 1137, 1229, 1323, 1417, 1510] },
] as const;

export type BattlefieldArtworkLayout = Readonly<{
    width: number;
    height: number;
    x: number;
    y: number;
}>;

/**
 * Fit the PAINTED field (not the bitmap rectangle) to the logical board. The bottom painted corners land
 * on the old square grid's bottom corners and the top painted seam lands on its top edge. Decorative walls
 * and braziers remain outside that quad and are allowed to crop at the viewport edge.
 */
export function battlefieldArtworkLayout(
    viewportWidth: number,
    viewportHeight: number,
    boardWidth: number,
    boardHeight: number,
): BattlefieldArtworkLayout {
    const field = BATTLEFIELD_ARTWORK.field;
    const fieldWidth = field.bottomRight.x - field.bottomLeft.x;
    const fieldHeight = field.bottomLeft.y - field.topLeft.y;
    const scaleX = (boardWidth * BATTLEFIELD_HORIZONTAL_OVERSCAN) / fieldWidth;
    const scaleY = boardHeight / fieldHeight;
    const bottomMidX = (field.bottomLeft.x + field.bottomRight.x) * 0.5;
    const artworkLeft = viewportWidth * 0.5 + boardWidth * BATTLEFIELD_HORIZONTAL_BIAS - bottomMidX * scaleX;
    const artworkTop = viewportHeight - field.bottomLeft.y * scaleY;
    const width = BATTLEFIELD_ARTWORK.width * scaleX;
    const height = BATTLEFIELD_ARTWORK.height * scaleY;
    return {
        width,
        height,
        x: artworkLeft + width * 0.5,
        y: artworkTop + height * 0.5,
    };
}

type Quad = Readonly<{
    bottomLeft: HoCMath.XY;
    bottomRight: HoCMath.XY;
    topRight: HoCMath.XY;
    topLeft: HoCMath.XY;
}>;

/** The authored field quad expressed in the existing logical world coordinate system. */
export function battlefieldVisualQuad(gs: GridSettings): Quad {
    const field = BATTLEFIELD_ARTWORK.field;
    const fieldWidth = field.bottomRight.x - field.bottomLeft.x;
    const bottomMidX = (field.bottomLeft.x + field.bottomRight.x) * 0.5;
    const worldWidth = gs.getMaxX() - gs.getMinX();
    const centerX = (gs.getMinX() + gs.getMaxX()) * 0.5;
    const horizontalBias = worldWidth * BATTLEFIELD_HORIZONTAL_BIAS;
    const visualCenterX = centerX + horizontalBias;
    const sourceXToWorld = (sourceX: number): number =>
        visualCenterX + ((sourceX - bottomMidX) / fieldWidth) * worldWidth * BATTLEFIELD_HORIZONTAL_OVERSCAN;
    return {
        bottomLeft: { x: visualCenterX - worldWidth * BATTLEFIELD_HORIZONTAL_OVERSCAN * 0.5, y: gs.getMinY() },
        bottomRight: { x: visualCenterX + worldWidth * BATTLEFIELD_HORIZONTAL_OVERSCAN * 0.5, y: gs.getMinY() },
        topRight: { x: sourceXToWorld(field.topRight.x), y: gs.getMaxY() },
        topLeft: { x: sourceXToWorld(field.topLeft.x), y: gs.getMaxY() },
    };
}

function worldPointToArtwork(point: HoCMath.XY, gs: GridSettings): HoCMath.XY {
    const field = BATTLEFIELD_ARTWORK.field;
    const fieldWidth = field.bottomRight.x - field.bottomLeft.x;
    const fieldHeight = field.bottomLeft.y - field.topLeft.y;
    const bottomMidX = (field.bottomLeft.x + field.bottomRight.x) * 0.5;
    const worldWidth = gs.getMaxX() - gs.getMinX();
    const worldHeight = gs.getMaxY() - gs.getMinY();
    const centerX = (gs.getMinX() + gs.getMaxX()) * 0.5 + worldWidth * BATTLEFIELD_HORIZONTAL_BIAS;
    return {
        x: bottomMidX + ((point.x - centerX) / (worldWidth * BATTLEFIELD_HORIZONTAL_OVERSCAN)) * fieldWidth,
        y: field.topLeft.y + ((gs.getMaxY() - point.y) / worldHeight) * fieldHeight,
    };
}

/**
 * Project a square-mechanics point through the hand-traced grid painted into the floor texture.
 * Callers in steady render loops may provide `out` to reuse their own point instead of allocating one.
 */
export function projectBattlefieldPoint(point: HoCMath.XY, gs: GridSettings, out?: HoCMath.XY): HoCMath.XY {
    const width = gs.getMaxX() - gs.getMinX();
    const height = gs.getMaxY() - gs.getMinY();
    const columnCount = BATTLEFIELD_GRID_ROWS[0].x.length - 1;
    const rowCount = BATTLEFIELD_GRID_ROWS.length - 1;
    const columnCoordinate = (width > 0 ? (point.x - gs.getMinX()) / width : 0) * columnCount;
    // Logical Y grows upward; artwork rows are stored downward from the top seam.
    const rowCoordinate = (1 - (height > 0 ? (point.y - gs.getMinY()) / height : 0)) * rowCount;
    const columnIndex =
        columnCoordinate <= 0 ? 0 : columnCoordinate >= columnCount ? columnCount - 1 : Math.floor(columnCoordinate);
    const columnFraction = columnCoordinate - columnIndex;
    const rowIndex = rowCoordinate <= 0 ? 0 : rowCoordinate >= rowCount ? rowCount - 1 : Math.floor(rowCoordinate);
    const rowFraction = rowCoordinate - rowIndex;
    const right = BATTLEFIELD_GRID_ROWS[rowIndex];
    const left = BATTLEFIELD_GRID_ROWS[rowIndex + 1];
    const rightX = right.x[columnIndex] + (right.x[columnIndex + 1] - right.x[columnIndex]) * columnFraction;
    const leftX = left.x[columnIndex] + (left.x[columnIndex + 1] - left.x[columnIndex]) * columnFraction;
    const artworkX = rightX + (leftX - rightX) * rowFraction;
    const artworkY = right.y + (left.y - right.y) * rowFraction;
    const field = BATTLEFIELD_ARTWORK.field;
    const fieldWidth = field.bottomRight.x - field.bottomLeft.x;
    const fieldHeight = field.bottomLeft.y - field.topLeft.y;
    const bottomMidX = (field.bottomLeft.x + field.bottomRight.x) * 0.5;
    const worldWidth = width;
    const worldHeight = height;
    const centerX = (gs.getMinX() + gs.getMaxX()) * 0.5 + worldWidth * BATTLEFIELD_HORIZONTAL_BIAS;
    const projected = out ?? { x: 0, y: 0 };
    projected.x = centerX + ((artworkX - bottomMidX) / fieldWidth) * worldWidth * BATTLEFIELD_HORIZONTAL_OVERSCAN;
    projected.y = gs.getMaxY() - ((artworkY - field.topLeft.y) / fieldHeight) * worldHeight;
    return projected;
}

export type ProjectedBattlefieldMetrics = Readonly<{
    center: HoCMath.XY;
    width: number;
    height: number;
    cellSize: number;
}>;

export type MutableProjectedBattlefieldMetrics = {
    center: HoCMath.XY;
    width: number;
    height: number;
    cellSize: number;
};

// Temporary side samples never escape this synchronous helper. Reusing them avoids eight tiny objects
// for every dust, smoke, terrain and collapse measurement while preserving a fresh result by default.
const metricsInputScratch: HoCMath.XY = { x: 0, y: 0 };
const metricsLeftScratch: HoCMath.XY = { x: 0, y: 0 };
const metricsRightScratch: HoCMath.XY = { x: 0, y: 0 };
const metricsBottomScratch: HoCMath.XY = { x: 0, y: 0 };
const metricsTopScratch: HoCMath.XY = { x: 0, y: 0 };

/** Local painted cell dimensions around a logical point, for particles that cannot be polygon-shaped. */
export function projectedBattlefieldMetricsAtPoint(
    point: HoCMath.XY,
    gs: GridSettings,
    out?: MutableProjectedBattlefieldMetrics,
): ProjectedBattlefieldMetrics {
    const half = gs.getHalfStep();
    const metrics: MutableProjectedBattlefieldMetrics = out ?? {
        center: { x: 0, y: 0 },
        width: 0,
        height: 0,
        cellSize: 0,
    };
    projectBattlefieldPoint(point, gs, metrics.center);

    metricsInputScratch.x = point.x - half;
    metricsInputScratch.y = point.y;
    const left = projectBattlefieldPoint(metricsInputScratch, gs, metricsLeftScratch);
    metricsInputScratch.x = point.x + half;
    const right = projectBattlefieldPoint(metricsInputScratch, gs, metricsRightScratch);
    metricsInputScratch.x = point.x;
    metricsInputScratch.y = point.y - half;
    const bottom = projectBattlefieldPoint(metricsInputScratch, gs, metricsBottomScratch);
    metricsInputScratch.y = point.y + half;
    const top = projectBattlefieldPoint(metricsInputScratch, gs, metricsTopScratch);
    const width = Math.hypot(right.x - left.x, right.y - left.y);
    const height = Math.hypot(top.x - bottom.x, top.y - bottom.y);
    metrics.width = width;
    metrics.height = height;
    metrics.cellSize = (width + height) * 0.5;
    return metrics;
}

/**
 * Exact logical centre of one side of a cell, without the legacy attacker-relative one-pixel nudge used
 * by combat ray traversal. Visual markers must land on the painted seam itself, while the authoritative
 * attack calculation can keep using GridMath.getRangeAttackSideCenter/getClosestSideCenterDetailed.
 */
export function rangeAttackCellSideCenter(
    cell: HoCMath.XY,
    side: GridMath.RangeAttackCellSide,
    gs: GridSettings,
): HoCMath.XY {
    const center = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
    switch (side) {
        case GridMath.RangeAttackCellSide.LEFT:
            return { x: center.x - gs.getHalfStep(), y: center.y };
        case GridMath.RangeAttackCellSide.RIGHT:
            return { x: center.x + gs.getHalfStep(), y: center.y };
        case GridMath.RangeAttackCellSide.DOWN:
            return { x: center.x, y: center.y - gs.getHalfStep() };
        case GridMath.RangeAttackCellSide.UP:
        default:
            return { x: center.x, y: center.y + gs.getHalfStep() };
    }
}

/** Exact centre of a ranged target edge after it is bent onto the hand-traced battlefield grid. */
export function projectedRangeAttackCellSideCenter(
    cell: HoCMath.XY,
    side: GridMath.RangeAttackCellSide,
    gs: GridSettings,
): HoCMath.XY {
    return projectBattlefieldPoint(rangeAttackCellSideCenter(cell, side, gs), gs);
}

/**
 * Point where a ray leaves the shooter's rectangular footprint.
 *
 * Unit positions are footprint centres. Starting a trajectory there is correct only for a point-sized
 * body: on a 2x2 Tsar Cannon it puts the fletching between the four occupied cells. Intersect the aiming
 * ray with the body's front edge instead, so a horizontal cannon shot begins exactly one cell to the left
 * or right of its centre and diagonal shots use the corresponding front edge/corner.
 */
export function rangeAttackFootprintEdgePoint(
    center: HoCMath.XY,
    target: HoCMath.XY,
    footprintWidth: number,
    footprintHeight: number,
    gs: GridSettings,
): HoCMath.XY {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < 0.001 && absDy < 0.001) return { ...center };

    const halfWidth = (Math.max(1, footprintWidth) * gs.getStep()) / 2;
    const halfHeight = (Math.max(1, footprintHeight) * gs.getStep()) / 2;
    const xScale = absDx > 0.001 ? halfWidth / absDx : Number.POSITIVE_INFINITY;
    const yScale = absDy > 0.001 ? halfHeight / absDy : Number.POSITIVE_INFINITY;
    // Do not overshoot an unusually close target inside the footprint.
    const scale = Math.min(1, xScale, yScale);
    return { x: center.x + dx * scale, y: center.y + dy * scale };
}

/** Resolve a pointer on the painted floor back to the unchanged square-mechanics board. */
export function unprojectBattlefieldPoint(point: HoCMath.XY, gs: GridSettings): HoCMath.XY | undefined {
    const artworkPoint = worldPointToArtwork(point, gs);
    const rowCount = BATTLEFIELD_GRID_ROWS.length - 1;
    const columnCount = BATTLEFIELD_GRID_ROWS[0].x.length - 1;
    if (artworkPoint.y < BATTLEFIELD_GRID_ROWS[0].y || artworkPoint.y > BATTLEFIELD_GRID_ROWS[rowCount].y) {
        return undefined;
    }

    let row = Math.min(
        rowCount - 1,
        BATTLEFIELD_GRID_ROWS.findIndex((candidate, index) => {
            const next = BATTLEFIELD_GRID_ROWS[index + 1];
            return !!next && artworkPoint.y >= candidate.y && artworkPoint.y <= next.y;
        }),
    );
    if (row < 0) row = rowCount - 1;
    const right = BATTLEFIELD_GRID_ROWS[row];
    const left = BATTLEFIELD_GRID_ROWS[row + 1];
    const rowFraction = (artworkPoint.y - right.y) / Math.max(1e-9, left.y - right.y);
    const xBoundaries = right.x.map((rightX, index) => rightX + (left.x[index] - rightX) * rowFraction);
    if (artworkPoint.x < xBoundaries[0] || artworkPoint.x > xBoundaries[columnCount]) return undefined;

    let column = xBoundaries.findIndex(
        (boundary, index) =>
            index < columnCount && artworkPoint.x >= boundary && artworkPoint.x <= xBoundaries[index + 1],
    );
    if (column < 0) column = columnCount - 1;
    const columnFraction =
        (artworkPoint.x - xBoundaries[column]) / Math.max(1e-9, xBoundaries[column + 1] - xBoundaries[column]);
    const width = gs.getMaxX() - gs.getMinX();
    const height = gs.getMaxY() - gs.getMinY();
    return {
        x: gs.getMinX() + ((column + columnFraction) / columnCount) * width,
        y: gs.getMaxY() - ((row + rowFraction) / rowCount) * height,
    };
}

const MAX_CACHED_PROJECTED_RECTS = 512;
const projectedRectCaches = new WeakMap<GridSettings, Map<string, number[]>>();

export function projectedRectPoints(
    left: number,
    bottom: number,
    right: number,
    top: number,
    gs: GridSettings,
): number[] {
    let cache = projectedRectCaches.get(gs);
    if (!cache) {
        cache = new Map();
        projectedRectCaches.set(gs, cache);
    }
    const cacheKey = `${left},${bottom},${right},${top}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached.slice();

    const result = projectedPolyline(
        [
            { x: left, y: bottom },
            { x: right, y: bottom },
            { x: right, y: top },
            { x: left, y: top },
            { x: left, y: bottom },
        ],
        gs,
    );
    if (cache.size >= MAX_CACHED_PROJECTED_RECTS) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(cacheKey, result.slice());
    return result;
}

const MAX_CACHED_PROJECTED_CELLS = 1024;
const projectedCellCaches = new WeakMap<GridSettings, Map<string, number[]>>();

export function projectedCellPoints(cell: HoCMath.XY, gs: GridSettings, insetCells = 0): number[] {
    let cache = projectedCellCaches.get(gs);
    if (!cache) {
        cache = new Map();
        projectedCellCaches.set(gs, cache);
    }
    const cacheKey = `${cell.x},${cell.y},${insetCells}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached.slice();

    const step = gs.getStep();
    const inset = Math.max(0, Math.min(0.49, insetCells)) * step;
    const left = gs.getMinX() + cell.x * step + inset;
    const bottom = gs.getMinY() + cell.y * step + inset;
    const result = projectedRectPoints(left, bottom, left + step - inset * 2, bottom + step - inset * 2, gs);
    if (cache.size >= MAX_CACHED_PROJECTED_CELLS) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(cacheKey, result.slice());
    return result;
}

type ProjectedPolylineCache = {
    readonly xBoundaries: readonly number[];
    readonly yBoundaries: readonly number[];
    readonly paths: Map<string, number[]>;
};

const MAX_CACHED_PROJECTED_POLYLINES = 512;
const projectedPolylineCaches = new WeakMap<GridSettings, ProjectedPolylineCache>();

const projectedPolylineCacheFor = (gs: GridSettings): ProjectedPolylineCache => {
    let cache = projectedPolylineCaches.get(gs);
    if (cache) return cache;
    const step = gs.getStep();
    cache = {
        xBoundaries: BATTLEFIELD_GRID_ROWS[0].x.map((_, index) => gs.getMinX() + index * step),
        yBoundaries: BATTLEFIELD_GRID_ROWS.map((_, index) => gs.getMaxY() - index * step),
        paths: new Map(),
    };
    projectedPolylineCaches.set(gs, cache);
    return cache;
};

const projectedPolylineCacheKey = (points: readonly HoCMath.XY[]): string => {
    let key = "";
    for (const point of points) key += `${point.x},${point.y};`;
    return key;
};

export function projectedPolyline(points: readonly HoCMath.XY[], gs: GridSettings): number[] {
    if (points.length === 0) return [];
    if (points.length === 1) {
        const projected = projectBattlefieldPoint(points[0], gs);
        return [projected.x, projected.y];
    }

    // Placement washes, borders and cell rectangles ask for the same long paths on every frame. Cache
    // those value-identical shapes per immutable GridSettings instance so their seam subdivision and
    // projection do not keep allocating arrays or feeding identical geometry back through Pixi. Two-point
    // combat/hover guides can move continuously, so leave those uncached rather than filling the bound.
    const cache = projectedPolylineCacheFor(gs);
    const cacheKey = points.length >= 4 ? projectedPolylineCacheKey(points) : undefined;
    if (cacheKey !== undefined) {
        const cached = cache.paths.get(cacheKey);
        // Existing geometry helpers adjust their returned arrays in place. Keep the cached canonical path
        // private and hand callers a cheap copy so one border's trim cannot bleed into another shape.
        if (cached) return cached.slice();
    }

    const result: number[] = [];
    for (let segment = 0; segment < points.length - 1; segment++) {
        const from = points[segment];
        const to = points[segment + 1];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const samples = [0, 1];
        if (Math.abs(dx) > 1e-9) {
            for (const boundary of cache.xBoundaries) {
                const t = (boundary - from.x) / dx;
                if (t > 1e-9 && t < 1 - 1e-9) samples.push(t);
            }
        }
        if (Math.abs(dy) > 1e-9) {
            for (const boundary of cache.yBoundaries) {
                const t = (boundary - from.y) / dy;
                if (t > 1e-9 && t < 1 - 1e-9) samples.push(t);
            }
        }
        samples.sort((a, b) => a - b);
        for (let sampleIndex = segment === 0 ? 0 : 1; sampleIndex < samples.length; sampleIndex++) {
            if (sampleIndex > 0 && Math.abs(samples[sampleIndex] - samples[sampleIndex - 1]) < 1e-9) continue;
            const t = samples[sampleIndex];
            const projected = projectBattlefieldPoint({ x: from.x + dx * t, y: from.y + dy * t }, gs);
            result.push(projected.x, projected.y);
        }
    }
    if (cacheKey !== undefined) {
        if (cache.paths.size >= MAX_CACHED_PROJECTED_POLYLINES) {
            const oldest = cache.paths.keys().next().value;
            if (oldest !== undefined) cache.paths.delete(oldest);
        }
        cache.paths.set(cacheKey, result.slice());
    }
    return result;
}
