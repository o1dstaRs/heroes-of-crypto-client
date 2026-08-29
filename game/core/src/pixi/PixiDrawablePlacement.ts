import { Container, FillGradient, Graphics, PerspectiveMesh, Rectangle, Texture } from "pixi.js";
import {
    GridSettings,
    GridMath,
    SquarePlacement,
    PlacementPositionType,
    PlacementType,
    IPlacement,
    TeamVals,
    type TeamType,
    type HoCMath,
} from "@heroesofcrypto/common";

import { projectedCellPoints } from "../scenes/sandbox/BattlefieldVisualGrid";
import {
    drawMovementArea,
    ENEMY_MOVEMENT_HIGHLIGHT_COLOR,
    movementFillAlphaForPhase,
    tunedCellFillCornerPoints,
    tunedCellFillPolygon,
} from "../scenes/movementAreaVisual";
import { images } from "../generated/image_imports";
import { personalArmyPresetFor } from "../scenes/personalArmyTint";
import { isGreenTeam } from "../scenes/teamColors";

export interface IDrawablePlacement extends IPlacement {
    draw(gfx: Graphics, frameContainer: Container): void;
}

/**
 * Client-side rectangular deployment geometry.
 *
 * Keep this separate from common's RectanglePlacement: legacy battle AI still
 * evaluates its historical top/bottom opening, while every interactive board
 * (sandbox and ranked) must expose the upgrade-dependent left/right columns.
 */
class SideRectanglePlacement implements IPlacement {
    protected readonly placementPositionType: PlacementPositionType;
    private readonly gridSettings: GridSettings;
    private readonly size: number;
    private readonly possibleCellHashesSet: Set<number>;
    public constructor(gridSettings: GridSettings, placementPositionType: PlacementPositionType, size = 3) {
        if (![3, 4, 5, 6].includes(size)) {
            throw new Error("Only the following placement depths are supported: 3, 4, 5, 6.");
        }
        this.gridSettings = gridSettings;
        this.placementPositionType = placementPositionType;
        this.size = size;
        this.possibleCellHashesSet = new Set(this.possibleCellPositions().map((cell) => (cell.x << 4) | cell.y));
    }
    public getType(): PlacementType {
        return PlacementType.RECTANGLE;
    }
    public getSize(): number {
        return this.size;
    }
    public isAllowed(position: HoCMath.XY): boolean {
        // IPlacement.isAllowed is world-space across common (UnitsHolder, PathHelper and startScene).
        // possibleCellHashes remains the explicit cell-space API used by interactive placement.
        const cell = GridMath.getCellForPosition(this.gridSettings, position);
        return this.possibleCellHashesSet.has((cell.x << 4) | cell.y);
    }
    public possibleCellHashes(): Set<number> {
        return this.possibleCellHashesSet;
    }
    public possibleCellPositions(
        isSmallUnit = true,
        footprintWidth = isSmallUnit ? 1 : 2,
        footprintHeight = isSmallUnit ? 1 : 2,
    ): HoCMath.XY[] {
        const gridSize = this.gridSettings.getGridSize();
        const widthAdjustment = Math.max(0, Math.floor(footprintWidth) - 1);
        const heightAdjustment = Math.max(0, Math.floor(footprintHeight) - 1);
        const edgeInset = this.size >= 6 ? 0 : 1;
        const smallestVerticalInset = this.size === 3 ? 1 : 0;
        const isLeft =
            this.placementPositionType === PlacementPositionType.LOWER_LEFT ||
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT;
        const isRight =
            this.placementPositionType === PlacementPositionType.UPPER_LEFT ||
            this.placementPositionType === PlacementPositionType.UPPER_RIGHT;
        if (!isLeft && !isRight) {
            throw new Error("Invalid placement position type.");
        }

        const firstX = isLeft ? edgeInset + widthAdjustment : gridSize - 1 - edgeInset;
        const lastXExclusive = isLeft ? firstX + this.size - widthAdjustment : firstX - this.size + widthAdjustment;
        const xStep = isLeft ? 1 : -1;
        const firstY = smallestVerticalInset + heightAdjustment;
        const lastYExclusive = gridSize - smallestVerticalInset;
        const positions: HoCMath.XY[] = [];

        for (let x = firstX; x !== lastXExclusive; x += xStep) {
            for (let y = firstY; y !== lastYExclusive; y += 1) {
                positions.push({ x, y });
            }
        }
        return positions;
    }
}

let spawnFlowPhase = 0;
let enemyMovementPhase = 0;
export function setSpawnFlowPhase(phase: number, currentEnemyMovementPhase = phase): void {
    spawnFlowPhase = phase;
    enemyMovementPhase = currentEnemyMovementPhase;
}

// Placement zones are coloured by TEAM, not by viewer: LOWER's rectangle is green, UPPER's is red, on every
// screen. An UPPER player's own zone therefore reads red — see scenes/teamColors.ts for why that is the rule.
const SPAWN_COLOR_GREEN = 0x051f0e;
const SPAWN_BOUNDARY_COLOR_GREEN = 0x78dc96;
/** Dark emerald sampled from the approved green deployment-field reference. */
export const GREEN_PLACEMENT_HIGHLIGHT_COLOR = 0x102b1b;
/** Keep the dark flag green readable while making its inner wash five percentage points more transparent. */
export const GREEN_PLACEMENT_OPACITY_SCALE = 2;
const CAN_RENDER_SPAWN_GRADIENT =
    typeof document !== "undefined" && document.createElement("canvas").getContext("2d") !== null;
