import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { GridSettings } from "@heroesofcrypto/common";

function makeMoonPoolTexture(): Texture {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Texture.WHITE;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,0.72)");
    gradient.addColorStop(0.36, "rgba(255,255,255,0.38)");
    gradient.addColorStop(0.72, "rgba(255,255,255,0.12)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return Texture.from(canvas);
}

interface MoonPool {
    sprite: Sprite;
    phase: number;
    speed: number;
    lane: number;
    baseAlpha: number;
}

/** Shader-free moonlight: broad blue pools drift over the entire board like thin clouds crossing a moon. */
export class MoonlightLayer {
    private readonly container = new Container();
    private readonly pools: MoonPool[] = [];
    private time = 0;
    private readonly centerX: number;
    private readonly centerY: number;
    private readonly boardWidth: number;
    private readonly boardHeight: number;
    private readonly minX: number;
    public constructor(gs: GridSettings) {
        this.centerX = (gs.getMinX() + gs.getMaxX()) * 0.5;
        this.centerY = (gs.getMinY() + gs.getMaxY()) * 0.5;
        this.boardWidth = gs.getMaxX() - gs.getMinX();
        this.boardHeight = gs.getMaxY() - gs.getMinY();
        this.minX = gs.getMinX();

        // Pull the whole board firmly into night first. The animated pools below then have enough contrast
        // to read immediately instead of looking like a slight exposure change.
        const night = new Graphics();
        night.rect(gs.getMinX(), gs.getMinY(), this.boardWidth, this.boardHeight).fill({ color: 0x05070c, alpha: 0.4 });
        this.container.addChild(night);

        // A low permanent sickly moon grade ties the fast shafts together across the full battlefield.
        const ambient = new Graphics();
        ambient
            .rect(gs.getMinX(), gs.getMinY(), this.boardWidth, this.boardHeight)
            .fill({ color: 0x8f812e, alpha: 0.045 });
        ambient.blendMode = "add";
        this.container.addChild(ambient);

        const texture = makeMoonPoolTexture();
        const specs = [
            { phase: 0.01, speed: 0.18, lane: 0.88, width: 0.74, height: 0.3, alpha: 0.42 },
            { phase: 0.2, speed: 0.14, lane: 0.68, width: 0.58, height: 0.25, alpha: 0.34 },
            { phase: 0.4, speed: 0.2, lane: 0.5, width: 0.8, height: 0.34, alpha: 0.4 },
            { phase: 0.61, speed: 0.16, lane: 0.3, width: 0.64, height: 0.27, alpha: 0.36 },
            { phase: 0.81, speed: 0.13, lane: 0.1, width: 0.72, height: 0.31, alpha: 0.38 },
        ];
        for (const spec of specs) {
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.blendMode = "add";
            sprite.tint = 0xffdb72;
            sprite.alpha = spec.alpha;
            sprite.width = this.boardWidth * spec.width;
            sprite.height = this.boardHeight * spec.height;
            sprite.rotation = -0.42;
            this.container.addChild(sprite);
            this.pools.push({
                sprite,
                phase: spec.phase,
                speed: spec.speed,
                lane: spec.lane,
                baseAlpha: spec.alpha,
            });
        }
    }
    public getContainer(): Container {
        return this.container;
    }
    public update(dt: number): void {
        this.time += dt;
        for (const pool of this.pools) {
            // Fast horror-moon shafts: every band crosses the board in roughly 5–8 seconds and pulses hard
            // enough to be obvious on first glance. Small vertical movement keeps the sweep organic.
            const travel = (this.time * pool.speed + pool.phase) % 1;
            pool.sprite.x = this.minX - this.boardWidth * 0.35 + travel * this.boardWidth * 1.7;
            pool.sprite.y =
                this.centerY + (pool.lane - 0.5) * this.boardHeight + Math.sin(this.time * 1.18 + pool.phase * 9) * 38;
            pool.sprite.alpha =
                pool.baseAlpha * (0.5 + (0.5 + 0.5 * Math.sin(this.time * 2.35 + pool.phase * 11)) * 0.75);
            pool.sprite.rotation = -0.42 + Math.sin(this.time * 0.62 + pool.phase * 7) * 0.11;
        }
    }
    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
