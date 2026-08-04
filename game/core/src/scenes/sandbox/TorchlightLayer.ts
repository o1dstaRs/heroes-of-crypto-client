import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { GridSettings } from "@heroesofcrypto/common";

function makeGlowTexture(hot: boolean): Texture {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Texture.WHITE;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    if (hot) {
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.18, "rgba(255,255,255,0.78)");
        gradient.addColorStop(0.48, "rgba(255,255,255,0.25)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
    } else {
        gradient.addColorStop(0, "rgba(255,255,255,0.74)");
        gradient.addColorStop(0.34, "rgba(255,255,255,0.42)");
        gradient.addColorStop(0.72, "rgba(255,255,255,0.11)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return Texture.from(canvas);
}

/** A single huge torch above the board: hot source at top-centre, broad orange throw and fast flame licks. */
export class TorchlightLayer {
    private readonly container = new Container();
    private readonly halo: Sprite;
    private readonly core: Sprite;
    private readonly tongues: Array<{ sprite: Sprite; baseX: number; phase: number }> = [];
    private time = 0;
    private readonly centerX: number;
    private readonly sourceY: number;
    private readonly boardWidth: number;
    private readonly boardHeight: number;
    public constructor(gs: GridSettings) {
        this.centerX = (gs.getMinX() + gs.getMaxX()) * 0.5;
        this.sourceY = gs.getMaxY() + gs.getCellSize() * 0.12;
        this.boardWidth = gs.getMaxX() - gs.getMinX();
        this.boardHeight = gs.getMaxY() - gs.getMinY();

        // Preserve the threatening night outside the fire's reach.
        const night = new Graphics();
        night
            .rect(gs.getMinX(), gs.getMinY(), this.boardWidth, this.boardHeight)
            .fill({ color: 0x060506, alpha: 0.28 });
        this.container.addChild(night);

        const glowTexture = makeGlowTexture(false);
        const hotTexture = makeGlowTexture(true);

        this.halo = new Sprite(glowTexture);
        this.halo.anchor.set(0.5);
        this.halo.blendMode = "add";
        this.halo.tint = 0xff7418;
        this.halo.position.set(this.centerX, this.sourceY - this.boardHeight * 0.4);
        this.halo.width = this.boardWidth * 1.55;
        this.halo.height = this.boardHeight * 2.05;
        this.halo.alpha = 0.56;
        this.container.addChild(this.halo);

        this.core = new Sprite(hotTexture);
        this.core.anchor.set(0.5);
        this.core.blendMode = "add";
        this.core.tint = 0xffc34f;
        this.core.position.set(this.centerX, this.sourceY);
        this.core.width = this.boardWidth * 0.42;
        this.core.height = this.boardHeight * 0.38;
        this.core.alpha = 0.82;
        this.container.addChild(this.core);

        // Narrow overlapping tongues send bright, irregular streaks from the source deep into the map.
        const tongueSpecs = [
            { x: -0.26, phase: 0.2, width: 0.4, height: 1.12, alpha: 0.3 },
            { x: -0.08, phase: 1.8, width: 0.32, height: 1.3, alpha: 0.36 },
            { x: 0.11, phase: 3.1, width: 0.38, height: 1.18, alpha: 0.32 },
            { x: 0.29, phase: 4.7, width: 0.34, height: 1.04, alpha: 0.28 },
        ];
        for (const spec of tongueSpecs) {
            const tongue = new Sprite(glowTexture);
            tongue.anchor.set(0.5);
            tongue.blendMode = "add";
            tongue.tint = 0xff8a24;
            const baseX = this.centerX + spec.x * this.boardWidth;
            tongue.x = baseX;
            tongue.y = this.sourceY - this.boardHeight * 0.42;
            tongue.width = this.boardWidth * spec.width;
            tongue.height = this.boardHeight * spec.height;
            tongue.alpha = spec.alpha;
            tongue.rotation = spec.x * 0.42;
            this.container.addChild(tongue);
            this.tongues.push({ sprite: tongue, baseX, phase: spec.phase });
        }
    }
    public getContainer(): Container {
        return this.container;
    }
    public update(dt: number): void {
        this.time += dt;
        const fast =
            0.72 +
            Math.sin(this.time * 7.2) * 0.13 +
            Math.sin(this.time * 13.7 + 1.3) * 0.09 +
            Math.sin(this.time * 23.1 + 3.4) * 0.05;
        this.halo.alpha = 0.42 + fast * 0.3;
        this.halo.scale.set(1 + Math.sin(this.time * 4.1) * 0.035, 1 + Math.sin(this.time * 5.3 + 0.7) * 0.055);
        this.core.alpha = 0.62 + fast * 0.38;
        this.core.scale.set(0.92 + fast * 0.15, 0.88 + fast * 0.2);
        this.core.x = this.centerX + Math.sin(this.time * 11.2) * 13 + Math.sin(this.time * 19.3) * 6;
        this.core.y = this.sourceY + Math.sin(this.time * 9.4 + 0.8) * 10;

        for (const [index, entry] of this.tongues.entries()) {
            const { sprite: tongue, baseX, phase } = entry;
            const lick = 0.5 + 0.5 * Math.sin(this.time * (5.4 + index * 0.8) + phase);
            tongue.alpha = 0.2 + lick * 0.46;
            tongue.x = baseX + Math.sin(this.time * 8.1 + phase) * 18;
            tongue.scale.x = 0.82 + lick * 0.34;
            tongue.scale.y = 0.88 + (1 - lick) * 0.2;
            tongue.rotation += Math.sin(this.time * 6.2 + phase) * 0.0009;
        }
    }
    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