const GREEN_SPAWN_GRADIENT_STOPS = [
    { offset: 0, color: 0x031208 },
    { offset: 0.22, color: SPAWN_COLOR_GREEN },
    { offset: 0.5, color: 0x176238 },
    { offset: 0.78, color: SPAWN_COLOR_GREEN },
    { offset: 1, color: 0x031208 },
];
const SPAWN_GRADIENT_CACHE = new Map<string, FillGradient>();
const spawnBoundaryColor = (_color: number): number => SPAWN_BOUNDARY_COLOR_GREEN;

export const placementGreenCarpetTextureKey = (columns = 3): keyof typeof images => {
    if (columns >= 5) return "placement_carpet_green_uniform_gold_aaa_5col_v16";
    if (columns === 4) return "placement_carpet_green_uniform_gold_aaa_4col_v16";
    return "placement_carpet_green_uniform_gold_aaa_3col_v16";
};

export const placementGoldBorderTextureKey = (columns = 3, rows = 16, continuous = false): keyof typeof images => {
    const rowCount = rows <= 14 ? 14 : 16;
    void continuous;
    if (columns >= 6) return `placement_gold_outer_border_green_continuous_6col_${rowCount}row_v23`;
    if (columns === 5) return `placement_gold_outer_border_green_continuous_5col_${rowCount}row_v23`;
    if (columns === 4) return `placement_gold_outer_border_green_continuous_4col_${rowCount}row_v23`;
    return `placement_gold_outer_border_green_continuous_3col_${rowCount}row_v23`;
};

/** Build one world-space gradient for the whole field; local-space fills restart inside every tile. */
const spawnGradient = (color: number, polygons: readonly number[][]): FillGradient | undefined => {
    if (!CAN_RENDER_SPAWN_GRADIENT || !polygons.length) return undefined;

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const polygon of polygons) {
        for (let index = 1; index < polygon.length; index += 2) {
            minY = Math.min(minY, polygon[index]);
            maxY = Math.max(maxY, polygon[index]);
        }
    }
    const key = `${color}:${minY.toFixed(3)}:${maxY.toFixed(3)}`;
    const cached = SPAWN_GRADIENT_CACHE.get(key);
    if (cached) return cached;

    const gradient = new FillGradient({
        start: { x: 0, y: minY },
        end: { x: 0, y: maxY },
        textureSpace: "global",
        colorStops: GREEN_SPAWN_GRADIENT_STOPS,
    });
    SPAWN_GRADIENT_CACHE.set(key, gradient);
    return gradient;
};

/**
 * Keep the deployment wash off the painted grout. The inset is expressed in logical cell units so it
 * follows the hand-traced battlefield projection and leaves a consistent dark seam at every board depth.
 */
export const PLACEMENT_TILE_INSET_CELLS = 0.028;
export const PLACEMENT_CARPET_HEIGHT_SCALE = 1.002;
export const placementCarpetOpacityForPhase = movementFillAlphaForPhase;
export const GREEN_PLACEMENT_CARPET_TOP_EXTENSION = 0.01;
/** Align the bitmap frame's outer top edge with the raised deployment wash. */
export const PLACEMENT_GOLD_BORDER_TOP_EXTENSION = 0.001;
export const PLACEMENT_GOLD_BORDER_BOTTOM_DROP = 0.001;
export const PLACEMENT_GOLD_BORDER_LEFT_EXTENSION = 0.003;
export const PLACEMENT_GOLD_BORDER_RIGHT_EXTENSION = 0.002;
export const GREEN_PLACEMENT_GOLD_BORDER_OPACITY = 0.6;
export const RED_PLACEMENT_GOLD_BORDER_TOP_OPACITY = 0.6;
export const RED_PLACEMENT_GOLD_BORDER_RIGHT_OPACITY = 0.6;
export const RED_PLACEMENT_GOLD_BORDER_LEFT_OPACITY = 0.6;
export const RED_PLACEMENT_GOLD_BORDER_BOTTOM_OPACITY = 0.6;
const PLACEMENT_GOLD_BORDER_EDGE_TEXTURE_DEPTH = 16;
/** Stop the wash at the frame's inner edge so no bright team-colour line leaks above the gold. */
export const PLACEMENT_WASH_TOP_EXTENSION_RATIO = PLACEMENT_GOLD_BORDER_TOP_EXTENSION;
export const PLACEMENT_WASH_TOP_OPACITY_MULTIPLIER = 1;
/** Keep the raised top cap at the exact same opacity as the rest of the field. */
export const PLACEMENT_WASH_TOP_MIN_ALPHA = 0;
/** Do not brighten the red top cap beneath the frame's translucent gold edge. */
export const RED_PLACEMENT_WASH_TOP_OPACITY_MULTIPLIER = 1;
export const RED_PLACEMENT_WASH_TOP_MIN_ALPHA = 0;
/** Pull the bottom wash slightly inward so it stops at the frame's inner edge. */
export const PLACEMENT_WASH_BOTTOM_TRIM_CELLS = 0.012;
const PLACEMENT_BOUNDARY_DEPTH = 0.077;
const PLACEMENT_BOUNDARY_OPACITY = 0.16;
export const PLACEMENT_BOUNDARY_TOP_EXTENSION = 0.01;

/**
 * The draft rails paint these dark cloth colours at 55–65% opacity. A slightly lighter board treatment keeps
 * the native stone texture legible while retaining the same deep-green / burgundy read.
 */
export function placementTileOpacity(phase: number): number {
    const pulse = (Math.sin(phase * 0.65) + 1) * 0.5;
    return 0.34 + pulse * 0.04;
}

/** The exact inset polygon used by placement rendering; exported so seam preservation stays testable. */
export function placementTilePolygon(cell: HoCMath.XY, gs: GridSettings): number[] {
    return tunedCellFillPolygon(cell, gs, PLACEMENT_TILE_INSET_CELLS);
}

