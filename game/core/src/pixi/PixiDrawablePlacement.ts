import { Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import {
    GridSettings,
    SquarePlacement,
    RectanglePlacement,
    PlacementPositionType,
    IPlacement,
    TeamType,
    TeamVals,
} from "@heroesofcrypto/common";

import { images } from "../generated/image_imports";
import { isFriendlyTeam } from "../scenes/teamColors";

export interface IDrawablePlacement extends IPlacement {
    draw(gfx: Graphics): void;
}

let spawnFlowPhase = 0;
export function setSpawnFlowPhase(phase: number): void {
    spawnFlowPhase = phase;
}

const SPAWN_COLOR_FRIENDLY = 0x27e34f;
const SPAWN_COLOR_HOSTILE = 0xff3b30;
const REFERENCE_CELL_PX = 69;

const spawnColor = (team: TeamType): number => (isFriendlyTeam(team) ? SPAWN_COLOR_FRIENDLY : SPAWN_COLOR_HOSTILE);

function hash2(x: number, y: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
}

/** Draws only the subtle transparent tint inside legal cells. Border light comes exclusively from images. */
function drawSpawnCellBackgrounds(
    gfx: Graphics,
    step: number,
    xLeft: number,
    yLower: number,
    xRight: number,
    yUpper: number,
    baseColor: number,
): void {
    if (step <= 0) return;

    const columns = Math.round((xRight - xLeft) / step);
    const rows = Math.round((yUpper - yLower) / step);
    const cellInset = Math.max(1.5, step * 0.075);
    const cellSide = step - cellInset * 2;
    const cellRadius = Math.max(2, step * 0.055);

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
            const variation = 0.88 + hash2(col + 17, row + 29) * 0.18;
            gfx.roundRect(
                xLeft + col * step + cellInset,
                yLower + row * step + cellInset,
                cellSide,
                cellSide,
                cellRadius,
            ).fill({ color: baseColor, alpha: 0.042 * variation });
        }
    }
}

/** Adds a restrained animated halo centred on the four outer edges without changing internal grid lines. */
function drawOuterContourGlow(
    gfx: Graphics,
    step: number,
    xLeft: number,
    yLower: number,
    xRight: number,
    yUpper: number,
    baseColor: number,
): void {
    const width = xRight - xLeft;
    const height = yUpper - yLower;
    const cornerRadius = Math.max(3, step * 0.12);
    // The four primary perimeter lines sit 15% below their previous opacity, so the deployment boundary
    // still reads clearly without overpowering the cell grid underneath it.
    const coreBaseAlpha = 0.16 * 0.85;

    const waveAt = (distance: number, edgePhase: number, layerPhase: number): number => {
        const cellDistance = distance / step;
        const slowWave = Math.sin((cellDistance * Math.PI * 2) / 3.4 + spawnFlowPhase * 2.8 + edgePhase + layerPhase);
        const detailWave = Math.sin(
            (cellDistance * Math.PI * 2) / 1.55 - spawnFlowPhase * 1.65 + edgePhase * 1.7 - layerPhase,
        );
        return (slowWave + detailWave * 0.34) / 1.34;
    };

    const drawWavyAura = (strokeWidth: number, alpha: number, amplitude: number, layerPhase: number): void => {
        const horizontalLength = width;
        const verticalLength = height;
        const horizontalSegments = Math.max(12, Math.ceil(horizontalLength / Math.max(5, step * 0.12)));
        const verticalSegments = Math.max(8, Math.ceil(verticalLength / Math.max(5, step * 0.12)));

        const strokeHorizontal = (isBottom: boolean, edgePhase: number): void => {
            for (let segment = 0; segment <= horizontalSegments; segment++) {
                const distance = (horizontalLength * segment) / horizontalSegments;
                const x = xLeft + distance;
                const wave = waveAt(distance, edgePhase, layerPhase) * amplitude;
                const y = isBottom ? yUpper - wave : yLower + wave;
                if (segment === 0) gfx.moveTo(x, y);
                else gfx.lineTo(x, y);
            }
            gfx.stroke({ color: baseColor, width: strokeWidth, alpha });
        };

        const strokeVertical = (isRight: boolean, edgePhase: number): void => {
            for (let segment = 0; segment <= verticalSegments; segment++) {
                const distance = (verticalLength * segment) / verticalSegments;
                const y = yLower + distance;
                const wave = waveAt(distance, edgePhase, layerPhase) * amplitude;
                const x = isRight ? xRight - wave : xLeft + wave;
                if (segment === 0) gfx.moveTo(x, y);
                else gfx.lineTo(x, y);
            }
            gfx.stroke({ color: baseColor, width: strokeWidth, alpha });
        };

        strokeHorizontal(false, 0.15);
        strokeHorizontal(true, 2.35);
        strokeVertical(false, 1.2);
        strokeVertical(true, 3.55);
    };

    const drawInsideStroke = (strokeWidth: number, alpha: number): void => {
        const inset = strokeWidth * 0.5;
        gfx.roundRect(
            xLeft + inset,
            yLower + inset,
            width - strokeWidth,
            height - strokeWidth,
            Math.max(1, cornerRadius - inset),
        ).stroke({ color: baseColor, width: strokeWidth, alpha });
    };

    // Only the background aura moves. Its centre path follows the exact outer boundary, distributing the
    // unchanged glow envelope equally inside and outside the straight line. The bright core stays flat.
    drawWavyAura(Math.max(9.36, step * 0.234), 0.0338, step * 0.055, 0);
    drawWavyAura(Math.max(4.68, step * 0.12285), 0.078, step * 0.034, 1.1);
    drawInsideStroke(Math.max(1.15, step * 0.022), coreBaseAlpha * 1.1);
}

