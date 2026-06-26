import { Container, Sprite, Texture, Graphics } from "pixi.js";
import { GridSettings, HoCMath } from "@heroesofcrypto/common";

/**
 * Moody dungeon lighting: a soft darkening over the board with warm fire braziers blazing in each of
 * the four corners, so the surround reads as lit-by-firelight and the centre stays moodier — like a
 * stone room with a brazier in every corner.
 *
 * Each brazier is two additive sprites — a hot yellow-white CORE and a larger orange HALO — that
 * flicker independently (layered sines approximate the erratic brightness of a real flame) and let the
 * core dance slightly, so the light reads as living fire rather than a static glow. Built from a
 * darkening overlay + additive radial sprites (no fragile full-screen shader), so it can't break the
 * scene render. Tune the constants below to taste.
 */
// Darkening laid over the board so the lit surround has something to read against.
const DARK_COLOR = 0x080a14;
const DARK_ALPHA = 0.42;

// Fire palette: orange halo body + hotter yellow-white core right at the flame.
const HALO_TINT = 0xff6a1e;
const CORE_TINT = 0xffc06a;
const HALO_ALPHA = 0.32;
const CORE_ALPHA = 0.36;
// Halo reach as a fraction of the board's larger side — corners spill their glow well inward.
const BRAZIER_RADIUS_FACTOR = 0.46;
// The hot core is a fraction of the halo's size.
const CORE_SCALE_FACTOR = 0.42;

/** White radial-falloff texture; `hot` packs the energy nearer the centre for the core flame. */
function makeRadialTexture(hot: boolean): Texture {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Texture.WHITE;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    if (hot) {
        // Tight, bright core that falls off fast — the visible flame.
        grad.addColorStop(0.0, "rgba(255,255,255,0.95)");
        grad.addColorStop(0.25, "rgba(255,255,255,0.5)");
        grad.addColorStop(0.55, "rgba(255,255,255,0.14)");
        grad.addColorStop(1.0, "rgba(255,255,255,0.0)");
    } else {
        // Soft, wide halo — the warm pool of light cast on the floor.
        grad.addColorStop(0.0, "rgba(255,255,255,0.6)");
        grad.addColorStop(0.35, "rgba(255,255,255,0.34)");
        grad.addColorStop(0.7, "rgba(255,255,255,0.1)");
        grad.addColorStop(1.0, "rgba(255,255,255,0.0)");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return Texture.from(canvas);
}

/** Layered sines → erratic flame brightness (~0.68..1.04). */
function flameFlicker(t: number): number {
    return 0.86 + 0.1 * Math.sin(t * 3.1) + 0.05 * Math.sin(t * 7.7 + 1.3) + 0.03 * Math.sin(t * 13.1 + 2.7);
}

/** Sharper, higher-frequency flicker for the core so the flame tip looks more alive than its pool. */
function coreFlicker(t: number): number {
    return 0.8 + 0.12 * Math.sin(t * 5.0 + 0.5) + 0.06 * Math.sin(t * 11.0 + 2.0) + 0.04 * Math.sin(t * 19.0 + 4.0);
}

interface Brazier {
    halo: Sprite;
    core: Sprite;
    haloBaseScale: number;
    coreBaseScale: number;
    x: number;
    y: number;
    danceAmp: number; // px of core jitter, scaled to the brazier size
    phase: number; // so each corner flickers independently
}

export class LightingLayer {
    private readonly container = new Container();
    private readonly braziers: Brazier[] = [];
    private time = 0;
    public constructor(gs: GridSettings) {
        const minX = gs.getMinX();
        const maxX = gs.getMaxX();
        const minY = gs.getMinY();
        const maxY = gs.getMaxY();
        const w = maxX - minX;
        const h = maxY - minY;

        // 1. Darkening so the firelit corners read. Extend it FAR past the board so its hard
        //    rectangular edge is always off-screen (otherwise it shows as a visible "line" when the
        //    board doesn't fill the viewport).
        const dark = new Graphics();
        const m = Math.max(w, h) * 3;
        dark.rect(minX - m, minY - m, w + 2 * m, h + 2 * m).fill({ color: DARK_COLOR, alpha: DARK_ALPHA });
        this.container.addChild(dark);

        // 2. A blazing brazier in each of the four corners — this is what lights the dungeon, and the
        //    corners that used to sit pitch-dark now carry the fire.
        const haloTex = makeRadialTexture(false);
        const coreTex = makeRadialTexture(true);
        const haloTexW = haloTex.width || 512;
        const coreTexW = coreTex.width || 512;
        const radius = Math.max(w, h) * BRAZIER_RADIUS_FACTOR;
        const corners: HoCMath.XY[] = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: minX, y: maxY },
            { x: maxX, y: maxY },
        ];
        corners.forEach((p, i) => {
            const halo = new Sprite(haloTex);
            halo.anchor.set(0.5);
            halo.blendMode = "add";
            halo.tint = HALO_TINT;
            halo.position.set(p.x, p.y);
            const haloBaseScale = (radius * 2) / haloTexW;
            halo.scale.set(haloBaseScale);
            halo.alpha = HALO_ALPHA;

            const core = new Sprite(coreTex);
            core.anchor.set(0.5);
            core.blendMode = "add";
            core.tint = CORE_TINT;
            core.position.set(p.x, p.y);
            const coreBaseScale = ((radius * 2) / coreTexW) * CORE_SCALE_FACTOR;
            core.scale.set(coreBaseScale);
            core.alpha = CORE_ALPHA;

            // Halo behind the core so the hot centre reads on top of the warm pool.
            this.container.addChild(halo);
            this.container.addChild(core);
            this.braziers.push({
                halo,
                core,
                haloBaseScale,
                coreBaseScale,
                x: p.x,
                y: p.y,
                danceAmp: radius * 0.02,
                phase: i * 1.7,
            });
        });
    }
    public getContainer(): Container {
        return this.container;
    }
    /** Flicker + dance the braziers so they read as living fire. */
    public update(dt: number): void {
        this.time += dt;
        for (const b of this.braziers) {
            const t = this.time + b.phase;
            const halo = flameFlicker(t);
            const core = coreFlicker(t);
            b.halo.alpha = HALO_ALPHA * halo;
            b.core.alpha = CORE_ALPHA * core;
            // Breathe the pool slowly; the core pulses a touch faster.
            b.halo.scale.set(b.haloBaseScale * (1 + 0.03 * Math.sin(t * 1.6)));
            b.core.scale.set(b.coreBaseScale * (1 + 0.07 * Math.sin(t * 2.3 + 1)));
            // Let the core flame dance a few px so the light isn't perfectly pinned to the corner.
            b.core.x = b.x + b.danceAmp * (Math.sin(t * 6.3) * 0.7 + Math.sin(t * 11.0 + 1.1) * 0.3);
            b.core.y = b.y + b.danceAmp * (Math.cos(t * 5.1) * 0.7 + Math.sin(t * 9.2 + 2.0) * 0.3);
        }
    }
    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