/**
 * Treat the deployment field as one continuous surface. Its four corners come from the outer corners of
 * the corner cells, without the per-cell inset used by hover/boundary accents, so the tint also crosses the
 * native internal grout instead of becoming a collection of separately coloured tiles.
 */
export function placementZonePolygon(cells: readonly HoCMath.XY[], gs: GridSettings): number[] {
    if (!cells.length) return [];

    const minX = Math.min(...cells.map(({ x }) => x));
    const maxX = Math.max(...cells.map(({ x }) => x));
    const minY = Math.min(...cells.map(({ y }) => y));
    const maxY = Math.max(...cells.map(({ y }) => y));
    const byKey = new Map(cells.map((cell) => [placementCellKey(cell), cell]));
    const cornerPolygon = (x: number, y: number): number[] => {
        const cell = byKey.get(placementCellKey({ x, y }));
        if (!cell) throw new Error("Placement zone must contain all four corner cells.");
        return tunedCellFillCornerPoints(cell, gs);
    };
    const bottomLeft = cornerPolygon(minX, minY);
    const bottomRight = cornerPolygon(maxX, minY);
    const topRight = cornerPolygon(maxX, maxY);
    const topLeft = cornerPolygon(minX, maxY);

    return [
        bottomLeft[0],
        bottomLeft[1],
        bottomRight[2],
        bottomRight[3],
        topRight[4],
        topRight[5],
        topLeft[6],
        topLeft[7],
    ];
}

/** Fill the narrow strip between the top row and the raised gold frame without moving the playable zone. */
export function placementWashTopExtensionPolygon(cells: readonly HoCMath.XY[], gs: GridSettings): number[] {
    const zone = placementZonePolygon(cells, gs);
    if (!zone.length) return [];

    const minX = Math.min(...cells.map(({ x }) => x));
    const maxX = Math.max(...cells.map(({ x }) => x));
    const maxY = Math.max(...cells.map(({ y }) => y));
    const byKey = new Map(cells.map((cell) => [placementCellKey(cell), cell]));
    const topLeftCell = byKey.get(placementCellKey({ x: minX, y: maxY }));
    const topRightCell = byKey.get(placementCellKey({ x: maxX, y: maxY }));
    if (!topLeftCell || !topRightCell) return [];

    const topLeftInset = tunedCellFillCornerPoints(topLeftCell, gs, PLACEMENT_TILE_INSET_CELLS);
    const topRightInset = tunedCellFillCornerPoints(topRightCell, gs, PLACEMENT_TILE_INSET_CELLS);
    const fullPolygons = cells.map((cell) => projectedCellPoints(cell, gs));
    const fullMinY = Math.min(...fullPolygons.flatMap((points) => [points[1], points[3], points[5], points[7]]));
    const fullMaxY = Math.max(...fullPolygons.flatMap((points) => [points[1], points[3], points[5], points[7]]));
    const extension = (fullMaxY - fullMinY) * PLACEMENT_WASH_TOP_EXTENSION_RATIO;

    return [
        topLeftInset[6],
        topLeftInset[7],
        topRightInset[4],
        topRightInset[5],
        zone[4],
        zone[5] + extension,
        zone[6],
        zone[7] + extension,
    ];
}

/** Placement wash face with a bottom-only trim; all internal and side seams retain the shared inset. */
export function placementWashCellPolygon(cell: HoCMath.XY, cells: readonly HoCMath.XY[], gs: GridSettings): number[] {
    const polygon = placementTilePolygon(cell, gs);
    const minY = Math.min(...cells.map(({ y }) => y));
    if (cell.y !== minY) return polygon;

    const amount = PLACEMENT_WASH_BOTTOM_TRIM_CELLS / (1 - PLACEMENT_TILE_INSET_CELLS * 2);
    polygon[0] += (polygon[6] - polygon[0]) * amount;
    polygon[1] += (polygon[7] - polygon[1]) * amount;
    polygon[2] += (polygon[4] - polygon[2]) * amount;
    polygon[3] += (polygon[5] - polygon[3]) * amount;
    return polygon;
}

function drawPlacementWash(
    gfx: Graphics,
    cells: readonly HoCMath.XY[],
    gs: GridSettings,
    color: number,
    phase: number,
    opacityScale = 1,
    topOpacityMultiplier = PLACEMENT_WASH_TOP_OPACITY_MULTIPLIER,
    topMinAlpha = PLACEMENT_WASH_TOP_MIN_ALPHA,
): void {
    const alpha = movementFillAlphaForPhase(phase) * opacityScale;
    for (const cell of cells) {
        gfx.poly(placementWashCellPolygon(cell, cells, gs)).fill({ color, alpha });
    }
    const topExtension = placementWashTopExtensionPolygon(cells, gs);
    if (topExtension.length) {
        gfx.poly(topExtension).fill({
            color,
            alpha: Math.min(
                1,
                Math.max(topMinAlpha, movementFillAlphaForPhase(phase) * opacityScale * topOpacityMultiplier),
            ),
        });
    }
}

export interface PlacementBoundarySides {
    left: boolean;
    right: boolean;
    bottom: boolean;
    top: boolean;
}

const placementCellKey = (cell: HoCMath.XY): string => `${cell.x}:${cell.y}`;

/** Identify only the outward-facing sides; shared cell edges never receive the boundary accent. */
export function placementBoundarySides(cell: HoCMath.XY, occupiedCells: ReadonlySet<string>): PlacementBoundarySides {
    return {
        left: !occupiedCells.has(placementCellKey({ x: cell.x - 1, y: cell.y })),
        right: !occupiedCells.has(placementCellKey({ x: cell.x + 1, y: cell.y })),
        bottom: !occupiedCells.has(placementCellKey({ x: cell.x, y: cell.y - 1 })),
        top: !occupiedCells.has(placementCellKey({ x: cell.x, y: cell.y + 1 })),
    };
}

