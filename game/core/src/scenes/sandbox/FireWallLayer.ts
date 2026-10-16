import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";

import type { HoCMath } from "@heroesofcrypto/common";

/** One burning cell from the authoritative fight snapshot (sandbox, ranked and replay share this layer). */
export interface IFireWallCell {
    x: number;
    y: number;
    l: number;
}

type ToWorld = (cell: HoCMath.XY) => (HoCMath.XY & { cellSize?: number }) | undefined;
type TextureLookup = (key: string) => Texture | undefined;

// The same approved, video-derived fire as the dungeon braziers. Reuse the scene's texture lease;
// only the frame views belong to this layer, never the shared atlas/source.
const FIRE_ATLAS = "ambient_fire_video_torch_left_natural_v4_64_atlas";
const FRAME_SIZE = 256;
const FRAME_COUNT = 64;
const ATLAS_COLUMNS = 8;
const IGNITE_SECONDS = 0.38;
const BURNOUT_SECONDS = 0.6;
const EMBERS = 6;
const SMOKE_PUFFS = 3;

// Staggered roots fill the burning tile in depth as well as width. A vertical/diagonal wall must read
// as burning terrain too, rather than a row of isolated torches on the front edges of its cells.
const FLAME_ROOTS = [
    { x: -0.31, y: 0.14 },
    { x: 0.04, y: 0.21 },
    { x: 0.32, y: 0.1 },
    { x: -0.19, y: -0.16 },
    { x: 0.2, y: -0.19 },
] as const;

interface IFlame {
    body: Sprite;
    light: Sprite;
    phase: number;
    speed: number;
    width: number;
    height: number;
    mirror: number;
}

interface IFireVisual {
    x: number;
    y: number;
    cellSize: number;
    projectionCellSize: number;
    life: number;
    alive: boolean;
    lapsRemaining: number;
    heat: number;
    phase: number;
    ground: Container;
    fire: Container;
    smoke: Container;
    sparks: Container;
    scorch: Sprite;
    glow: Sprite;
    core: Sprite;
    coals: Graphics;
    fallback: Graphics;
    flames: IFlame[];
    wisps: Sprite[];
    embers: Sprite[];
}

/**
 * Persistent, grounded fire: textured turbulent flames, warm falloff on the stone, a charred ember bed,
 * drifting soot and tiny sparks. Normal-blend flame bodies retain their dark folds; a restrained additive
 * copy supplies hot filaments. No filters or per-frame textures/geometry are needed for the fire itself.
 *
 * Lifetime still comes exclusively from the engine. The final lap burns lower and redder, and missing
 * cells extinguish smoothly. Empty boards do no animation work and request no assets.
 */
