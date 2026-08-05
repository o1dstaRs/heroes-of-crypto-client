import { Graphics } from "pixi.js";
import {
    GridSettings,
    SquarePlacement,
    RectanglePlacement,
    PlacementPositionType,
    IPlacement,
    TeamType,
    TeamVals,
} from "@heroesofcrypto/common";

export interface IDrawablePlacement extends IPlacement {
    draw(gfx: Graphics): void;
}

let gSpawnFlowPhase = 0;
export function setSpawnFlowPhase(phase: number): void {
    gSpawnFlowPhase = phase;
}

/**
 * The caller advances the phase by `timeStep * 1.85`, and the simulation runs on a FIXED 1/240 step
 * (PixiGameManager.SIM_STEP) at roughly one slice per rendered frame — so the phase only gains about
 * 0.46 rad per second. Multiplied by a small factor the tiles took ~12s to complete a cycle, which reads
 * as a still image. These keep the motion visible but deliberately unhurried: a slow travelling ripple
 * with only a small secondary shimmer, rather than the previous rapid flashing rim.
 */
const SPAWN_WAVE_RATE = 3.2;
const SPAWN_TWINKLE_RATE = 5;

import { isFriendlyTeam } from "../scenes/teamColors";

// Placement energy is concentrated in the grid seams rather than painted over the stone faces. These
// brighter source colours are tempered by low-alpha glow layers below, matching the ember/emerald reference.
const SPAWN_COLOR_FRIENDLY = 0x27e34f;
const SPAWN_COLOR_HOSTILE = 0xff3b30;
const spawnColor = (team: TeamType): number => (isFriendlyTeam(team) ? SPAWN_COLOR_FRIENDLY : SPAWN_COLOR_HOSTILE);

function hash2(x: number, y: number): number {
    // deterministic hash in [0,1)
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
}

/* -------------------- grid-seam spawn highlight -------------------- */
/**
 * Leaves the tile faces untouched and channels team energy through the gaps between cells. Each seam is
 * built from a broad dim halo, a coloured middle band and a narrow hot core; intersections receive a small
 * breathing ember. This reproduces the reference without hiding the board art or changing legal geometry.
 */