interface Point {
    x: number;
    y: number;
}

const lerpPoint = (from: Point, to: Point, amount: number): Point => ({
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
});

const pointArray = (...points: Point[]): number[] => points.flatMap(({ x, y }) => [x, y]);

/** Trim vertical edge strips where a horizontal strip already owns the corner, preventing alpha stacking. */
export function placementVerticalBoundarySpan(sides: PlacementBoundarySides): { start: number; end: number } {
    return {
        start: sides.bottom ? PLACEMENT_BOUNDARY_DEPTH : 0,
        end: sides.top ? 1 - PLACEMENT_BOUNDARY_DEPTH : 1,
    };
}

/** Draw a short strip inside one tile face. The existing inset keeps every strip clear of painted grout. */
function drawBoundarySides(gfx: Graphics, polygon: number[], sides: PlacementBoundarySides, color: number): void {
    const bottomLeft = { x: polygon[0], y: polygon[1] };
    const bottomRight = { x: polygon[2], y: polygon[3] };
    const topRight = { x: polygon[4], y: polygon[5] };
    const topLeft = { x: polygon[6], y: polygon[7] };
    const highlightColor = spawnBoundaryColor(color);
    const leftInnerBottom = lerpPoint(bottomLeft, bottomRight, PLACEMENT_BOUNDARY_DEPTH);
    const leftInnerTop = lerpPoint(topLeft, topRight, PLACEMENT_BOUNDARY_DEPTH);
    const rightInnerBottom = lerpPoint(bottomRight, bottomLeft, PLACEMENT_BOUNDARY_DEPTH);
    const rightInnerTop = lerpPoint(topRight, topLeft, PLACEMENT_BOUNDARY_DEPTH);
    const extendedTopLeft = lerpPoint(topLeft, bottomLeft, -PLACEMENT_BOUNDARY_TOP_EXTENSION);
    const extendedTopRight = lerpPoint(topRight, bottomRight, -PLACEMENT_BOUNDARY_TOP_EXTENSION);
    const verticalSpan = placementVerticalBoundarySpan(sides);
    const fill = (points: number[]): void => {
        gfx.poly(points).fill({ color: highlightColor, alpha: PLACEMENT_BOUNDARY_OPACITY });
    };

    if (sides.left) {
        fill(
            pointArray(
                lerpPoint(bottomLeft, topLeft, verticalSpan.start),
                lerpPoint(leftInnerBottom, leftInnerTop, verticalSpan.start),
                lerpPoint(leftInnerBottom, leftInnerTop, verticalSpan.end),
                lerpPoint(bottomLeft, topLeft, verticalSpan.end),
            ),
        );
    }
    if (sides.right) {
        fill(
            pointArray(
                lerpPoint(rightInnerBottom, rightInnerTop, verticalSpan.start),
                lerpPoint(bottomRight, topRight, verticalSpan.start),
                lerpPoint(bottomRight, topRight, verticalSpan.end),
                lerpPoint(rightInnerBottom, rightInnerTop, verticalSpan.end),
            ),
        );
    }
    if (sides.bottom) {
        fill(
            pointArray(
                bottomLeft,
                bottomRight,
                lerpPoint(bottomRight, topRight, PLACEMENT_BOUNDARY_DEPTH),
                lerpPoint(bottomLeft, topLeft, PLACEMENT_BOUNDARY_DEPTH),
            ),
        );
    }
    if (sides.top) {
        fill(
            pointArray(
                lerpPoint(topLeft, bottomLeft, PLACEMENT_BOUNDARY_DEPTH),
                lerpPoint(topRight, bottomRight, PLACEMENT_BOUNDARY_DEPTH),
                extendedTopRight,
                extendedTopLeft,
            ),
        );
    }
}

/**
 * Deployment zones use the same visual language as the current-turn movement sheet: softly tinted tile
 * faces, no continuous perimeter stroke. Insets preserve the native internal grout while the boundary-tile
 * strips keep the zone footprint readable without recolouring the seams.
 */
function drawSpawnTiles(gfx: Graphics, gs: GridSettings, cells: readonly HoCMath.XY[], color: number): void {
    const alpha = placementTileOpacity(spawnFlowPhase);
    const occupiedCells = new Set(cells.map(placementCellKey));
    const polygons = cells.map((cell) => tunedCellFillCornerPoints(cell, gs, PLACEMENT_TILE_INSET_CELLS));
    const zonePolygon = placementZonePolygon(cells, gs);
    const gradient = spawnGradient(color, zonePolygon.length ? [zonePolygon] : []);

    if (zonePolygon.length) {
        // One polygon makes the deployment tint a single surface. The battlefield texture remains visible
        // through its alpha, but its internal grout no longer splits the colour layer into separate tiles.
        gfx.poly(zonePolygon).fill(gradient ? { fill: gradient, alpha } : { color, alpha });
    }

    for (let index = 0; index < cells.length; index += 1) {
        const cell = cells[index];
        const polygon = polygons[index];
        drawBoundarySides(gfx, polygon, placementBoundarySides(cell, occupiedCells), color);
    }
}

interface PlacementCarpetCellVisual {
    mesh: PerspectiveMesh;
    texture: Texture;
}

interface PlacementCarpetVisual {
    source: Texture;
    layoutKey: string;
    cells: Map<string, PlacementCarpetCellVisual>;
    layer: Container;
    seams: Graphics;
}

interface PlacementBorderVisual {
    source: Texture;
    layoutKey: string;
    cells: Map<string, PlacementCarpetCellVisual>;
    layer: Container;
}

