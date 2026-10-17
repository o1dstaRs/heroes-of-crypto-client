import type { SpellAtmosphereEmitter } from "./SpellAtmosphere";
import { BlurFilter, Container, Graphics, GraphicsContext } from "pixi.js";
import { LIGHTNING_LIFE_MS, lightningFrameAt, lightningPath } from "./ThunderbirdLightningTiming";

type Point = Readonly<{ x: number; y: number }>;
type LightningPalette = {
    bolt: readonly number[];
    impact: readonly number[];
};
const THUNDERBIRD_PALETTE: LightningPalette = {
    bolt: [0x5a10ca, 0x8c2cff, 0xb45cff, 0xe1baff, 0xfcf4ff],
    impact: [0x8c2cff, 0xbf70ff, 0xead3ff, 0xfcf4ff],
};
// Original procedural colours preserved in thunderbird-chain-20261013-v1/before-hit-gifs-20261014/runtime.js.
const NATURAL_PALETTE: LightningPalette = {
    bolt: [0x0075ff, 0x009dff, 0x23bcff, 0x8fe6ff, 0xf1fcff],
    impact: [0x009dff, 0x48ceff, 0xb7edff, 0xffffff],
};
type Cast = {
    container: Container;
    graphics: Graphics;
    context: GraphicsContext;
    glow: BlurFilter;
    path: ReturnType<typeof lightningPath>;
    startedAt: number;
    cellSize: number;
    frameKey: string;
    palette: LightningPalette;
};

function randomSequence(seed: number): () => number {
    let n = seed >>> 0;
    return () => {
        n = (1664525 * n + 1013904223) >>> 0;
        return n / 4294967296;
    };
}

function bolt(
    g: Graphics,
    from: Point,
    to: Point,
    cell: number,
    seed: number,
    alpha: number,
    width: number,
    palette: LightningPalette,
): void {
    const random = randomSequence(seed);
    const dx = to.x - from.x,
        dy = to.y - from.y,
        length = Math.hypot(dx, dy);
    if (length < 0.001) return;
    const nx = -dy / length,
        ny = dx / length;
    const points: Point[] = [];
    for (let i = 0; i <= 18; i++) {
        const t = i / 18,
            offset = (random() - 0.5) * cell * 0.52 * Math.sin(Math.PI * t);
        points.push({ x: from.x + dx * t + nx * offset, y: from.y + dy * t + ny * offset });
    }
    const natural = palette === NATURAL_PALETTE;
    const paths = [{ points, width: width * (natural ? 0.8 : 1) }];
    for (let b = 0; b < 11; b++) {
        const start = points[3 + Math.floor(random() * 12)];
        const end = {
            x: start.x + dx * 0.14 + nx * (random() - 0.5) * cell * 0.7,
            y: start.y + dy * 0.14 + ny * (random() - 0.5) * cell * 0.7,
        };
        const branch = [start];
        for (let j = 1; j <= 5; j++) {
            const t = j / 5;
            branch.push({
                x: start.x + (end.x - start.x) * t + (random() - 0.5) * cell * 0.1,
                y: start.y + (end.y - start.y) * t + (random() - 0.5) * cell * 0.1,
            });
        }
        paths.push({ points: branch, width: width * (natural ? 0.16 + random() * 0.18 : 0.45) });
    }
    for (const path of paths) {
        for (const [thickness, color, opacity] of [
            [20, palette.bolt[0], 0.09],
            [12, palette.bolt[1], 0.16],
            [6, palette.bolt[2], 0.4],
            [3.3, palette.bolt[3], 0.95],
            [1.8, palette.bolt[4], 1],
        ]) {
            g.moveTo(path.points[0].x, path.points[0].y);
            for (const point of path.points.slice(1)) g.lineTo(point.x, point.y);
            g.stroke({ width: thickness * path.width, color, alpha: alpha * opacity, cap: "round", join: "round" });
        }
    }
}