export class FireWallLayer {
    private readonly container = new Container();
    private readonly ground = new Container();
    private readonly smoke = new Container();
    private readonly fire = new Container();
    private readonly sparks = new Container();
    private readonly visuals = new Map<number, IFireVisual>();
    private frames: Texture[] = [];
    private softTexture?: Texture;
    private time = 0;
    private atlasPresence = 0;
    public constructor(private readonly texAny: TextureLookup = () => undefined) {
        this.container.eventMode = "none";
        this.fire.sortableChildren = true;
        this.container.addChild(this.ground, this.smoke, this.fire, this.sparks);
        // Sandbox destroys world-root attachments directly. Cover that path as well as destroy().
        this.container.once("destroyed", () => {
            for (const frame of this.frames) frame.destroy(false);
            this.frames = [];
            if (this.softTexture && this.softTexture !== Texture.WHITE) this.softTexture.destroy(true);
            this.softTexture = undefined;
            this.visuals.clear();
        });
    }
    public getContainer(): Container {
        return this.container;
    }
    private static key(cell: HoCMath.XY): number {
        return (cell.x << 8) | (cell.y & 0xff);
    }
    private static seed(key: number, salt: number): number {
        const value = Math.sin(key * 73.17 + salt * 19.31 + 1.77) * 37619.4271;
        return value - Math.floor(value);
    }
    /** One small runtime light falloff, shared by the ground lighting, soot and all burning cells. */
    private getSoftTexture(): Texture {
        if (this.softTexture) return this.softTexture;
        if (typeof document === "undefined") return Texture.WHITE;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext("2d");
        if (!ctx) return Texture.WHITE;
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.22, "rgba(255,255,255,0.72)");
        gradient.addColorStop(0.55, "rgba(255,255,255,0.22)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        this.softTexture = Texture.from(canvas);
        return this.softTexture;
    }
    private ensureFrames(): void {
        if (this.frames.length) return;
        const atlas = this.texAny(FIRE_ATLAS);
        if (!atlas || atlas.destroyed || atlas.width < FRAME_SIZE * ATLAS_COLUMNS || atlas.height < FRAME_SIZE * 8) {
            return;
        }
        for (let i = 0; i < FRAME_COUNT; i++) {
            this.frames.push(
                new Texture({
                    source: atlas.source,
                    frame: new Rectangle(
                        (i % ATLAS_COLUMNS) * FRAME_SIZE,
                        Math.floor(i / ATLAS_COLUMNS) * FRAME_SIZE,
                        FRAME_SIZE,
                        FRAME_SIZE,
                    ),
                }),
            );
        }
    }
    private softSprite(parent: Container, tint: number, additive = false): Sprite {
        const sprite = new Sprite(this.getSoftTexture());
        sprite.anchor.set(0.5);
        sprite.tint = tint;
        if (additive) sprite.blendMode = "add";
        parent.addChild(sprite);
        return sprite;
    }
    private createVisual(
        key: number,
        cell: IFireWallCell,
        world: HoCMath.XY & { cellSize?: number },
        cellSize: number,
    ): IFireVisual {
        const ground = this.ground.addChild(new Container());
        const smoke = this.smoke.addChild(new Container());
        const fire = this.fire.addChild(new Container());
        const sparks = this.sparks.addChild(new Container());
        const scorch = this.softSprite(ground, 0x100b0a);
        const glow = this.softSprite(ground, 0xff5a16, true);
        const core = this.softSprite(ground, 0xffb448, true);
        const coals = ground.addChild(new Graphics());
        const fallback = fire.addChild(new Graphics());
        coals.blendMode = "add";
        // Fixed coal geometry: flicker its opacity, never rebuild it each animation tick.
        for (let i = 0; i < 22; i++) {
            const seed = FireWallLayer.seed(key, i + 90);
            const x = (FireWallLayer.seed(key, i + 120) - 0.5) * 0.84;
            const y = (FireWallLayer.seed(key, i + 150) - 0.5) * 0.54;
            coals.ellipse(x, y, 0.013 + seed * 0.023, 0.005 + seed * 0.009).fill({
                color: i % 4 === 0 ? 0xffc36b : 0xc64a1c,
                alpha: 0.45 + seed * 0.4,
            });
        }
        const wisps = Array.from({ length: SMOKE_PUFFS }, () => this.softSprite(smoke, 0x302b29));
        const embers = Array.from({ length: EMBERS }, () => this.softSprite(sparks, 0xffda8c, true));
        return {
            x: world.x,
            y: world.y,
            cellSize: world.cellSize ?? cellSize,
            projectionCellSize: cellSize,
            life: 0,
            alive: true,
            lapsRemaining: cell.l,
            heat: cell.l <= 1 ? 0.4 : 1,
            phase: FireWallLayer.seed(key, 1) * Math.PI * 2,
            ground,
            fire,
            smoke,
            sparks,
            scorch,
            glow,
            core,
            coals,
            fallback,
            flames: [],
            wisps,
            embers,
        };
    }
    private ensureFlames(key: number, visual: IFireVisual): void {
        if (!this.frames.length || visual.flames.length) return;
        for (let i = 0; i < FLAME_ROOTS.length; i++) {
            const seed = FireWallLayer.seed(key, i + 20);
            const body = new Sprite(this.frames[0]);
            const light = new Sprite(this.frames[0]);
            body.anchor.set(0.5, 0.96);
            light.anchor.copyFrom(body.anchor);
            light.blendMode = "add";
            visual.fire.addChild(body);
            visual.flames.push({
                body,
                light,
                phase: FireWallLayer.seed(key, i + 40) * FRAME_COUNT,
                speed: 14 + seed * 4,
                width: 0.97 + seed * 0.28,
                height: 0.58 + FireWallLayer.seed(key, i + 60) * 0.35,
                mirror: i % 2 ? -1 : 1,
            });
        }
        // Keep equal blend modes together so a cell batches its flames, rather than forcing a GPU
        // draw-call break between every body and its additive copy.
        for (const flame of visual.flames) visual.fire.addChild(flame.light);
    }
    public update(dt: number, cells: readonly IFireWallCell[], cellSize: number, toWorld: ToWorld): void {
        if (this.container.destroyed || (!cells.length && !this.visuals.size)) return;
        this.time += dt;
        this.ensureFrames();
        if (this.frames.length) this.atlasPresence = Math.min(1, this.atlasPresence + dt / 0.2);

        for (const visual of this.visuals.values()) visual.alive = false;
        for (const cell of cells) {
            const key = FireWallLayer.key(cell);
            const existing = this.visuals.get(key);
            if (existing) {
                existing.alive = true;
                existing.lapsRemaining = cell.l;
                if (existing.projectionCellSize !== cellSize) {
                    const world = toWorld(cell);
                    if (world) {
                        existing.x = world.x;
                        existing.y = world.y;
                        existing.cellSize = world.cellSize ?? cellSize;
                        existing.projectionCellSize = cellSize;
                    }
                }
            } else {
                const world = toWorld(cell);
                if (world) this.visuals.set(key, this.createVisual(key, cell, world, cellSize));
            }
        }

        const wind = 0.6 * Math.sin(this.time * 0.63) + 0.4 * Math.sin(this.time * 0.29 + 1.1);
        for (const [key, visual] of this.visuals) {
            visual.life = Math.min(
                1,
                Math.max(0, visual.life + dt * (visual.alive ? 1 / IGNITE_SECONDS : -1 / BURNOUT_SECONDS)),
            );
            if (!visual.alive && visual.life <= 0) {
                visual.ground.destroy({ children: true });
                visual.fire.destroy({ children: true });
                visual.smoke.destroy({ children: true });
                visual.sparks.destroy({ children: true });
                this.visuals.delete(key);
                continue;
            }
            visual.heat += ((visual.lapsRemaining <= 1 ? 0.4 : 1) - visual.heat) * Math.min(1, dt * 4);
            this.ensureFlames(key, visual);
            this.drawCell(key, visual, wind);
        }
    }
    private drawCell(key: number, v: IFireVisual, wind: number): void {
        const size = v.cellSize;
        const life = v.life * v.life * (3 - 2 * v.life);
        const breath =
            0.88 + 0.08 * Math.sin(this.time * 6.1 + v.phase) + 0.04 * Math.sin(this.time * 13.7 + v.phase * 2.3);
        const strength = life * (0.42 + v.heat * 0.58);
        for (const group of [v.ground, v.fire, v.smoke, v.sparks]) {
            group.position.set(v.x, v.y);
            group.scale.set(size);
        }
        // Higher world Y is farther away. Front cells draw over the roots of cells behind them.
        v.fire.zIndex = -v.y;
        v.scorch.width = 1.05;
        v.scorch.height = 0.7;
        v.scorch.alpha = life * 0.48;
        v.glow.width = 1.65;
        v.glow.height = 1.06;
        v.glow.alpha = strength * breath * 0.35;
        v.core.width = 1.03;
        v.core.height = 0.58;
        v.core.alpha = strength * breath * 0.42;
        v.coals.alpha = life * (0.48 + v.heat * 0.52) * breath;

        for (let i = 0; i < v.flames.length; i++) {
            const flame = v.flames[i];
            const root = FLAME_ROOTS[i];
            const texture = this.frames[Math.floor(this.time * flame.speed + flame.phase) % FRAME_COUNT];
            const swell = 1 + 0.035 * Math.sin(this.time * 4.7 + flame.phase);
            const height = flame.height * (0.48 + v.heat * 0.52) * (0.22 + life * 0.78) * swell;
            for (const sprite of [flame.body, flame.light]) {
                sprite.texture = texture;
                sprite.position.set(root.x, root.y);
                // The artwork is y-down; negative local Y makes its flames rise in the y-up world.
                sprite.scale.set((flame.mirror * flame.width) / FRAME_SIZE, -height / FRAME_SIZE);
                sprite.skew.x = wind * 0.1;
                sprite.tint = v.lapsRemaining <= 1 ? 0xffad77 : 0xffffff;
            }
            flame.body.alpha = strength * this.atlasPresence * 0.93;
            flame.light.alpha = strength * this.atlasPresence * breath * 0.2;
        }

        // Keep the hazard legible while the lazy atlas downloads or if it cannot be loaded.
        v.fallback.visible = this.atlasPresence < 1;
        if (v.fallback.visible) {
            v.fallback.clear();
            for (let i = 0; i < FLAME_ROOTS.length; i++) {
                const root = FLAME_ROOTS[i];
                const height = (0.32 + FireWallLayer.seed(key, i + 20) * 0.25) * life * (0.5 + v.heat * 0.5);
                const lean = wind * height * 0.2 + Math.sin(this.time * 5 + i + v.phase) * 0.04;
                for (let band = 0; band < 3; band++) {
                    const width = 0.13 * (1 - band * 0.25);
                    const h = height * (1 - band * 0.23);
                    v.fallback
                        .moveTo(root.x - width, root.y)
                        .quadraticCurveTo(root.x - width * 0.6, root.y + h * 0.5, root.x + lean, root.y + h)
                        .quadraticCurveTo(root.x + width + lean, root.y + h * 0.35, root.x + width, root.y)
                        .closePath()
                        .fill({
                            color: [0xba3912, 0xf77c24, 0xffce75][band],
                            alpha: strength * (1 - this.atlasPresence) * 0.65,
                        });
                }
            }
        }

        for (let i = 0; i < v.wisps.length; i++) {
            const seed = FireWallLayer.seed(key, i + 180);
            const t = (this.time * (0.23 + seed * 0.1) + seed) % 1;
            const wisp = v.wisps[i];
            wisp.position.set((seed - 0.5) * 0.65 + wind * t * 0.3, 0.3 + t * 0.95);
            wisp.width = 0.32 + t * 0.54;
            wisp.height = 0.4 + t * 0.6;
            wisp.alpha = life * Math.sin(Math.PI * t) ** 2 * 0.17;
        }
        for (let i = 0; i < EMBERS; i++) {
            const seed = FireWallLayer.seed(key, i + 210);
            const t = (this.time * (0.38 + seed * 0.32) + seed) % 1;
            const ember = v.embers[i];
            ember.position.set(
                (seed - 0.5) * 0.76 + wind * t * t * 0.3 + Math.sin(t * 8 + seed * 20) * t * 0.07,
                0.12 + t * (0.65 + seed * 0.65),
            );
            ember.width = 0.028 + seed * 0.018;
            ember.height = 0.065 * (1 - t * 0.5);
            ember.tint = t < 0.4 ? 0xffda8c : 0xe77a31;
            ember.alpha = strength * Math.sin(Math.PI * t) * (1 - t) * 0.9;
        }
    }
    public destroy(): void {
        if (!this.container.destroyed) this.container.destroy({ children: true });
    }
}
