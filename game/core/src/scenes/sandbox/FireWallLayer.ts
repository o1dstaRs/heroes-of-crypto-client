import { Graphics, Rectangle } from "pixi.js";
import { Container, Sprite, Texture } from "pixi.js";
import type { HoCMath } from "@heroesofcrypto/common";
import { createFireParticleMaterials } from "./SpellFireParticles";
import { SpellAtmosphere } from "./SpellAtmosphere";

export interface IFireWallCell {
    x: number;
    y: number;
    l: number;
}
type Projection = HoCMath.XY & { cellSize?: number; width?: number; height?: number; depthY?: number };
type ToWorld = (cell: HoCMath.XY) => Projection | undefined;
type Materials = ReturnType<typeof createFireParticleMaterials>;
const IGNITE_SECONDS = 0.32;
const BURNOUT_SECONDS = 0.5;
const BASE_INSET_CELLS = -0.06;
export const FIRE_WALL_HEIGHT_CELLS = 1.5;
const FLAMES = 132;
const SMOKE = 18;
const CORES = 24;
const EMBERS = 28;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const mixTint = (a: number, b: number, t: number): number => {
    const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};
// Continuous cooling avoids visible colour jumps as each tongue rises.
const flameTint = (age: number, hot: boolean): number =>
    age < 0.13
        ? mixTint(hot ? 0xffeab7 : 0xffc760, 0xffaf40, age / 0.13)
        : age < 0.5
          ? mixTint(0xffaf40, 0xf7751d, (age - 0.13) / 0.37)
          : mixTint(0xf7751d, 0xb73a0c, (age - 0.5) / 0.5);
const random = (n: number) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
};
const particles = Array.from({ length: FLAMES + SMOKE + CORES + EMBERS }, (_, i) => ({
    phase: random(i + 1),
    x: random(i + 31),
    speed: random(i + 91),
    size: random(i + 151),
}));
interface FireVisual {
    gridX: number;
    gridY: number;
    container: Container;
    sprites: Sprite[];
    x: number;
    y: number;
    cellSize: number;
    width: number;
    groundHeight: number;
    depthY: number;
    projectionCellSize: number;
    life: number;
    alive: boolean;
    lapsRemaining: number;
    seed: number;
}

