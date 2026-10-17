import type { SpellAtmosphereEmitter } from "./SpellAtmosphere";
import { emitFireAtmosphere } from "./FireSpellAtmosphere";
import { Container, Sprite, Texture } from "pixi.js";
import { FIRE_SPELL_PLAYBACK_SPEED, METEOR_FLIGHT_SCALE } from "../../settings/fireSpellTiming";
import { FIRE_RING_LIFE_MS, METEOR_FALL_MS, METEOR_IMPACT_MS, meteorImpactPlan } from "./SpellFireSprites";
import type { WhirlpoolFootprint as Footprint } from "./WhirlpoolSprites";

type Material = "flame" | "smoke" | "glow" | "rock";
type Materials = Record<Material, Texture[]>;
type Cast = { kind: "ring" | "meteor"; target: Footprint; area: Footprint; start: number; delay: number; seed: number };
const TAU = Math.PI * 2;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const valid = (f: Footprint) =>
    [f.center.x, f.center.y, f.width, f.height].every(Number.isFinite) && f.width > 0 && f.height > 0;
const copy = (f: Footprint): Footprint => ({ ...f, center: { ...f.center } });
function random(seed: number) {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}
const rng = random(961016);
const seeds = Array.from({ length: 520 }, () => ({
    angle: rng() * TAU,
    radius: rng(),
    speed: rng(),
    life: rng(),
    phase: rng() * TAU,
}));

/** Small reusable density/material maps generated locally; no painted animation cels. */
export function createFireParticleMaterials(): Materials {
    const result: Materials = { flame: [], smoke: [], glow: [], rock: [] };
    for (const material of Object.keys(result) as Material[]) {
        for (let variant = 0; variant < (material === "glow" ? 1 : 6); variant++) {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 64;
            const ctx = canvas.getContext("2d")!;
            const pixels = ctx.createImageData(64, 64);
            const rand = random(1297 + variant * 71);
            const grids = [4, 8, 16].map((n) => ({ n, values: Array.from({ length: (n + 1) ** 2 }, rand) }));
            const noise = (x: number, y: number) =>
                grids.reduce((sum, grid, octave) => {
                    const gx = (x / 64) * grid.n,
                        gy = (y / 64) * grid.n;
                    const ix = Math.floor(gx),
                        iy = Math.floor(gy);
                    const u = gx - ix,
                        v = gy - iy,
                        a = u * u * (3 - 2 * u),
                        b = v * v * (3 - 2 * v);
                    const at = (dx: number, dy: number) => grid.values[(iy + dy) * (grid.n + 1) + ix + dx];
                    return (
                        sum +
                        ((at(0, 0) * (1 - a) + at(1, 0) * a) * (1 - b) + (at(0, 1) * (1 - a) + at(1, 1) * a) * b) *
                            [0.55, 0.3, 0.15][octave]
                    );
                }, 0);
            for (let y = 0; y < 64; y++)
                for (let x = 0; x < 64; x++) {
                    const nx = (x - 31.5) / 31.5,
                        ny = (y - 31.5) / 31.5;
                    const radius = Math.hypot(nx, ny),
                        n = noise(x, y),
                        i = (y * 64 + x) * 4;
                    let r = 255,
                        g = 255,
                        b = 255;
                    let alpha =
                        Math.pow(clamp(1 - radius + (n - 0.5) * 0.9), material === "smoke" ? 1.1 : 1.6) *
                        clamp((1 - radius) * 8);
                    if (material === "glow") alpha = Math.pow(clamp(1 - radius), 2.8);
                    if (material === "smoke") {
                        r = 100 + n * 100;
                        g = r * 0.94;
                        b = r * 0.87;
                    }
                    if (material === "rock") {
                        const angle = Math.atan2(ny, nx);
                        const edge = 0.78 + 0.07 * Math.sin(angle * 5 + variant) + 0.05 * Math.sin(angle * 9);
                        alpha = clamp((edge - radius) * 35);
                        const light = clamp(0.6 - nx * 0.35 - ny * 0.35) * (22 + n * 65);
                        const cracks = Math.pow(clamp(1 - Math.abs(n - 0.49) * 75), 2);
                        const rim = clamp(1 - Math.abs(radius - edge + 0.04) * 22) * clamp(nx + ny + 0.8);
                        const heat = Math.max(cracks * 0.8, rim * 0.9);
                        r = light + heat * 210;
                        g = light * 0.84 + heat * 65;
                        b = light * 0.7 + heat * 8;
                    }
                    pixels.data[i] = r;
                    pixels.data[i + 1] = g;
                    pixels.data[i + 2] = b;
                    pixels.data[i + 3] = alpha * 255;
                }
            ctx.putImageData(pixels, 0, 0);
            result[material].push(Texture.from(canvas));
        }
    }
    return result;
}

