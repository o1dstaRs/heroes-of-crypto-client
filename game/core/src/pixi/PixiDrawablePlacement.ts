import { Container, Graphics, NineSliceSprite, Texture } from "pixi.js";
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
import { isGreenTeam } from "../scenes/teamColors";

export interface IDrawablePlacement extends IPlacement {
    draw(gfx: Graphics, frameContainer: Container): void;
}

let spawnFlowPhase = 0;
export function setSpawnFlowPhase(phase: number): void {
    spawnFlowPhase = phase;
}

// Placement zones are coloured by TEAM, not by viewer: LOWER's zone (bottom) is green, UPPER's zone (top) is
// red, on both screens. An UPPER player's own zone therefore reads red — see scenes/teamColors.ts.
const SPAWN_COLOR_GREEN = 0x27e34f;
const SPAWN_COLOR_RED = 0xff3b30;
const spawnColor = (team: TeamType): number => (isGreenTeam(team) ? SPAWN_COLOR_GREEN : SPAWN_COLOR_RED);

interface FrameSizeTuning {
    fitPlacementBounds: boolean;
    widthScale: number;
    heightScale: number;
    leftInset: number;
    extendLeft: number;
    extendTop: number;
    extendBottom: number;
}

interface FrameBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

const FRAME_TUNING_BY_ROWS: Record<number, FrameSizeTuning> = {
    3: {
        fitPlacementBounds: false,
        widthScale: 0.9 * 1.05 * 1.042,
        heightScale: 0.9,
        leftInset: 0.003,
        extendLeft: 0,
        extendTop: 0,
        extendBottom: 0,
    },
    4: {
        fitPlacementBounds: true,
        widthScale: 1,
        heightScale: 1,
        leftInset: 0,
        extendLeft: 0,
        extendTop: 0,
        extendBottom: 0,
    },
    6: {
        fitPlacementBounds: true,
        widthScale: 1,
        heightScale: 1,
        leftInset: 0,
        extendLeft: 0,
        extendTop: 0,
        extendBottom: 0,
    },
};

function hash2(x: number, y: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
}

/** Draws only the subtle transparent tint inside legal cells; the strict outer frame is rendered separately. */
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

/** Draws broad translucent light between cells without a sharp line at the centre of the glow. */
function drawInnerGridGlow(
    gfx: Graphics,
    step: number,
    xLeft: number,
    yLower: number,
    xRight: number,
    yUpper: number,
    baseColor: number,
): void {
    const columns = Math.round((xRight - xLeft) / step);
    const rows = Math.round((yUpper - yLower) / step);

    const strokeGlow = (x1: number, y1: number, x2: number, y2: number): void => {
        // Neither layer is a crisp core: the overlapping soft-width bands read only as emitted light.
        gfx.moveTo(x1, y1)
            .lineTo(x2, y2)
            .stroke({ color: baseColor, width: Math.max(8, step * 0.16), alpha: 0.018 });
        gfx.moveTo(x1, y1)
            .lineTo(x2, y2)
            .stroke({ color: baseColor, width: Math.max(4, step * 0.085), alpha: 0.034 });
    };

    for (let column = 1; column < columns; column++) {
        const x = xLeft + column * step;
        strokeGlow(x, yLower, x, yUpper);
    }
    for (let row = 1; row < rows; row++) {
        const y = yLower + row * step;
        strokeGlow(xLeft, y, xRight, y);
    }
}

function getReferenceFrameBounds(
    step: number,
    placementSize: number,
    xLeft: number,
    yLower: number,
    xRight: number,
    yUpper: number,
): FrameBounds {
    const tuning = FRAME_TUNING_BY_ROWS[placementSize] ?? FRAME_TUNING_BY_ROWS[3];

    if (tuning.fitPlacementBounds) {
        return { x: xLeft, y: yLower, width: xRight - xLeft, height: yUpper - yLower };
    }

    const pad = step * 0.2;
    const fullWidth = (xRight - xLeft + pad * 2) * tuning.widthScale;
    const baseWidth = fullWidth * (1 - tuning.leftInset);
    const baseHeight = (yUpper - yLower + pad * 2) * tuning.heightScale;
    const extendLeft = baseWidth * tuning.extendLeft;
    const extendTop = baseHeight * tuning.extendTop;
    const extendBottom = baseHeight * tuning.extendBottom;
    const centerX = (xLeft + xRight) / 2;
    const centerY = (yLower + yUpper) / 2;

    return {
        x: centerX - fullWidth / 2 + fullWidth * tuning.leftInset - extendLeft,
        y: centerY - baseHeight / 2 - extendTop,
        width: baseWidth + extendLeft,
        height: baseHeight + extendTop + extendBottom,
    };
}

