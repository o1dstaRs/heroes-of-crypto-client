import { Graphics } from "pixi.js";
import {
    HoCMath,
    GridSettings,
    SquarePlacement,
    RectanglePlacement,
    PlacementPositionType,
    IPlacement,
} from "@heroesofcrypto/common";

export interface IDrawablePlacement extends IPlacement {
    draw(gfx: Graphics): void;
}

let gSpawnFlowPhase = 0;
export function setSpawnFlowPhase(phase: number): void {
    gSpawnFlowPhase = phase;
}

function rgb255(r: number, g: number, b: number): number {
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function buildInsetRectVerts(xLeft: number, yUpper: number, xRight: number, yLower: number, inset = 1): HoCMath.XY[] {
    return [
        { x: xLeft + inset, y: yUpper - inset },
        { x: xRight - inset, y: yUpper - inset },
        { x: xRight - inset, y: yLower + inset },
        { x: xLeft + inset, y: yLower + inset },
    ];
}

function lighten(color: number, factor: number): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const mix = (c: number) => Math.round(c + (255 - c) * factor);
    return rgb255(mix(r), mix(g), mix(b));
}

/* -------------------- tiny 2D value-noise + fBm -------------------- */
function hash2(x: number, y: number): number {
    // deterministic hash in [0,1)
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
}
function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}
function noise2D(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const a = hash2(xi, yi);
    const b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1);
    const d = hash2(xi + 1, yi + 1);
    const u = smoothstep(xf);
    const v = smoothstep(yf);
    const nx0 = lerp(a, b, u);
    const nx1 = lerp(c, d, u);
    return lerp(nx0, nx1, v); // [0,1]
}
function fbm2(x: number, y: number, octaves = 4): number {
    let f = 0.0;
    let amp = 0.5;
    let freq = 1.0;
    for (let i = 0; i < octaves; i++) {
        f += amp * noise2D(x * freq, y * freq);
        amp *= 0.5;
        freq *= 2.0;
    }
    return f; // ~[0,1]
}

/* -------------------- water-like spawn light -------------------- */
function drawSpawnWaterLight(gfx: Graphics, verts: HoCMath.XY[], baseColor: number, isLower: boolean): void {
    const xs = verts.map((v) => v.x);
    const ys = verts.map((v) => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;

    // unique seed per placement so upper/lower don’t sync perfectly
    const seed = (minX * 0.017 + minY * 0.013) * 0.5;

    const layers = 64; // more layers = smoother
    const layerH_avg = height / layers;

    // Precompute y positions with vertical jitter for up/down wobble, fixed at ends
    const y_positions: number[] = new Array(layers + 1);
    y_positions[0] = minY;
    y_positions[layers] = maxY;

    // flow across time – animate noise sampling coords, not just a band
    const t = gSpawnFlowPhase; // radians
    const flowX = Math.cos(t) * 0.35;
    const flowY = Math.sin(t * 0.7) * 0.25;

    for (let i = 1; i < layers; i++) {
        const hNorm = i / layers;
        const nv = fbm2(seed + hNorm * 1.5 + flowY, seed + flowX * 0.85, 4);
        const v_jitter = (nv - 0.5) * layerH_avg * 2;
        y_positions[i] = minY + hNorm * height + v_jitter;
    }

    // add glow with additive blending while we draw; restore after
    const prevBlend = gfx.blendMode;
    gfx.blendMode = "add";

    const highlight = lighten(baseColor, 0.45);

    for (let i = 0; i < layers; i++) {
        // normalized height (0 at top .. 1 at bottom in world coords)
        const hNorm = (i + 0.5) / layers;

        let y0 = y_positions[i];
        let y1 = y_positions[i + 1];
        if (y0 > y1) {
            const temp = y0;
            y0 = y1;
            y1 = temp;
        }
        const layerH = y1 - y0;
        if (layerH <= 0) continue;

        // falloff stronger near board side, softer away
        const toBoard = isLower ? 1 - hNorm : hNorm;
        const edgeFalloff = 0.35 + 0.65 * (1 - toBoard * toBoard); // 0.35..1

        // sample a small flow field to jitter the strip edges horizontally
        // scale: bigger values => broader, slow waves
        const nx = fbm2(seed + hNorm * 1.5 + flowX, seed + flowY, 4); // [0,1]
        const jitter = (nx - 0.5) * 0.12 * width; // pixels

        // second noise to modulate alpha (shimmering brightness)
        const ny = fbm2(seed + hNorm * 2.1 + flowY * 0.75, seed + flowX * 0.5, 5);
        const sparkle = ny; // [0,1]

        // third noise to occasionally tint with highlight (like caustics)
        const nz = fbm2(seed + hNorm * 1.3 + flowX * 0.4, seed - flowY * 0.6, 3);

        // slight curved feather toward edges using cosine to avoid banding
        const feather = 0.65 + 0.35 * Math.cos((hNorm - 0.5) * Math.PI);

        const alphaBase = 0.35 * edgeFalloff * feather;
        const alphaSpark = 0.35 * sparkle;
        const orig_alpha = alphaBase + alphaSpark;
        const alpha = Math.min(1, orig_alpha * (layerH_avg / layerH));
        if (alpha < 0.01) continue;

        const color = nz > 0.66 ? highlight : baseColor;

        // wobble both left and right edges a little differently
        const wobbleL = jitter * 0.8;
        const wobbleR = jitter * -0.8;

        // draw thin wavy strip
        gfx.moveTo(minX + wobbleL, y0)
            .lineTo(maxX + wobbleR, y0)
            .lineTo(maxX + wobbleR, y1)
            .lineTo(minX + wobbleL, y1)
            .closePath()
            .fill({ color, alpha });
    }

    gfx.blendMode = prevBlend;
}

/* -------------------- placements -------------------- */
export class DrawableSquarePlacement extends SquarePlacement implements IDrawablePlacement {
    private readonly vertices: HoCMath.XY[];
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.vertices = buildInsetRectVerts(this.xLeft, this.yUpper, this.xRight, this.yLower, 1);
    }
    public draw(gfx: Graphics): void {
        const isLower =
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT ||
            this.placementPositionType === PlacementPositionType.LOWER_LEFT;
        const fillColor = isLower
            ? rgb255(110, 210, 95) // greener, brighter
            : rgb255(255, 95, 60); // warm orange-red
        drawSpawnWaterLight(gfx, this.vertices, fillColor, isLower);
    }
}

export class DrawableRectanglePlacement extends RectanglePlacement implements IDrawablePlacement {
    private readonly vertices: HoCMath.XY[];
    public constructor(gs: GridSettings, pos: PlacementPositionType, size = 3) {
        super(gs, pos, size);
        this.vertices = buildInsetRectVerts(this.xLeft, this.yUpper, this.xRight, this.yLower, 1);
    }
    public draw(gfx: Graphics): void {
        const isLower =
            this.placementPositionType === PlacementPositionType.LOWER_RIGHT ||
            this.placementPositionType === PlacementPositionType.LOWER_LEFT;
        const fillColor = isLower ? rgb255(160, 200, 95) : rgb255(255, 95, 60);
        drawSpawnWaterLight(gfx, this.vertices, fillColor, isLower);
    }
}