/** World-space pooled particles: ground illumination, turbulent flame, smoke and ballistic embers. */
export class SpellFireParticles {
    private casts: Cast[] = [];
    private materials?: Materials;
    private air?: Container;
    private ground?: Container;
    private airPool: Sprite[] = [];
    private groundPool: Sprite[] = [];
    private airUsed = 0;
    private groundUsed = 0;
    public constructor(
        private readonly attach: (container: Container, z: number) => void,
        private readonly now: () => number = () => performance.now(),
        private readonly makeMaterials: () => Materials = createFireParticleMaterials,
        private readonly emitAtmosphere?: SpellAtmosphereEmitter,
    ) {}
    public get active(): boolean {
        return this.casts.length > 0;
    }
    public ring(target: Footprint, area: Footprint): void {
        if (!valid(target) || !valid(area)) return;
        this.add([
            {
                kind: "ring",
                target: copy(target),
                area: copy(area),
                start: this.now(),
                delay: 0,
                seed: Math.floor(Math.random() * 200),
            },
        ]);
    }
    public meteors(cells: readonly Footprint[]): void {
        const start = this.now();
        this.add(
            meteorImpactPlan(cells).map(({ footprint, delay }, i) => ({
                kind: "meteor",
                target: footprint,
                area: footprint,
                start,
                delay,
                seed: i * 29,
            })),
        );
    }
    private add(casts: Cast[]): void {
        if (!casts.length) return;
        this.materials ??= this.makeMaterials();
        if (!this.air) {
            this.air = new Container();
            this.air.scale.y = -1;
            this.attach(this.air, 5520);
            this.ground = new Container();
            this.ground.scale.y = -1;
            this.attach(this.ground, 80);
        }
        // Bound rapid preview clicking; a full shower is twelve impacts.
        this.casts.push(...casts);
        if (this.casts.length > 48) this.casts.splice(0, this.casts.length - 48);
        this.update();
    }
    private puff(
        material: Material,
        x: number,
        y: number,
        w: number,
        h: number,
        alpha: number,
        tint: number,
        index: number,
        rotation = 0,
        floor = false,
    ): void {
        if (alpha <= 0 || w <= 0 || h <= 0) return;
        const pool = floor ? this.groundPool : this.airPool;
        const used = floor ? this.groundUsed : this.airUsed;
        if (used >= (floor ? 96 : 2400)) return;
        let sprite = pool[used];
        if (!sprite) {
            sprite = new Sprite();
            sprite.anchor.set(0.5);
            (floor ? this.ground! : this.air!).addChild(sprite);
            pool.push(sprite);
        }
        if (floor) this.groundUsed++;
        else this.airUsed++;
        const textures = this.materials![material];
        sprite.texture = textures[index % textures.length];
        sprite.visible = true;
        sprite.position.set(x, -y);
        sprite.width = w;
        sprite.height = h;
        sprite.rotation = rotation;
        sprite.alpha = clamp(alpha);
        sprite.tint = tint;
        sprite.blendMode = material === "glow" ? "add" : "normal";
    }
    private impact(f: Footprint, age: number, offset: number): void {
        if (age < 0 || age >= 0.63) return;
        const { x, y } = f.center,
            sx = f.width / 100,
            sy = f.height / 82;
        const t = age / 0.63;
        this.puff("glow", x, y, f.width * (1 + t), f.height * (0.7 + t * 0.5), (1 - t) * 0.85, 0xff6815, 0, 0, true);
        for (let i = 0; i < 28; i++) {
            const p = seeds[(i + offset) % seeds.length];
            const r = 12 + t * (25 + p.radius * 25);
            this.puff(
                "smoke",
                x + Math.cos(p.angle) * r * sx,
                y + (Math.sin(p.angle) * r * 0.45 + t * 25) * sy,
                (18 + t * 40) * sx,
                (17 + t * 38) * sy,
                Math.sin(t * Math.PI) * 0.48,
                0x8b8176,
                i,
                p.phase + t * 0.4,
            );
        }
        for (let i = 0; i < 52; i++) {
            const p = seeds[(i + offset + 51) % seeds.length];
            const life = 0.23 + p.life * 0.34,
                k = age / life;
            if (k >= 1) continue;
            const r = (1 - (1 - k) ** 2) * (8 + p.radius * 32);
            this.puff(
                "flame",
                x + Math.cos(p.angle) * r * sx,
                y + (Math.sin(p.angle) * r * 0.5 + Math.sin(k * Math.PI) * 22) * sy,
                (19 * (1 - k) + 3) * sx,
                (28 * (1 - k) + 4) * sy,
                (1 - k) * 0.95,
                k < 0.24 ? 0xffd79b : k < 0.6 ? 0xf48425 : 0xba3911,
                i,
                p.angle * 0.3,
            );
        }
        this.embers(f, age, offset, 26);
        this.puff("glow", x, y + 4 * sy, 64 * sx, 48 * sy, clamp(1 - age / 0.12), 0xffddab, 0);
    }
    private embers(f: Footprint, age: number, offset: number, count: number): void {
        const sx = f.width / 100,
            sy = f.height / 82;
        for (let i = 0; i < count; i++) {
            const p = seeds[(i + offset + 120) % seeds.length],
                life = 0.3 + p.life * 0.45;
            const t = age / life;
            if (t < 0 || t >= 1) continue;
            const vx = Math.cos(p.angle) * (28 + p.radius * 80),
                vy = 55 + p.speed * 85;
            this.puff(
                "flame",
                f.center.x + vx * age * sx,
                f.center.y + (vy * age - 110 * age * age) * sy,
                (1.5 + (1 - t) * 1.5) * sx,
                (3 + (1 - t) * 7) * sy,
                (1 - t) * 0.95,
                0xffb25b,
                i * 5,
                Math.atan2(vx, vy - 220 * age),
            );
        }
    }
    private drawRing(cast: Cast, ms: number): void {
        const t = ms / 1000,
            { target, area, seed } = cast;
        const sx = Math.min(target.width, target.height) / 82;
        if (t < 0.31) {
            const k = t / 0.31,
                radius = (7 + 19 * k) * sx;
            this.puff(
                "glow",
                target.center.x,
                target.center.y,
                target.width * 1.8,
                target.height * 1.5,
                k * 0.7,
                0xf36b13,
                0,
                0,
                true,
            );
            for (let i = 0; i < 100; i++) {
                const p = seeds[(i + seed) % seeds.length],
                    a = p.angle + t * 8,
                    r = Math.sqrt(p.radius) * radius;
                this.puff(
                    "flame",
                    target.center.x + Math.cos(a) * r,
                    target.center.y + Math.sin(a) * r + 8 * sx,
                    radius * 0.75,
                    radius * (0.8 + p.speed * 0.5),
                    clamp(t / 0.07) * 0.8,
                    i % 4 === 0 ? 0xffe4b0 : 0xf5751c,
                    i,
                    a,
                );
            }
            return;
        }
        const a = t - 0.31,
            expansion = clamp(a / 0.24);
        const cx = target.center.x + (area.center.x - target.center.x) * expansion;
        const cy = target.center.y + (area.center.y - target.center.y) * expansion;
        this.puff(
            "glow",
            cx,
            cy,
            area.width * 1.15,
            area.height * 1.12,
            Math.sin(clamp(a / 1.09) * Math.PI) * 0.7,
            0xe65c13,
            0,
            0,
            true,
        );
        // Smoke first, then individual tongues with a warm core and darker cooling tips.
        for (const soot of [true, false])
            for (let i = 0; i < 400; i++) {
                if ((i % 5 === 0) !== soot) continue;
                const p = seeds[(i + seed) % seeds.length],
                    age = a - p.radius * 0.24,
                    life = 0.35 + p.life * 0.49;
                const k = age / life;
                if (k < 0 || k >= 1) continue;
                const edge = 1 + 0.045 * Math.sin(p.angle * 7 + p.phase);
                const rx = area.width * 0.43 * expansion * edge,
                    ry = area.height * 0.43 * expansion * edge;
                const x = cx + Math.cos(p.angle) * rx + Math.sin(p.phase + age * 8) * 4 * sx;
                const y = cy + Math.sin(p.angle) * ry + age * (soot ? 40 : 50) * sx;
                const size = (soot ? 20 + k * 34 : 20 * (1 - k) + 5) * sx;
                this.puff(
                    soot ? "smoke" : "flame",
                    x,
                    y,
                    size * (0.65 + p.speed * 0.5),
                    size * (soot ? 1.1 : 1.8),
                    Math.sin(k * Math.PI) * (soot ? 0.46 : 0.92),
                    soot ? 0x918679 : k < 0.2 ? 0xffbd65 : k < 0.65 ? 0xf07818 : 0xa52e0c,
                    i,
                    Math.sin(p.phase + age * 5) * 0.2,
                );
            }
        this.impact(target, a, seed);
        this.embers({ ...area, width: area.width * 0.8 }, a, seed + 90, 48);
    }
    private drawMeteor(cast: Cast, ms: number): void {
        const f = cast.area,
            sx = f.width / 100,
            sy = f.height / 82;
        if (ms >= METEOR_FALL_MS) {
            this.impact(f, (ms - METEOR_FALL_MS) / 1000, cast.seed);
            return;
        }
        const t = ms / METEOR_FALL_MS,
            remaining = 1 - t * t;
        const x = f.center.x + remaining * f.width * 2.2,
            y = f.center.y + remaining * f.height * 4.2;
        const fade = clamp(ms / 70),
            size = (0.85 + seeds[cast.seed % seeds.length].radius * 0.3) * METEOR_FLIGHT_SCALE;
        this.puff("glow", f.center.x, f.center.y, f.width * 0.85, f.height * 0.75, t ** 4 * 0.65, 0xe75e16, 0, 0, true);
        for (let i = 27; i >= 0; i--) {
            const q = i / 27,
                p = seeds[(i + cast.seed) % seeds.length];
            const jitter = Math.sin(t * 27 + p.phase) * 5 * q;
            if (i % 3 === 0)
                this.puff(
                    "smoke",
                    x + q * 75 * sx,
                    y + q * 100 * sy,
                    (12 + q * 25) * sx,
                    (15 + q * 30) * sy,
                    q * (1 - q) * fade * 0.8,
                    0x81776f,
                    i,
                    p.phase,
                );
            this.puff(
                "flame",
                x + (q * 65 + jitter) * sx,
                y + q * 85 * sy,
                (16 * (1 - q) + 4) * sx * size,
                (25 * (1 - q) + 4) * sy * size,
                (1 - q) * fade * 0.85,
                q < 0.2 ? 0xffcc82 : q < 0.6 ? 0xe8751e : 0xab3710,
                i,
                -0.55,
            );
        }
        this.puff("rock", x, y, 25 * sx * size, 28 * sy * size, fade, 0xffffff, cast.seed, -0.5 + t * 0.65);
        this.puff("glow", x - 5 * sx, y - 5 * sy, 16 * sx, 13 * sy, fade * 0.7, 0xffa04b, 0);
    }
    public update(): void {
        this.airUsed = this.groundUsed = 0;
        const now = this.now();
        this.casts = this.casts.filter((cast) => {
            const age = (now - cast.start) * FIRE_SPELL_PLAYBACK_SPEED - cast.delay;
            if (age >= (cast.kind === "ring" ? FIRE_RING_LIFE_MS : METEOR_FALL_MS + METEOR_IMPACT_MS)) return false;
            if (age >= 0) {
                emitFireAtmosphere(this.emitAtmosphere, cast.kind, age, cast.target, cast.area);
                if (cast.kind === "ring") this.drawRing(cast, age);
                else this.drawMeteor(cast, age);
            }
            return true;
        });
        for (let i = this.airUsed; i < this.airPool.length; i++) this.airPool[i].visible = false;
        for (let i = this.groundUsed; i < this.groundPool.length; i++) this.groundPool[i].visible = false;
    }
    public clear(): void {
        this.casts = [];
        this.air?.destroy({ children: true });
        this.ground?.destroy({ children: true });
        this.air = this.ground = undefined;
        this.airPool = [];
        this.groundPool = [];
        for (const textures of Object.values(this.materials ?? {}))
            for (const texture of textures) texture.destroy(true);
        this.materials = undefined;
    }
}