/** Draws a softly moving, irregular aura around the calibrated outer perimeter. */
function drawOuterFrameGlow(gfx: Graphics, step: number, bounds: FrameBounds, baseColor: number): void {
    const pulse = 0.9 + ((Math.sin(spawnFlowPhase * 1.18) + 1) / 2) * 0.1;
    const edges = [
        { x1: bounds.x, y1: bounds.y, x2: bounds.x + bounds.width, y2: bounds.y, nx: 0, ny: -1 },
        {
            x1: bounds.x + bounds.width,
            y1: bounds.y,
            x2: bounds.x + bounds.width,
            y2: bounds.y + bounds.height,
            nx: 1,
            ny: 0,
        },
        {
            x1: bounds.x + bounds.width,
            y1: bounds.y + bounds.height,
            x2: bounds.x,
            y2: bounds.y + bounds.height,
            nx: 0,
            ny: 1,
        },
        { x1: bounds.x, y1: bounds.y + bounds.height, x2: bounds.x, y2: bounds.y, nx: -1, ny: 0 },
    ];
    const layers = [
        { width: Math.max(18, step * 0.34), alpha: 0.022, amplitude: step * 0.027, phase: 0 },
        { width: Math.max(11, step * 0.22), alpha: 0.034, amplitude: step * 0.02, phase: 1.7 },
        { width: Math.max(6, step * 0.12), alpha: 0.05, amplitude: step * 0.013, phase: 3.1 },
    ];

    const traceEdge = (
        edge: (typeof edges)[number],
        edgeIndex: number,
        strokeWidth: number,
        alpha: number,
        amplitude: number,
        layerPhase: number,
        from = 0,
        to = 1,
    ): void => {
        const dx = edge.x2 - edge.x1;
        const dy = edge.y2 - edge.y1;
        const length = Math.hypot(dx, dy);
        const samples = Math.max(3, Math.ceil(((to - from) * length) / Math.max(8, step * 0.18)));

        for (let sample = 0; sample <= samples; sample++) {
            const t = from + ((to - from) * sample) / samples;
            const distance = t * length;
            const wave =
                Math.sin(distance / (step * 0.72) + spawnFlowPhase * 1.45 + edgeIndex * 1.9 + layerPhase) * amplitude +
                Math.sin(distance / (step * 0.31) - spawnFlowPhase * 0.82 + edgeIndex + layerPhase * 0.7) *
                    amplitude *
                    0.32;
            // A 10% outward centre offset gives the requested 60%/40% outer/inner spread.
            const normalOffset = strokeWidth * 0.1 + wave;
            const x = edge.x1 + dx * t + edge.nx * normalOffset;
            const y = edge.y1 + dy * t + edge.ny * normalOffset;
            if (sample === 0) gfx.moveTo(x, y);
            else gfx.lineTo(x, y);
        }
        gfx.stroke({ color: baseColor, width: strokeWidth, alpha: alpha * pulse });
    };

    edges.forEach((edge, edgeIndex) => {
        layers.forEach((layer) => {
            traceEdge(edge, edgeIndex, layer.width, layer.alpha, layer.amplitude, layer.phase);
        });

        // Three dim highlights drift at different speeds, breaking up the otherwise even halo.
        for (let accent = 0; accent < 3; accent++) {
            const center =
                (((spawnFlowPhase * (0.035 + accent * 0.009) + accent * 0.31 + edgeIndex * 0.17) % 1) + 1) % 1;
            const halfLength = 0.035 + accent * 0.012;
            const from = Math.max(0, center - halfLength);
            const to = Math.min(1, center + halfLength);
            traceEdge(
                edge,
                edgeIndex,
                Math.max(9, step * (0.15 + accent * 0.015)),
                0.022 + accent * 0.005,
                step * 0.018,
                accent * 1.4,
                from,
                to,
            );
        }
    });
}