/**
 * Every field size is a literal crop of one pre-baked 16×6 master. This keeps line alpha and width identical
 * across placement upgrades while the texture frame provides a hard clip at the legal field boundary.
 */
function attachReferenceGrid(
    gfx: Graphics,
    existingGrid: Sprite | undefined,
    step: number,
    xLeft: number,
    yLower: number,
    xRight: number,
    yUpper: number,
    baseColor: number,
    cropColumn: number,
    cropRow: number,
): Sprite {
    const columns = Math.round((xRight - xLeft) / step);
    const rows = Math.round((yUpper - yLower) / step);
    const grid =
        existingGrid ??
        new Sprite(
            new Texture({
                source: Texture.from(images.deployment_grid_glow_master_16x6).source,
                frame: new Rectangle(
                    cropColumn * REFERENCE_CELL_PX,
                    cropRow * REFERENCE_CELL_PX,
                    columns * REFERENCE_CELL_PX,
                    rows * REFERENCE_CELL_PX,
                ),
            }),
        );

    grid.position.set(xLeft, yLower);
    grid.scale.set(step / REFERENCE_CELL_PX);
    grid.tint = baseColor;
    grid.alpha = 0.96;
    grid.blendMode = "add";

    if (grid.parent !== gfx) gfx.addChild(grid);
    return grid;
}

export class DrawableSquarePlacement extends SquarePlacement implements IDrawablePlacement {
    private readonly step: number;
    private readonly cropColumn: number;
    private readonly cropRow: number;
    private referenceGrid?: Sprite;
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.step = gs.getStep();
        const isLower = pos === PlacementPositionType.LOWER_RIGHT || pos === PlacementPositionType.LOWER_LEFT;
        const masterYLower = isLower ? gs.getMinY() : gs.getMaxY() - 6 * this.step;
        this.cropColumn = Math.round((this.xLeft - gs.getMinX()) / this.step);
        this.cropRow = Math.round((this.yLower - masterYLower) / this.step);
    }
    public draw(gfx: Graphics): void {
        const isLower =
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT ||
            this.placementPositionType === PlacementPositionType.LOWER_LEFT;
        const fillColor = spawnColor(isLower ? TeamVals.LOWER : TeamVals.UPPER);

        drawSpawnCellBackgrounds(gfx, this.step, this.xLeft, this.yLower, this.xRight, this.yUpper, fillColor);
        drawOuterContourGlow(gfx, this.step, this.xLeft, this.yLower, this.xRight, this.yUpper, fillColor);
        this.referenceGrid = attachReferenceGrid(
            gfx,
            this.referenceGrid,
            this.step,
            this.xLeft,
            this.yLower,
            this.xRight,
            this.yUpper,
            fillColor,
            this.cropColumn,
            this.cropRow,
        );
    }
}

export class DrawableRectanglePlacement extends RectanglePlacement implements IDrawablePlacement {
    private readonly step: number;
    private readonly cropColumn: number;
    private readonly cropRow: number;
    private referenceGrid?: Sprite;
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.step = gs.getStep();
        const isLower = pos === PlacementPositionType.LOWER_RIGHT || pos === PlacementPositionType.LOWER_LEFT;
        const masterYLower = isLower ? gs.getMinY() : gs.getMaxY() - 6 * this.step;
        this.cropColumn = Math.round((this.xLeft - gs.getMinX()) / this.step);
        this.cropRow = Math.round((this.yLower - masterYLower) / this.step);
    }
    public draw(gfx: Graphics): void {
        const isLower =
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT ||
            this.placementPositionType === PlacementPositionType.LOWER_LEFT;
        const fillColor = spawnColor(isLower ? TeamVals.LOWER : TeamVals.UPPER);

        drawSpawnCellBackgrounds(gfx, this.step, this.xLeft, this.yLower, this.xRight, this.yUpper, fillColor);
        drawOuterContourGlow(gfx, this.step, this.xLeft, this.yLower, this.xRight, this.yUpper, fillColor);
        this.referenceGrid = attachReferenceGrid(
            gfx,
            this.referenceGrid,
            this.step,
            this.xLeft,
            this.yLower,
            this.xRight,
            this.yUpper,
            fillColor,
            this.cropColumn,
            this.cropRow,
        );
    }
}
