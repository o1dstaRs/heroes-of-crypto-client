import { Container, Graphics } from "pixi.js";
import {
    GridSettings,
    SquarePlacement,
    RectanglePlacement,
    PlacementPositionType,
    IPlacement,
    TeamType,
    TeamVals,
    type HoCMath,
} from "@heroesofcrypto/common";

import { isGreenTeam } from "../scenes/teamColors";
import { projectedCellPoints } from "../scenes/sandbox/BattlefieldVisualGrid";

export interface IDrawablePlacement extends IPlacement {
    draw(gfx: Graphics, frameContainer: Container): void;
}

let spawnFlowPhase = 0;
export function setSpawnFlowPhase(phase: number): void {
    spawnFlowPhase = phase;
}

// Placement zones are coloured by TEAM, not by viewer: LOWER's rectangle (left) is green, UPPER's rectangle
// (right) is red, on both screens. An UPPER player's own zone therefore reads red — see scenes/teamColors.ts.
const SPAWN_COLOR_GREEN = 0x58b982;
const SPAWN_COLOR_RED = 0xc96578;
const SPAWN_BOUNDARY_COLOR_GREEN = 0x91d7ad;
const SPAWN_BOUNDARY_COLOR_RED = 0xe69aa8;
const spawnColor = (team: TeamType): number => (isGreenTeam(team) ? SPAWN_COLOR_GREEN : SPAWN_COLOR_RED);
const spawnBoundaryColor = (color: number): number =>
    color === SPAWN_COLOR_GREEN ? SPAWN_BOUNDARY_COLOR_GREEN : SPAWN_BOUNDARY_COLOR_RED;

/**
 * Keep the deployment wash off the painted grout. The inset is expressed in logical cell units so it
 * follows the hand-traced battlefield projection and leaves a consistent dark seam at every board depth.
 */
export const PLACEMENT_TILE_INSET_CELLS = 0.028;
const PLACEMENT_BOUNDARY_DEPTH = 0.077;
const PLACEMENT_BOUNDARY_OPACITY = 0.16;
export const PLACEMENT_BOUNDARY_TOP_EXTENSION = 0.01;

/** Match the restrained, slowly breathing cell wash used to communicate the current unit's move area. */
export function placementTileOpacity(phase: number): number {
    const pulse = (Math.sin(phase * 0.65) + 1) * 0.5;
    return 0.09 + pulse * 0.02;
}

/** The exact inset polygon used by placement rendering; exported so seam preservation stays testable. */
export function placementTilePolygon(cell: HoCMath.XY, gs: GridSettings): number[] {
    return projectedCellPoints(cell, gs, PLACEMENT_TILE_INSET_CELLS);
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
    for (const cell of cells) {
        const polygon = placementTilePolygon(cell, gs);
        gfx.poly(polygon).fill({ color, alpha });
        drawBoundarySides(gfx, polygon, placementBoundarySides(cell, occupiedCells), color);
    }
}

export class DrawableSquarePlacement extends SquarePlacement implements IDrawablePlacement {
    private readonly visualGridSettings: GridSettings;
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.visualGridSettings = gs;
    }
    public draw(gfx: Graphics, _frameContainer: Container): void {
        const isLower =
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT ||
            this.placementPositionType === PlacementPositionType.LOWER_LEFT;
        const team = isLower ? TeamVals.LOWER : TeamVals.UPPER;
        drawSpawnTiles(gfx, this.visualGridSettings, this.possibleCellPositions(), spawnColor(team));
    }
}

export class DrawableRectanglePlacement extends RectanglePlacement implements IDrawablePlacement {
    private readonly visualGridSettings: GridSettings;
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.visualGridSettings = gs;
    }
    public draw(gfx: Graphics, _frameContainer: Container): void {
        const isLower =
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT ||
            this.placementPositionType === PlacementPositionType.LOWER_LEFT;
        const team = isLower ? TeamVals.LOWER : TeamVals.UPPER;
        drawSpawnTiles(gfx, this.visualGridSettings, this.possibleCellPositions(), spawnColor(team));
    }
}