/** Places the literal spectral perimeter extracted from the selected reference screenshot. */
function attachReferenceFrame(
    frameContainer: Container,
    existing: NineSliceSprite | undefined,
    step: number,
    placementSize: number,
    xLeft: number,
    yLower: number,
    xRight: number,
    yUpper: number,
    friendly: boolean,
): NineSliceSprite {
    const thicknessScale = 1;
    const bounds = getReferenceFrameBounds(step, placementSize, xLeft, yLower, xRight, yUpper);
    const texture = Texture.from(
        friendly ? images.deployment_frame_reference_green : images.deployment_frame_reference_red,
    );
    const frame =
        existing ??
        new NineSliceSprite({
            texture,
            leftWidth: 28 * thicknessScale,
            rightWidth: 28 * thicknessScale,
            topHeight: 28 * thicknessScale,
            bottomHeight: 28 * thicknessScale,
        });

    if (frame.texture !== texture) frame.texture = texture;
    frame.leftWidth = 28 * thicknessScale;
    frame.rightWidth = 28 * thicknessScale;
    frame.topHeight = 28 * thicknessScale;
    frame.bottomHeight = 28 * thicknessScale;

    frame.position.set(bounds.x, bounds.y);
    frame.width = bounds.width;
    frame.height = bounds.height;
    frame.alpha = 0.92 + ((Math.sin(spawnFlowPhase * 1.35) + 1) / 2) * 0.06;
    frame.blendMode = "add";
    frame.eventMode = "none";

    // Keep display-object children on a real Container. Graphics.addChild is deprecated in Pixi v8 and
    // will stop working entirely; SandboxDrawer clears this transient layer before every redraw.
    if (frame.parent !== frameContainer) frameContainer.addChild(frame);
    return frame;
}

export class DrawableSquarePlacement extends SquarePlacement implements IDrawablePlacement {
    private readonly step: number;
    private referenceFrame?: NineSliceSprite;
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.step = gs.getStep();
    }
    public draw(gfx: Graphics, frameContainer: Container): void {
        const isLower =
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT ||
            this.placementPositionType === PlacementPositionType.LOWER_LEFT;
        const team = isLower ? TeamVals.LOWER : TeamVals.UPPER;
        const fillColor = spawnColor(team);

        drawSpawnCellBackgrounds(gfx, this.step, this.xLeft, this.yLower, this.xRight, this.yUpper, fillColor);
        drawInnerGridGlow(gfx, this.step, this.xLeft, this.yLower, this.xRight, this.yUpper, fillColor);
        drawOuterFrameGlow(
            gfx,
            this.step,
            getReferenceFrameBounds(this.step, this.getSize(), this.xLeft, this.yLower, this.xRight, this.yUpper),
            fillColor,
        );
        this.referenceFrame = attachReferenceFrame(
            frameContainer,
            this.referenceFrame,
            this.step,
            this.getSize(),
            this.xLeft,
            this.yLower,
            this.xRight,
            this.yUpper,
            isGreenTeam(team),
        );
    }
}

export class DrawableRectanglePlacement extends RectanglePlacement implements IDrawablePlacement {
    private readonly step: number;
    private referenceFrame?: NineSliceSprite;
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.step = gs.getStep();
    }
    public draw(gfx: Graphics, frameContainer: Container): void {
        const isLower =
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT ||
            this.placementPositionType === PlacementPositionType.LOWER_LEFT;
        const team = isLower ? TeamVals.LOWER : TeamVals.UPPER;
        const fillColor = spawnColor(team);

        drawSpawnCellBackgrounds(gfx, this.step, this.xLeft, this.yLower, this.xRight, this.yUpper, fillColor);
        drawInnerGridGlow(gfx, this.step, this.xLeft, this.yLower, this.xRight, this.yUpper, fillColor);
        drawOuterFrameGlow(
            gfx,
            this.step,
            getReferenceFrameBounds(this.step, this.getSize(), this.xLeft, this.yLower, this.xRight, this.yUpper),
            fillColor,
        );
        this.referenceFrame = attachReferenceFrame(
            frameContainer,
            this.referenceFrame,
            this.step,
            this.getSize(),
            this.xLeft,
            this.yLower,
            this.xRight,
            this.yUpper,
            isGreenTeam(team),
        );
    }
}