/** Continuous emitters use the same procedural materials as Magic Dragon's particle fire spells. */
export class FireWallLayer {
    private readonly container = new Container();
    private readonly visuals = new Map<number, FireVisual>();
    private materials?: Materials;
    private atmosphere?: SpellAtmosphere;
    private time = 0;
    public constructor(
        private readonly attachFlame?: (container: Container, z: number) => void,
        private readonly makeMaterials: () => Materials = createFireParticleMaterials,
        private readonly attachAtmosphere?: (container: Container, z: number) => void,
        private readonly texAny: (key: string) => Texture | undefined = () => undefined,
    ) {}
    public getContainer(): Container {
        return this.container;
    }
    private create(cell: IFireWallCell, world: Projection, cellSize: number, key: number): FireVisual {
        this.materials ??= this.makeMaterials();
        if (this.attachAtmosphere) this.atmosphere ??= new SpellAtmosphere(this.attachAtmosphere);
        const container = new Container();
        container.eventMode = "none";
        // Smoke is behind the luminous gas, sparks are in front. All sprites are pooled for the cell's lifetime.
        const sprites = particles.map((_, i) => {
            const texture =
                i < SMOKE
                    ? this.materials!.smoke
                    : i < SMOKE + FLAMES + CORES
                      ? this.materials!.flame
                      : this.materials!.glow;
            const sprite = new Sprite(texture[i % texture.length]);
            sprite.anchor.set(0.5);
            sprite.eventMode = "none";
            if (i >= SMOKE + FLAMES) sprite.blendMode = "add";
            container.addChild(sprite);
            return sprite;
        });
        if (this.attachFlame) this.attachFlame(container, 4000 - (world.depthY ?? world.y) + 0.1);
        else this.container.addChild(container);
        return {
            gridX: cell.x,
            gridY: cell.y,
            container,
            sprites,
            x: world.x,
            y: world.y,
            cellSize: world.cellSize ?? cellSize,
            width: world.width ?? world.cellSize ?? cellSize,
            groundHeight: world.height ?? world.cellSize ?? cellSize,
            depthY: world.depthY ?? world.y,
            projectionCellSize: cellSize,
            life: 0,
            alive: true,
            lapsRemaining: cell.l,
            seed: random(key + 7) * 37,
        };
    }
    private draw(visual: FireVisual): void {
        const t = this.time;
        const width = visual.width;
        const height = width * FIRE_WALL_HEIGHT_CELLS;
        const root = visual.container;
        // Shift below the lower edge by 6% of the full projected cell height, compensating for soft particle margins.
        const baseY = visual.y - visual.groundHeight * (0.5 - BASE_INSET_CELLS);
        root.position.set(visual.x, baseY);
        root.zIndex = 4000 - visual.depthY + 0.1;
        const transform = root.parent?.getGlobalTransform();
        const ratio = transform
            ? Math.hypot(transform.a, transform.b) / Math.max(0.001, Math.hypot(transform.c, transform.d))
            : 1;
        root.scale.set(1, -ratio);
        root.alpha = visual.life;
        const neighborLife = (dx: number, dy: number) =>
            this.visuals.get(((visual.gridX + dx) << 8) | ((visual.gridY + dy) & 255))?.life ?? 0;
        const left = neighborLife(-1, 0);
        const right = neighborLife(1, 0);
        const upper = neighborLife(0, 1);
        const alongDepth = Math.max(neighborLife(0, -1), upper);
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i],
                sprite = visual.sprites[i];
            const soot = i < SMOKE,
                core = i >= SMOKE + FLAMES && i < SMOKE + FLAMES + CORES,
                spark = i >= SMOKE + FLAMES + CORES;
            const particleTime = soot || core || spark ? t + visual.seed : t;
            const age =
                (particleTime * (soot ? 0.36 : spark ? 0.55 + p.speed * 0.5 : 0.72 + p.speed * 0.6) + p.phase) % 1;
            const sourceX = (p.x - 0.5) * 1.02;
            const fieldX = visual.gridX + sourceX + visual.gridY * 0.37;
            const rise = age * (0.85 + p.speed * 0.15);
            // Sample one world-space flow across every emitter, so vortices cross cell seams continuously.
            const curl =
                (Math.sin(fieldX * 2.4 - rise * 5.5 + t * 2.3) * 0.07 +
                    Math.sin(fieldX * 6.1 - rise * 9 + t * 4.7) * 0.025 +
                    Math.sin(fieldX * 13 - rise * 17 + t * 7.1) * 0.009) *
                age;
            const combustion = 0.86 + 0.09 * Math.sin(fieldX * 3.7 - t * 5.1) + 0.05 * Math.sin(fieldX * 8.3 + t * 8.7);
            // Only exposed ends taper inward. Internal cell boundaries stay filled from base to crown.
            const connected = Math.max(sourceX < 0 ? left : right, alongDepth);
            const edgeTaper = 0.5 * (1 - connected);
            let x = sourceX * (1 - age * edgeTaper) + curl;
            let w: number, h: number, alpha: number, tint: number, y: number;
            if (soot) {
                // Smoke starts just below the common flame ceiling, then expands in the updraft.
                w = width * (0.18 + age * 0.38);
                h = w * (1.1 + age * 0.3);
                y = height * (0.87 + age * 0.43);
                x = sourceX * (1 - edgeTaper) + curl * 1.7 + Math.sin(t * 0.8 + fieldX) * age * age * 0.1;
                alpha = Math.pow(Math.sin(age * Math.PI), 1.5) * 0.22;
                tint = mixTint(0xa18a73, 0x74777d, age);
            } else if (spark) {
                w = width * (0.012 + p.size * 0.012);
                h = w * (3 + p.speed * 3);
                y = height * age * (2.1 - age * 0.8);
                x += curl * age * 1.5;
                alpha = Math.sin(age * Math.PI) * (0.45 + 0.4 * p.speed) * combustion;
                tint = mixTint(0xffda8f, 0xb83d0a, age);
            } else if (core) {
                // Small additive reaction zones brighten the interior without bleaching the flame silhouette.
                w = width * (0.12 + p.size * 0.12) * (1 - age * 0.5);
                h = width * (0.22 + p.size * 0.27) * (1 - age * 0.4);
                y = height * rise * 0.55 + h * 0.18;
                alpha = Math.sin(age * Math.PI) * 0.23 * combustion;
                tint = age < 0.3 ? 0xfff1c1 : age < 0.65 ? 0xffd16a : 0xff8b22;
            } else {
                const taper = Math.pow(1 - age, 0.7);
                // Overlapping reaction sheets carry the body; slimmer folds retain detail at the turbulent crown.
                const fold = i % 4 === 0;
                w = width * (fold ? 0.13 + p.size * 0.12 : 0.32 + p.size * 0.2) * (0.4 + taper * 0.6);
                h = width * (fold ? 0.6 + p.size * 0.3 : 0.4 + p.size * 0.34) * (0.5 + taper * 0.5);
                y = (height - h * 0.5) * rise + h * 0.14;
                y *= 0.94 + 0.06 * Math.sin(fieldX * 4.2 - t * 2.6 - rise * 3);
                alpha = clamp(age / 0.04) * clamp((1 - age) / 0.22) * (fold ? 0.65 : 0.82) * combustion;
                // Hot pockets, amber reaction sheets, cooling red tips — no white rectangular fuel bed.
                tint = flameTint(age, i % 5 === 0);
            }
            // A wall extending into board depth burns across the shared ground, not on separate horizontal strips.
            if (!soot && !spark) y += (visual.groundHeight / ratio) * upper * p.phase * 0.65;
            // The burning gas remains 1.5 cells high; loose embers drift into the air above it.
            const ceiling = spark ? height * 1.4 : soot ? height * 1.45 : height;
            sprite.position.set(
                x * width,
                -Math.max(h * 0.5, Math.min(ceiling - h * 0.5, y) * (0.35 + visual.life * 0.65)),
            );
            sprite.width = w;
            sprite.height = h;
            sprite.rotation = spark ? curl * 3 : curl * 1.7;
            sprite.alpha = alpha * (visual.lapsRemaining <= 1 ? 0.86 : 1);
            sprite.tint = tint;
        }
        const flicker = 0.86 + 0.09 * Math.sin(t * 7 - visual.gridX) + 0.05 * Math.sin(t * 13.7);
        // The shared spell atmosphere lights existing stone/creature detail and refracts the hot air.
        this.atmosphere?.emit({
            x: visual.x,
            y: baseY + height * 0.42 * ratio,
            width: width * 0.92,
            height: height * 0.83 * ratio,
            light: 0.22 * visual.life * flicker,
            heat: 0.8 * visual.life,
        });
        this.atmosphere?.emit({
            x: visual.x,
            y: baseY + height * 1.06 * ratio,
            width: width * 0.85,
            height: height * 0.48 * ratio,
            light: 0,
            heat: 0.32 * visual.life,
        });
    }
    public update(dt: number, cells: readonly IFireWallCell[], cellSize: number, toWorld: ToWorld): void {
        if (!cells.length && !this.visuals.size) return;
        dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        this.time += dt;
        for (const visual of this.visuals.values()) visual.alive = false;
        for (const cell of cells) {
            const key = (cell.x << 8) | (cell.y & 255);
            let visual = this.visuals.get(key);
            if (!visual) {
                const world = toWorld(cell);
                if (!world) continue;
                visual = this.create(cell, world, cellSize, key);
                this.visuals.set(key, visual);
            } else if (visual.projectionCellSize !== cellSize) {
                const world = toWorld(cell);
                if (world)
                    Object.assign(visual, {
                        x: world.x,
                        y: world.y,
                        cellSize: world.cellSize ?? cellSize,
                        width: world.width ?? world.cellSize ?? cellSize,
                        groundHeight: world.height ?? world.cellSize ?? cellSize,
                        depthY: world.depthY ?? world.y,
                        projectionCellSize: cellSize,
                    });
            }
            visual.alive = true;
            visual.lapsRemaining = cell.l;
        }
        this.atmosphere?.begin();
        // Advance all neighbors together before drawing, including partially extinguished wall segments.
        for (const visual of this.visuals.values())
            visual.life = clamp(visual.life + dt / (visual.alive ? IGNITE_SECONDS : -BURNOUT_SECONDS));
        for (const [key, visual] of this.visuals) {
            if (!visual.life && !visual.alive) {
                visual.container.destroy({ children: true });
                this.visuals.delete(key);
                continue;
            }
            this.draw(visual);
        }
        this.atmosphere?.update(this.time * 1000);
    }
    public destroy(): void {
        this.atmosphere?.clear();
        this.atmosphere = undefined;
        for (const visual of this.visuals.values()) visual.container.destroy({ children: true });
        this.visuals.clear();
        for (const textures of Object.values(this.materials ?? {}) as Texture[][])
            for (const texture of textures) texture.destroy(true);
        this.materials = undefined;
        if (!this.container.destroyed) this.container.destroy({ children: true });
    }
    private readonly ground = new Container();
    private readonly smoke = new Container();
    private readonly fire = new Container();
    private readonly sparks = new Container();
    private frames: Texture[] = [];
    private softTexture?: Texture;
    private atlasPresence = 0;
    private static key(cell: HoCMath.XY): number {
        return (cell.x << 8) | (cell.y & 0xff);
    }
    private static seed(key: number, salt: number): number {
        const value = Math.sin(key * 73.17 + salt * 19.31 + 1.77) * 37619.4271;
        return value - Math.floor(value);
    }
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
}

const FIRE_ATLAS = "ambient_fire_video_torch_left_natural_v4_64_atlas";

const FRAME_SIZE = 256;

const FRAME_COUNT = 64;

const ATLAS_COLUMNS = 8;

const SMOKE_PUFFS = 3;

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