function drawSpawnCells(
    gfx: Graphics,
    step: number,
    xLeft: number,
    yLower: number,
    xRight: number,
    yUpper: number,
    baseColor: number,
): void {
    if (step <= 0) {
        return;
    }

    const columns = Math.round((xRight - xLeft) / step);
    const rows = Math.round((yUpper - yLower) / step);

    // A restrained team tint sits inside each legal cell as a separate body. It is intentionally inset so
    // the glowing seams remain distinct, and faint enough that the original stone texture stays readable.
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

    const drawSeam = (x1: number, y1: number, x2: number, y2: number, index: number, outer: boolean): void => {
        const wave = Math.sin(gSpawnFlowPhase * SPAWN_WAVE_RATE - index * 0.42);
        const shimmer = Math.sin(gSpawnFlowPhase * SPAWN_TWINKLE_RATE + hash2(index, index + 3) * Math.PI * 2);
        const pulse = 0.82 + wave * 0.1 + shimmer * 0.04;
        const farAuraWidth = Math.max(outer ? 8 : 4, step * (outer ? 0.5 : 0.25));
        const auraWidth = Math.max(outer ? 5 : 3, step * (outer ? 0.3 : 0.17));
        const broadWidth = Math.max(outer ? 3 : 1.75, step * (outer ? 0.15 : 0.09));
        const middleWidth = Math.max(outer ? 1.25 : 0.85, step * (outer ? 0.038 : 0.022));
        const coreWidth = Math.max(outer ? 0.7 : 0.45, step * (outer ? 0.014 : 0.009));
        const farAuraAlpha = outer ? 0.025 : 0.014;
        const auraAlpha = outer ? 0.075 : 0.042;
        const broadAlpha = outer ? 0.075 : 0.02205;
        const middleAlpha = outer ? 0.28 : 0.0882;
        const coreAlpha = outer ? 0.55 : 0.2268;

        const vertical = Math.abs(x2 - x1) < 0.001;
        const length = vertical ? y2 - y1 : x2 - x1;
        const cellsAlongSeam = Math.max(1, Math.round(Math.abs(length) / step));
        const subdivisions = 4;
        const segmentCount = cellsAlongSeam * subdivisions;
        const jitterLimit = step * (outer ? 0.015 : 0.013);
        const points: Array<{ x: number; y: number }> = [];

        // Every fourth point is an exact grid intersection so seams still meet cleanly. The points between
        // them drift by less than a pixel at normal scale, creating the hand-burned, uneven edge in the
        // reference without making the placement geometry itself look bent.
        for (let segment = 0; segment <= segmentCount; segment++) {
            const t = segment / segmentCount;
            const onIntersection = segment % subdivisions === 0;
            const noise = hash2(index * 37 + segment * 1.71, index * 11 + segment * 2.43) * 2 - 1;
            const drift = onIntersection ? 0 : noise * jitterLimit;
            points.push({
                x: vertical ? x1 + drift : x1 + length * t,
                y: vertical ? y1 + length * t : y1 + drift,
            });
        }

        const strokeRoughPath = (width: number, alpha: number): void => {
            gfx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                gfx.lineTo(points[i].x, points[i].y);
            }
            gfx.stroke({ color: baseColor, width, alpha: alpha * pulse });
        };

        strokeRoughPath(farAuraWidth, farAuraAlpha);
        strokeRoughPath(auraWidth, auraAlpha);
        strokeRoughPath(broadWidth, broadAlpha);
        strokeRoughPath(middleWidth, middleAlpha);
        strokeRoughPath(coreWidth, coreAlpha);
    };

    let seamIndex = 0;
    for (let col = 0; col <= columns; col++) {
        const x = xLeft + col * step;
        drawSeam(x, yLower, x, yUpper, seamIndex++, col === 0 || col === columns);
    }
    for (let row = 0; row <= rows; row++) {
        const y = yLower + row * step;
        drawSeam(xLeft, y, xRight, y, seamIndex++, row === 0 || row === rows);
    }

    const sparkRadius = Math.max(1, step * 0.032);
    for (let row = 0; row <= rows; row++) {
        const y = yLower + row * step;
        for (let col = 0; col <= columns; col++) {
            const x = xLeft + col * step;
            const flicker = 0.82 + 0.18 * Math.sin(gSpawnFlowPhase * SPAWN_TWINKLE_RATE + hash2(col, row) * 6.28);
            const isOuter = col === 0 || col === columns || row === 0 || row === rows;
            const ray = sparkRadius * (isOuter ? 2.5 : 1.9);
            const rayAlpha = (isOuter ? 0.72 : 0.46) * flicker;

            gfx.circle(x, y, sparkRadius * (isOuter ? 2.6 : 2.05)).fill({
                color: baseColor,
                alpha: (isOuter ? 0.14 : 0.07) * flicker,
            });
            gfx.moveTo(x - ray, y)
                .lineTo(x + ray, y)
                .stroke({ color: baseColor, width: Math.max(0.55, step * 0.01), alpha: rayAlpha });
            gfx.moveTo(x, y - ray)
                .lineTo(x, y + ray)
                .stroke({ color: baseColor, width: Math.max(0.55, step * 0.01), alpha: rayAlpha });
            gfx.circle(x, y, sparkRadius * 0.72).fill({ color: baseColor, alpha: 0.96 * flicker });
            gfx.circle(x, y, Math.max(0.45, sparkRadius * 0.24)).fill({ color: 0xfff0dc, alpha: flicker });
        }
    }
}

/* -------------------- placements -------------------- */
export class DrawableSquarePlacement extends SquarePlacement implements IDrawablePlacement {
    /** The grid's own cell pitch — the tiles are laid out on it, so no separate geometry is cached. */
    private readonly step: number;
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.step = gs.getStep();
    }
    public draw(gfx: Graphics): void {
        const isLower =
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT ||
            this.placementPositionType === PlacementPositionType.LOWER_LEFT;
        const fillColor = spawnColor(isLower ? TeamVals.LOWER : TeamVals.UPPER);
        drawSpawnCells(gfx, this.step, this.xLeft, this.yLower, this.xRight, this.yUpper, fillColor);
    }
}

export class DrawableRectanglePlacement extends RectanglePlacement implements IDrawablePlacement {
    private readonly step: number;
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.step = gs.getStep();
    }
    public draw(gfx: Graphics): void {
        const isLower =
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT ||
            this.placementPositionType === PlacementPositionType.LOWER_LEFT;
        const fillColor = spawnColor(isLower ? TeamVals.LOWER : TeamVals.UPPER);
        drawSpawnCells(gfx, this.step, this.xLeft, this.yLower, this.xRight, this.yUpper, fillColor);
    }
}
