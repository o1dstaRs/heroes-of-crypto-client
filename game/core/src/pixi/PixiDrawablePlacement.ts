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

// Darker variants of the flag palette keep the team identity without glowing like UI chrome over the floor.
const SPAWN_COLOR_FRIENDLY = 0x176f31;
const SPAWN_COLOR_HOSTILE = 0x8a2d2d;
const spawnColor = (team: TeamType): number => (isFriendlyTeam(team) ? SPAWN_COLOR_FRIENDLY : SPAWN_COLOR_HOSTILE);

/**
 * A tile is a STATIC body with an ANIMATED rim: the pulse used to breathe across the whole square, which
 * made the entire zone throb, and the movement is easier to read when it is confined to the edges and the
 * colour under the units stays put. The rim is 5% of the lit body's width and sits just OUTSIDE it, so the
 * highlight as a whole claims more of the cell than the body on its own.
 */
const SPAWN_RIM_WIDTH_FRACTION = 0.05;
/**
 * How far the rim also reaches INWARD, over the body, as a share of its outward width. The band keeps the
 * outer edge it already had and thickens on the inside only, so widening it does not push the highlight
 * any closer to the neighbouring cell.
 */
const SPAWN_RIM_INWARD_FRACTION = 0.6;
/** Body opacity. The rim's alpha adds on top of this wherever the two overlap. */
const SPAWN_BODY_ALPHA = 0.2;
const SPAWN_RIM_ALPHA_MIN = 0.085;
const SPAWN_RIM_ALPHA_MAX = 0.34;

function hash2(x: number, y: number): number {
    // deterministic hash in [0,1)
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
}

/* -------------------- per-cell spawn highlight -------------------- */
/**
 * Lights the deployment zone CELL BY CELL instead of washing one tinted sheet over the whole rectangle.
 *
 * The old version stacked 100 horizontal strips and jittered each strip's left and right edge along a noise
 * field, which is what produced the ragged tongues hanging off the sides of the zone — they reached well
 * past the squares a unit could actually occupy, so the highlight lied about where you could deploy. Here
 * every square the placement allows gets its own tile, inset so the board's own gutters stay unpainted, and
 * nothing is drawn outside the zone at all.
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

    const gap = Math.max(1, step * 0.08);
    const side = step - gap * 2;
    if (side <= 0) {
        return;
    }

    const radius = Math.min(6, side * 0.14);
    // The animated band, as a share of the lit tile's own width.
    const rimWidth = Math.max(1, side * SPAWN_RIM_WIDTH_FRACTION);

    // Half a step of slack on the loop bound: the placement rectangle is built from whole steps, so this
    // only guards against float drift rather than admitting a partial column.
    for (let y = yLower, row = 0; y < yUpper - step * 0.5; y += step, row++) {
        for (let x = xLeft, col = 0; x < xRight - step * 0.5; x += step, col++) {
            // Two beats layered so the field never looks like one metronome:
            //   wave    — a slow ripple travelling diagonally across the zone (its phase shifts with col+row)
            //   twinkle — a faster flicker on each tile's own random offset
            const wave = Math.sin(gSpawnFlowPhase * SPAWN_WAVE_RATE - (col + row) * 0.55);
            const twinkle = Math.sin(gSpawnFlowPhase * SPAWN_TWINKLE_RATE + hash2(col, row) * Math.PI * 2);
            const pulse = 0.5 + 0.18 * wave + 0.08 * twinkle; // calm ~0.24..0.76

            // The BODY of the tile is dead flat — one constant tone, no movement at all.
            gfx.roundRect(x + gap, y + gap, side, side, radius).fill({
                color: baseColor,
                alpha: SPAWN_BODY_ALPHA,
            });

            // ...and all the life moves into a band straddling the body's edge: it reaches rimWidth OUTWARD
            // into the margin and 60% of that INWARD over the body, so the two together cover more of the
            // cell than the body alone. A stroke is centred on its path, so the path is pushed out by half
            // the difference between the two reaches — that is what pins the outer edge in place while the
            // band thickens inward. The outward reach still clears the gutter: the margin is 8% of a step
            // and the band about 4% of it, so neighbouring cells never meet.
            const rimInner = rimWidth * SPAWN_RIM_INWARD_FRACTION;
            const rimTotal = rimWidth + rimInner;
            const offset = (rimWidth - rimInner) * 0.5;
            gfx.roundRect(
                x + gap - offset,
                y + gap - offset,
                side + offset * 2,
                side + offset * 2,
                radius + offset,
            ).stroke({
                color: baseColor,
                width: rimTotal,
                alpha: SPAWN_RIM_ALPHA_MIN + (SPAWN_RIM_ALPHA_MAX - SPAWN_RIM_ALPHA_MIN) * pulse,
            });
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