export interface PlacementCarpetTextureFrame {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PlacementCarpetSeamEdge {
    from: Point;
    to: Point;
    variant: number;
}

const CRAFTED_SEAM_PATTERNS = [
    [
        [0.04, 0.27],
        [0.38, 0.66],
        [0.79, 0.95],
    ],
    [
        [0.07, 0.35],
        [0.48, 0.69],
        [0.8, 0.93],
    ],
    [
        [0.05, 0.22],
        [0.32, 0.61],
        [0.72, 0.91],
    ],
] as const;

const CRAFTED_STITCH_POSITIONS = [
    [0.24, 0.78],
    [0.34, 0.84],
    [0.18, 0.64],
] as const;

/** Build seams from the real shared projected edges, never from an approximate bitmap grid. */
export function placementCarpetSeamEdges(cells: readonly HoCMath.XY[], gs: GridSettings): PlacementCarpetSeamEdge[] {
    const occupied = new Set(cells.map(placementCellKey));
    const edges: PlacementCarpetSeamEdge[] = [];

    for (const cell of cells) {
        const polygon = tunedCellFillCornerPoints(cell, gs);
        if (occupied.has(placementCellKey({ x: cell.x + 1, y: cell.y }))) {
            edges.push({
                from: { x: polygon[2], y: polygon[3] },
                to: { x: polygon[4], y: polygon[5] },
                variant: Math.abs(cell.x * 31 + cell.y * 17 + 1) % CRAFTED_SEAM_PATTERNS.length,
            });
        }
        if (occupied.has(placementCellKey({ x: cell.x, y: cell.y + 1 }))) {
            edges.push({
                from: { x: polygon[6], y: polygon[7] },
                to: { x: polygon[4], y: polygon[5] },
                variant: Math.abs(cell.x * 19 + cell.y * 29 + 2) % CRAFTED_SEAM_PATTERNS.length,
            });
        }
    }

    return edges;
}

function drawCraftedCarpetSeam(gfx: Graphics, edge: PlacementCarpetSeamEdge): void {
    const dx = edge.to.x - edge.from.x;
    const dy = edge.to.y - edge.from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return;
    const normal = { x: -dy / length, y: dx / length };
    const pattern = CRAFTED_SEAM_PATTERNS[edge.variant];

    for (const [start, end] of pattern) {
        const from = lerpPoint(edge.from, edge.to, start);
        const to = lerpPoint(edge.from, edge.to, end);
        gfx.moveTo(from.x, from.y)
            .lineTo(to.x, to.y)
            .stroke({ color: 0x061109, alpha: 0.96, width: 4.4, cap: "round" });
        gfx.moveTo(from.x + normal.x * 1.5, from.y + normal.y * 1.5)
            .lineTo(to.x + normal.x * 1.5, to.y + normal.y * 1.5)
            .stroke({ color: 0x3a5734, alpha: 0.62, width: 1.25, cap: "round" });

        for (const [index, position] of CRAFTED_STITCH_POSITIONS[edge.variant].entries()) {
            const amount = start + (end - start) * position;
            const center = lerpPoint(edge.from, edge.to, amount);
            const half = index === 1 ? 4.1 : 3.35;
            gfx.moveTo(center.x - normal.x * half, center.y - normal.y * half)
                .lineTo(center.x + normal.x * half, center.y + normal.y * half)
                .stroke({ color: 0x725323, alpha: 0.7, width: 1.55, cap: "round" });
        }
    }
}

function drawPlacementCarpetSeams(gfx: Graphics, cells: readonly HoCMath.XY[], gs: GridSettings): void {
    gfx.clear();
    const edges = placementCarpetSeamEdges(cells, gs);
    for (const edge of edges) drawCraftedCarpetSeam(gfx, edge);

    for (let index = 0; index < edges.length; index += 1) {
        if ((index * 7 + edges[index].variant) % 13 !== 0) continue;
        const knot = edges[index].to;
        gfx.circle(knot.x, knot.y, 2.4)
            .fill({ color: 0x2b1f0d, alpha: 0.96 })
            .stroke({ color: 0xa17b36, alpha: 0.82, width: 1.25 });
    }
}

/**
 * Slice one shared carpet image into exact cell-sized UV regions. Y is inverted because texture rows begin
 * at the visual top while battlefield cell indices begin at the logical bottom.
 */
export function placementCarpetTextureFrame(
    cell: HoCMath.XY,
    cells: readonly HoCMath.XY[],
    textureWidth: number,
    textureHeight: number,
): PlacementCarpetTextureFrame {
    const minX = Math.min(...cells.map(({ x }) => x));
    const maxX = Math.max(...cells.map(({ x }) => x));
    const minY = Math.min(...cells.map(({ y }) => y));
    const maxY = Math.max(...cells.map(({ y }) => y));
    const columns = maxX - minX + 1;
    const rows = maxY - minY + 1;
    const column = cell.x - minX;
    const row = maxY - cell.y;
    const x0 = (textureWidth * column) / columns;
    const x1 = (textureWidth * (column + 1)) / columns;
    const y0 = (textureHeight * row) / rows;
    const y1 = (textureHeight * (row + 1)) / rows;

    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Cover the native board grout with one continuous carpet, then extend only the two outer ends so the
 * complete runner is exactly 0.2% taller than the original full-cell zone.
 */
export function placementCarpetCellPolygon(
    cell: HoCMath.XY,
    gs: GridSettings,
    cells: readonly HoCMath.XY[] = [cell],
    topExtensionRatio = 0,
): number[] {
    const polygon = tunedCellFillCornerPoints(cell, gs);
    const fullPolygons = cells.map((zoneCell) => projectedCellPoints(zoneCell, gs));
    const fullMinY = Math.min(...fullPolygons.flatMap((points) => [points[1], points[3], points[5], points[7]]));
    const fullMaxY = Math.max(...fullPolygons.flatMap((points) => [points[1], points[3], points[5], points[7]]));
    const fullHeight = fullMaxY - fullMinY;
    const endExtension = (fullHeight * (PLACEMENT_CARPET_HEIGHT_SCALE - 1)) / 2;
    const topExtension = fullHeight * topExtensionRatio;
    const minCellY = Math.min(...cells.map(({ y }) => y));
    const maxCellY = Math.max(...cells.map(({ y }) => y));

    if (cell.y === minCellY) {
        polygon[1] -= endExtension + topExtension;
        polygon[3] -= endExtension + topExtension;
    }
    if (cell.y === maxCellY) {
        polygon[5] += endExtension;
        polygon[7] += endExtension;
    }
    return polygon;
}

/** Keep the sides/bottom on the test-server zone and raise only the outer top edge. */
export function placementGoldBorderCellPolygon(
    cell: HoCMath.XY,
    gs: GridSettings,
    cells: readonly HoCMath.XY[],
): number[] {
    const polygon = projectedCellPoints(cell, gs);
    const minCellY = Math.min(...cells.map(({ y }) => y));
    const maxCellY = Math.max(...cells.map(({ y }) => y));
    if (cell.y !== minCellY && cell.y !== maxCellY) return polygon;

    const fullPolygons = cells.map((zoneCell) => projectedCellPoints(zoneCell, gs));
    const fullMinY = Math.min(...fullPolygons.flatMap((points) => [points[1], points[3], points[5], points[7]]));
    const fullMaxY = Math.max(...fullPolygons.flatMap((points) => [points[1], points[3], points[5], points[7]]));
    const topRise = (fullMaxY - fullMinY) * PLACEMENT_GOLD_BORDER_TOP_EXTENSION;
    const bottomDrop = (fullMaxY - fullMinY) * PLACEMENT_GOLD_BORDER_BOTTOM_DROP;
    if (cell.y === maxCellY) {
        polygon[5] += topRise;
        polygon[7] += topRise;
    }
    if (cell.y === minCellY) {
        polygon[1] -= bottomDrop;
        polygon[3] -= bottomDrop;
    }
    return polygon;
}

/** Map the complete raster frame to one zone quad so its ornament never bends at internal tile seams. */
export function placementGoldBorderZonePolygon(cells: readonly HoCMath.XY[], gs: GridSettings): number[] {
    const polygon = placementZonePolygon(cells, gs);
    if (!polygon.length) return polygon;

    const fullPolygons = cells.map((cell) => projectedCellPoints(cell, gs));
    const fullMinY = Math.min(...fullPolygons.flatMap((points) => [points[1], points[3], points[5], points[7]]));
    const fullMaxY = Math.max(...fullPolygons.flatMap((points) => [points[1], points[3], points[5], points[7]]));
    const topRise = (fullMaxY - fullMinY) * PLACEMENT_GOLD_BORDER_TOP_EXTENSION;
    const bottomDrop = (fullMaxY - fullMinY) * PLACEMENT_GOLD_BORDER_BOTTOM_DROP;
    const minX = Math.min(polygon[0], polygon[2], polygon[4], polygon[6]);
    const maxX = Math.max(polygon[0], polygon[2], polygon[4], polygon[6]);
    const width = maxX - minX;
    const leftExtension = width * PLACEMENT_GOLD_BORDER_LEFT_EXTENSION;
    const rightExtension = width * PLACEMENT_GOLD_BORDER_RIGHT_EXTENSION;
    polygon[0] -= leftExtension;
    polygon[6] -= leftExtension;
    polygon[2] += rightExtension;
    polygon[4] += rightExtension;
    polygon[1] -= bottomDrop;
    polygon[3] -= bottomDrop;
    polygon[5] += topRise;
    polygon[7] += topRise;
    return polygon;
}

function drawPlacementCarpet(
    frameContainer: Container,
    gs: GridSettings,
    cells: readonly HoCMath.XY[],
    existing?: PlacementCarpetVisual,
): PlacementCarpetVisual | undefined {
    if (!cells.length) return existing;

    const minX = Math.min(...cells.map(({ x }) => x));
    const maxX = Math.max(...cells.map(({ x }) => x));
    const minY = Math.min(...cells.map(({ y }) => y));
    const maxY = Math.max(...cells.map(({ y }) => y));
    const columns = maxX - minX + 1;
    const sourceKey = placementGreenCarpetTextureKey(columns);
    const source = Texture.from(images[sourceKey]);
    const layoutKey = `green-carpet:${minX}:${maxX}:${minY}:${maxY}:${source.width}:${source.height}`;
    const canReuse = existing?.source === source && existing.layoutKey === layoutKey && existing.layer;
    if (!canReuse && existing) {
        existing.layer?.removeFromParent();
        for (const { mesh, texture } of existing.cells.values()) {
            mesh.removeFromParent();
            mesh.destroy();
            texture.destroy(false);
        }
        existing.seams.removeFromParent();
        existing.seams.destroy();
        existing.layer.destroy();
    }

    const visual: PlacementCarpetVisual = canReuse
        ? existing
        : (() => {
              const layer = new Container({ label: "placement-carpet-green" });
              const seams = new Graphics({ label: "placement-carpet-crafted-seams" });
              seams.eventMode = "none";
              return {
                  source,
                  layoutKey,
                  cells: new Map<string, PlacementCarpetCellVisual>(),
                  layer,
                  seams,
              };
          })();
    // Match the red field's restrained 6.5–8% breathing transparency. The separate gold perimeter below
    // stays fully opaque, so only the green field's inner carpet becomes translucent.
    visual.layer.alpha = placementCarpetOpacityForPhase(enemyMovementPhase);
    visual.layer.eventMode = "none";
    if (visual.layer.parent !== frameContainer) frameContainer.addChild(visual.layer);

    for (const cell of cells) {
        const key = placementCellKey(cell);
        let cellVisual = visual.cells.get(key);
        if (!cellVisual) {
            const cellSource = source;
            const frame = placementCarpetTextureFrame(cell, cells, cellSource.width, cellSource.height);
            const cellTexture = new Texture({
                source: cellSource.source,
                frame: new Rectangle(
                    cellSource.frame.x + frame.x,
                    cellSource.frame.y + frame.y,
                    frame.width,
                    frame.height,
                ),
            });
            cellVisual = {
                texture: cellTexture,
                mesh: new PerspectiveMesh({
                    texture: cellTexture,
                    verticesX: 2,
                    verticesY: 2,
                    roundPixels: false,
                }),
            };
            cellVisual.mesh.eventMode = "none";
            visual.cells.set(key, cellVisual);
        }

        cellVisual.mesh.alpha = 1;
        const polygon = placementCarpetCellPolygon(cell, gs, cells, GREEN_PLACEMENT_CARPET_TOP_EXTENSION);
        cellVisual.mesh.setCorners(
            polygon[6],
            polygon[7],
            polygon[4],
            polygon[5],
            polygon[2],
            polygon[3],
            polygon[0],
            polygon[1],
        );
        if (cellVisual.mesh.parent !== visual.layer) visual.layer.addChild(cellVisual.mesh);
        cellVisual.mesh.visible = true;
    }

    // The bitmap is deliberately seamless. Craft marks are rebuilt from the actual hand-traced
    // battlefield projection, so every visible seam stays on a real shared cell edge at every upgrade size.
    drawPlacementCarpetSeams(visual.seams, cells, gs);
    visual.layer.addChild(visual.seams);

    return visual;
}

// Keep the authored carpet renderer available for the calibration helpers even while the production field
// uses the continuous wash plus gold perimeter selected below.
void drawPlacementCarpet;

function drawPlacementGoldBorder(
    frameContainer: Container,
    gs: GridSettings,
    cells: readonly HoCMath.XY[],
    continuous: boolean,
    existing?: PlacementBorderVisual,
): PlacementBorderVisual | undefined {
    if (!cells.length) return existing;

    const minX = Math.min(...cells.map(({ x }) => x));
    const maxX = Math.max(...cells.map(({ x }) => x));
    const minY = Math.min(...cells.map(({ y }) => y));
    const maxY = Math.max(...cells.map(({ y }) => y));
    const columns = maxX - minX + 1;
    const rows = maxY - minY + 1;
    const source = Texture.from(images[placementGoldBorderTextureKey(columns, rows, continuous)]);
    const layoutKey = `gold-border-zone-v25:${continuous ? "red-segmented" : "green"}:${minX}:${maxX}:${minY}:${maxY}:${source.width}:${source.height}`;
    const canReuse = existing?.source === source && existing.layoutKey === layoutKey && existing.layer;
    if (!canReuse && existing) {
        existing.layer.removeFromParent();
        for (const { mesh, texture } of existing.cells.values()) {
            mesh.removeFromParent();
            mesh.destroy();
            texture.destroy(false);
        }
        existing.layer.destroy();
    }

    const visual: PlacementBorderVisual = canReuse
        ? existing
        : {
              source,
              layoutKey,
              cells: new Map<string, PlacementCarpetCellVisual>(),
              layer: new Container({ label: "placement-gold-outer-border-image" }),
          };
    visual.layer.alpha = 1;
    visual.layer.eventMode = "none";
    visual.layer.visible = true;
    if (visual.layer.parent !== frameContainer) frameContainer.addChild(visual.layer);

    const polygon = placementGoldBorderZonePolygon(cells, gs);
    const topLeft = { x: polygon[6], y: polygon[7] };
    const topRight = { x: polygon[4], y: polygon[5] };
    const bottomRight = { x: polygon[2], y: polygon[3] };
    const bottomLeft = { x: polygon[0], y: polygon[1] };
    const pointAt = (u: number, v: number): Point => {
        const top = lerpPoint(topLeft, topRight, u);
        const bottom = lerpPoint(bottomLeft, bottomRight, u);
        return lerpPoint(top, bottom, v);
    };
    const upsertSegment = (
        key: string,
        frame: Rectangle,
        opacity: number,
        u0: number,
        v0: number,
        u1: number,
        v1: number,
    ): void => {
        let segment = visual.cells.get(key);
        if (!segment) {
            const texture = new Texture({ source: source.source, frame });
            segment = {
                texture,
                mesh: new PerspectiveMesh({ texture, verticesX: 2, verticesY: 2, roundPixels: false }),
            };
            segment.mesh.eventMode = "none";
            visual.cells.set(key, segment);
        }
        const segmentTopLeft = pointAt(u0, v0);
        const segmentTopRight = pointAt(u1, v0);
        const segmentBottomRight = pointAt(u1, v1);
        const segmentBottomLeft = pointAt(u0, v1);
        segment.mesh.alpha = opacity;
        segment.mesh.setCorners(
            segmentTopLeft.x,
            segmentTopLeft.y,
            segmentTopRight.x,
            segmentTopRight.y,
            segmentBottomRight.x,
            segmentBottomRight.y,
            segmentBottomLeft.x,
            segmentBottomLeft.y,
        );
        if (segment.mesh.parent !== visual.layer) visual.layer.addChild(segment.mesh);
        segment.mesh.visible = true;
    };

    if (continuous) {
        const depthX = Math.min(PLACEMENT_GOLD_BORDER_EDGE_TEXTURE_DEPTH, source.frame.width * 0.25);
        const depthY = Math.min(PLACEMENT_GOLD_BORDER_EDGE_TEXTURE_DEPTH, source.frame.height * 0.25);
        const u = depthX / source.frame.width;
        const v = depthY / source.frame.height;
        upsertSegment(
            "top",
            new Rectangle(source.frame.x, source.frame.y, source.frame.width, depthY),
            RED_PLACEMENT_GOLD_BORDER_TOP_OPACITY,
            0,
            0,
            1,
            v,
        );
        upsertSegment(
            "right",
            new Rectangle(
                source.frame.x + source.frame.width - depthX,
                source.frame.y + depthY,
                depthX,
                source.frame.height - depthY * 2,
            ),
            RED_PLACEMENT_GOLD_BORDER_RIGHT_OPACITY,
            1 - u,
            v,
            1,
            1 - v,
        );
        upsertSegment(
            "bottom",
            new Rectangle(source.frame.x, source.frame.y + source.frame.height - depthY, source.frame.width, depthY),
            RED_PLACEMENT_GOLD_BORDER_BOTTOM_OPACITY,
            0,
            1 - v,
            1,
            1,
        );
        upsertSegment(
            "left",
            new Rectangle(source.frame.x, source.frame.y + depthY, depthX, source.frame.height - depthY * 2),
            RED_PLACEMENT_GOLD_BORDER_LEFT_OPACITY,
            0,
            v,
            u,
            1 - v,
        );
    } else {
        upsertSegment(
            "complete-zone-frame",
            new Rectangle(source.frame.x, source.frame.y, source.frame.width, source.frame.height),
            GREEN_PLACEMENT_GOLD_BORDER_OPACITY,
            0,
            0,
            1,
            1,
        );
    }
    return visual;
}

const placementTeam = (position: PlacementPositionType): TeamType =>
    position === PlacementPositionType.LOWER_RIGHT || position === PlacementPositionType.LOWER_LEFT
        ? TeamVals.LOWER
        : TeamVals.UPPER;

export const placementUsesEnemyMovementWash = (position: PlacementPositionType): boolean =>
    !isGreenTeam(placementTeam(position));

/**
 * The wash colour for a placement zone: the side's own green or red, unless the player at this keyboard has
 * chosen a personal army colour and this is THEIR zone. Only the colour is swapped — each side keeps its own
 * wash geometry and its opacity, so the board reads exactly as it did before.
 *
 * The two authored washes are at opposite ends of the tonal range, and each side's opacity is tuned for its
 * own: the red one is bright and drawn plainly, the green one is nearly black and has its opacity scaled up
 * to compensate. A preset therefore contributes its bright `color` where red sits and its deep banner stop
 * where green does — dropping one flat tint into both slots would blow out the green side.
 */
export const placementWashColor = (
    position: PlacementPositionType,
    tone: "bright" | "deep",
    teamWashColor: number,
): number => {
    const preset = personalArmyPresetFor(placementTeam(position));
    if (!preset) {
        return teamWashColor;
    }

    return tone === "bright" ? preset.color : preset.gradient[1];
};

export class DrawableSquarePlacement extends SquarePlacement implements IDrawablePlacement {
    private readonly visualGridSettings: GridSettings;
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.visualGridSettings = gs;
    }
    public draw(gfx: Graphics, _frameContainer: Container): void {
        const cells = this.possibleCellPositions();
        if (placementUsesEnemyMovementWash(this.placementPositionType)) {
            drawMovementArea(gfx, cells, this.visualGridSettings, ENEMY_MOVEMENT_HIGHLIGHT_COLOR, enemyMovementPhase);
        } else {
            drawSpawnTiles(gfx, this.visualGridSettings, cells, SPAWN_COLOR_GREEN);
        }
    }
}

export class DrawableRectanglePlacement extends SideRectanglePlacement implements IDrawablePlacement {
    private readonly visualGridSettings: GridSettings;
    private carpetVisual?: PlacementCarpetVisual;
    private goldBorderVisual?: PlacementBorderVisual;
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3, _sideOriented = true) {
        super(gs, pos, size);
        this.visualGridSettings = gs;
    }
    public draw(gfx: Graphics, frameContainer: Container): void {
        const cells = this.possibleCellPositions();
        if (placementUsesEnemyMovementWash(this.placementPositionType)) {
            drawPlacementWash(
                gfx,
                cells,
                this.visualGridSettings,
                placementWashColor(this.placementPositionType, "bright", ENEMY_MOVEMENT_HIGHLIGHT_COLOR),
                enemyMovementPhase,
                1,
                RED_PLACEMENT_WASH_TOP_OPACITY_MULTIPLIER,
                RED_PLACEMENT_WASH_TOP_MIN_ALPHA,
            );
            this.goldBorderVisual = drawPlacementGoldBorder(
                frameContainer,
                this.visualGridSettings,
                cells,
                true,
                this.goldBorderVisual,
            );
        } else {
            // Use the green flag's forest tone. Its opacity is perceptually compensated because that cloth
            // colour is much darker than the red highlight, while the native stone remains visible beneath it.
            drawPlacementWash(
                gfx,
                cells,
                this.visualGridSettings,
                placementWashColor(this.placementPositionType, "deep", GREEN_PLACEMENT_HIGHLIGHT_COLOR),
                enemyMovementPhase,
                GREEN_PLACEMENT_OPACITY_SCALE,
            );
            if (this.carpetVisual) this.carpetVisual.layer.visible = false;
            this.goldBorderVisual = drawPlacementGoldBorder(
                frameContainer,
                this.visualGridSettings,
                cells,
                false,
                this.goldBorderVisual,
            );
        }
    }
}
