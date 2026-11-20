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
        if (this.container.destroyed || (!cells.length && !this.visuals.size)) return;
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
}
