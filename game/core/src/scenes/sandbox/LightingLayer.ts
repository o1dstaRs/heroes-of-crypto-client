import { Container, Sprite, Texture, Graphics } from "pixi.js";
import { GridSettings, HoCMath } from "@heroesofcrypto/common";

/**
 * Moody dungeon lighting: a soft darkening over the board with warm orange "torch" glow ringing the
 * perimeter, so the centre reads dark and the surround is lit — like a room lit by wall torches.
 *
 * Built from a darkening overlay + additive radial sprites (no fragile full-screen shader), so it
 * can't break the scene render. Tune the constants below to taste.
 */
// Darkening laid over the board so the lit surround has something to read against.
const DARK_COLOR = 0x080a14;
const DARK_ALPHA = 0.3;
// Warm torch glow.
const TORCH_TINT = 0xff7c2e;
const TORCH_ALPHA = 0.42;
const TORCH_RADIUS_FACTOR = 0.36; // of the board's larger side — small enough that the centre stays dim

/** White radial-falloff texture (soft, non-hot center -> transparent edge); tinted per-light. */
function makeRadialTexture(): Texture {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Texture.WHITE;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, "rgba(255,255,255,0.7)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.4)");
    grad.addColorStop(0.7, "rgba(255,255,255,0.12)");
    grad.addColorStop(1.0, "rgba(255,255,255,0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return Texture.from(canvas);
}

interface Torch {
    sprite: Sprite;
    baseScale: number;
    phase: number; // flicker offset so each torch breathes independently
}

export class LightingLayer {
    private readonly container = new Container();
    private readonly torches: Torch[] = [];
    private time = 0;
    public constructor(gs: GridSettings) {
        const minX = gs.getMinX();
        const maxX = gs.getMaxX();
        const minY = gs.getMinY();
        const maxY = gs.getMaxY();
        const w = maxX - minX;
        const h = maxY - minY;
        const cx = (minX + maxX) * 0.5;
        const cy = (minY + maxY) * 0.5;

        // 1. Darkening so the surround glow reads. Extend it FAR past the board so its hard
        //    rectangular edge is always off-screen (otherwise it shows as a visible "line" when the
        //    board doesn't fill the viewport).
        const dark = new Graphics();
        const m = Math.max(w, h) * 3;
        dark.rect(minX - m, minY - m, w + 2 * m, h + 2 * m).fill({ color: DARK_COLOR, alpha: DARK_ALPHA });
        this.container.addChild(dark);

        // 2. Warm torches around the perimeter (corners + edge midpoints).
        const tex = makeRadialTexture();
        const texW = tex.width || 512;
        const radius = Math.max(w, h) * TORCH_RADIUS_FACTOR;
        const positions: HoCMath.XY[] = [
            { x: minX, y: minY },
            { x: cx, y: minY },
            { x: maxX, y: minY },
            { x: minX, y: cy },
            { x: maxX, y: cy },
            { x: minX, y: maxY },
            { x: cx, y: maxY },
            { x: maxX, y: maxY },
        ];
        positions.forEach((p, i) => {
            const sprite = new Sprite(tex);
            sprite.anchor.set(0.5);
            sprite.blendMode = "add";
            sprite.tint = TORCH_TINT;
            sprite.position.set(p.x, p.y);
            const baseScale = (radius * 2) / texW;
            sprite.scale.set(baseScale);
            sprite.alpha = TORCH_ALPHA;
            this.container.addChild(sprite);
            this.torches.push({ sprite, baseScale, phase: i * 1.7 });
        });
    }
    public getContainer(): Container {
        return this.container;
    }
    /** Flicker the torches. */
    public update(dt: number): void {
        this.time += dt;
        for (const torch of this.torches) {
            const t = this.time + torch.phase;
            // Organic flicker from two out-of-phase sines.
            const flicker = 0.85 + 0.15 * Math.sin(t * 3.2) * Math.sin(t * 1.2 + 0.7);
            torch.sprite.alpha = TORCH_ALPHA * flicker;
            torch.sprite.scale.set(torch.baseScale * (1 + 0.02 * Math.sin(t * 1.6)));
        }
    }
    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