/** Shared lightning geometry and timing; Thunderbird defaults to its violet feather/eye palette. */
export class ThunderbirdLightningProcedural {
    private casts: Cast[] = [];
    public constructor(
        private readonly attach: (container: Container, z: number) => void,
        private readonly now: () => number = () => performance.now(),
        private readonly emitAtmosphere?: SpellAtmosphereEmitter,
    ) {}
    public get active(): boolean {
        return this.casts.length > 0;
    }
    public spawn(
        targets: readonly Point[],
        cellSize: number,
        palette: "thunderbird" | "natural" = "thunderbird",
    ): void {
        if (!targets.length || !Number.isFinite(cellSize) || cellSize <= 0) return;
        const context = new GraphicsContext();
        const graphics = new Graphics(context);
        const halo = new Graphics(context);
        const glow = new BlurFilter({ strength: (5 * cellSize) / 110, quality: 3 });
        halo.filters = [glow];
        halo.alpha = 0.85;
        const container = new Container();
        container.addChild(halo, graphics);
        this.attach(container, 5510);
        this.casts.push({
            container,
            graphics,
            context,
            glow,
            path: lightningPath(targets, cellSize),
            startedAt: this.now(),
            cellSize,
            frameKey: "",
            palette: palette === "natural" ? NATURAL_PALETTE : THUNDERBIRD_PALETTE,
        });
        this.update();
    }
    public update(): void {
        const now = this.now();
        for (let i = this.casts.length - 1; i >= 0; i--) {
            const cast = this.casts[i],
                elapsed = now - cast.startedAt;
            if (elapsed >= cast.path[cast.path.length - 1].delayMs + LIGHTNING_LIFE_MS) {
                this.destroyCast(cast);
                this.casts.splice(i, 1);
                continue;
            }
            const frames = cast.path.map((segment) => lightningFrameAt(elapsed - segment.delayMs));
            if (cast.palette === NATURAL_PALETTE)
                cast.path.forEach((segment) => {
                    const age = elapsed - segment.delayMs;
                    if (age < 0 || age >= LIGHTNING_LIFE_MS) return;
                    const pulse = Math.exp(-age / 65) + 0.38 * Math.exp(-Math.pow((age - 100) / 22, 2));
                    this.emitAtmosphere?.({
                        x: segment.to.x,
                        y: segment.to.y - cast.cellSize * 0.2,
                        width: cast.cellSize * 1.35,
                        height: cast.cellSize * 1.8,
                        light: pulse * 1.15,
                        cool: 1,
                    });
                });
            const key = frames.map((frame) => frame ?? "-").join(",");
            if (key === cast.frameKey) continue;
            cast.frameKey = key;
            cast.container.visible = frames.some((frame) => frame !== undefined);
            const g = cast.graphics;
            g.clear();
            const scale = cast.cellSize / 110;
            cast.path.forEach((segment, index) => {
                const frame = frames[index];
                if (frame === undefined) return;
                const alpha = [0.8, 1, 1, 0.9, 0.7, 0.48, 0.24, 0.09][frame];
                bolt(
                    g,
                    segment.from,
                    segment.to,
                    cast.cellSize,
                    420 + index * 411 + (cast.palette === NATURAL_PALETTE ? Math.floor(frame / 2) : frame) * 977,
                    alpha,
                    (index ? 1.55 : 1.85) * scale,
                    cast.palette,
                );
                const random = randomSequence(73 + index * 17 + frame * 233);
                const radius = cast.cellSize * (index ? 0.27 : 0.38);
                for (let k = 0; k < 8; k++) {
                    const angle = random() * Math.PI * 2;
                    const end = {
                        x: segment.to.x + Math.cos(angle) * radius * (0.5 + random()),
                        y: segment.to.y + Math.sin(angle) * radius * (0.5 + random()),
                    };
                    bolt(g, segment.to, end, 25 * scale, k * 117 + frame * 18, alpha * 0.6, 0.4 * scale, cast.palette);
                }
                for (const [radius, color, opacity] of [
                    [20, cast.palette.impact[0], 0.05],
                    [10, cast.palette.impact[1], 0.2],
                    [4, cast.palette.impact[2], 0.7],
                    [2, cast.palette.impact[3], 1],
                ])
                    g.circle(segment.to.x, segment.to.y, radius * scale * (index ? 0.65 : 1)).fill({
                        color,
                        alpha: opacity * alpha,
                    });
            });
        }
    }
    public clear(): void {
        for (const cast of this.casts) this.destroyCast(cast);
        this.casts = [];
    }
    private destroyCast(cast: Cast): void {
        cast.container.destroy({ children: true, context: false });
        cast.context.destroy();
        cast.glow.destroy();
    }
}
