import { Container, Mesh, MeshGeometry, type Shader } from "pixi.js";

import { createVineParticleShader } from "./VineMaterialShader";

const LIMIT = 192;
const TAU = Math.PI * 2;
const hash = (n: number): number => {
    const x = Math.sin(n * 127.1 + 13.7) * 43758.5453;
    return x - Math.floor(x);
};
type Point = { x: number; y: number };
interface PathState {
    reveal: number;
    ambient: number;
    smolder: number;
    seen: boolean;
    sequence: number;
}
interface Particle {
    mesh: Mesh<MeshGeometry, Shader>;
    owner: number;
    kind: number;
    born: number;
    life: number;
    fadeAt: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    lift: number;
    size: number;
    radius: number;
    seed: number;
}

/** Bounded presentation-only pool. All detached particles keep their world-space contact. */
export class VineGrowthVfx {
    public readonly container = new Container();
    private readonly geometry = new MeshGeometry({
        positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    private readonly particles: Particle[] = [];
    private readonly paths = new Map<number, PathState>();
    private time = 0;
    private dt = 0;
    private readonly anchor = { x: 0, y: 0 };
    public get active(): boolean {
        return this.particles.some((p) => p.mesh.visible);
    }
    public begin(dt: number): void {
        this.dt = Math.max(0, dt);
        this.time += this.dt;
        for (const path of this.paths.values()) path.seen = false;
    }
    public path(
        owner: number,
        points: readonly Point[],
        reveal: number,
        size: number,
        alive: boolean,
        dry: boolean,
    ): void {
        if (!points.length) return;
        let state = this.paths.get(owner);
        if (!state) {
            state = { reveal: 0, ambient: 0, smolder: hash(owner) * 0.7, seen: true, sequence: 0 };
            this.paths.set(owner, state);
        }
        state.seen = true;
        if (reveal < state.reveal && alive) state.reveal = 0;
        let length = 0;
        for (let i = 1; i < points.length; i++)
            length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        const spacing = size * 0.28;
        // Sample every crossed distance, including across corners and slow frames. A slow frame ages
        // its particles to the correct point in their lives instead of releasing one oversized burst.
        if (alive && reveal > state.reveal) {
            const first = Math.floor((state.reveal * length) / spacing);
            const last = Math.floor((reveal * length) / spacing);
            for (let n = first; n < last && n < first + 64; n++) {
                const distance = (n + 1) * spacing;
                this.sample(points, distance);
                const age =
                    this.dt * (1 - (distance / Math.max(length, 0.001) - state.reveal) / (reveal - state.reveal));
                const seed = owner + state.sequence++ * 17;
                if (n % 2 === 0) this.emit(owner, 0, this.anchor, size, seed, age);
                this.emit(owner, 1, this.anchor, size, seed + 3, age);
                this.emit(owner, 1, this.anchor, size, seed + 8, age);
                if (n % 2 === 0) this.emit(owner, 2, this.anchor, size, seed + 11, age);
            }
        }
        if (alive && reveal >= 0.99 && !dry) {
            // Independent slow smolder and airborne spores: both start only on a settled living vine.
            // Crossing-time ages make quiet emission stable at 30/60 Hz and on occasional slow frames.
            const sporeRate = Math.min(4, Math.max(1, length / size) * 0.5);
            state.ambient += this.dt * sporeRate;
            const spores = Math.min(8, Math.floor(state.ambient));
            state.ambient %= 1;
            for (let i = spores - 1; i >= 0; i--) {
                const seed = owner + state.sequence++ * 17;
                this.sample(points, length * (0.06 + 0.88 * hash(seed)));
                this.emit(owner, 2, this.anchor, size, seed, (state.ambient + i) / sporeRate);
            }
            const smokeRate = Math.min(3, Math.max(1, length / size) * 0.42);
            state.smolder += this.dt * smokeRate;
            const wisps = Math.min(8, Math.floor(state.smolder));
            state.smolder %= 1;
            for (let i = wisps - 1; i >= 0; i--) {
                const seed = owner + state.sequence++ * 17;
                this.sample(points, length * (0.08 + 0.84 * hash(seed + 5)));
                const age = (state.smolder + i) / smokeRate;
                this.emit(owner, 3, this.anchor, size, seed, age);
                this.emit(owner, 4, this.anchor, size, seed, age);
            }
        } else {
            // No banked quiet emissions after a recast/delay or on the last, dry lap.
            state.ambient = 0;
            state.smolder = 0;
        }
        state.reveal = reveal;
        if (!alive) this.fadeOwner(owner);
    }
    private sample(points: readonly Point[], distance: number): void {
        this.anchor.x = points[0].x;
        this.anchor.y = points[0].y;
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1],
                b = points[i],
                d = Math.hypot(b.x - a.x, b.y - a.y);
            const t = Math.min(1, distance / Math.max(0.001, d));
            this.anchor.x = a.x + (b.x - a.x) * t;
            this.anchor.y = a.y + (b.y - a.y) * t;
            if (distance <= d) return;
            distance -= d;
        }
    }
    private emit(owner: number, kind: number, point: Point, size: number, seed: number, age: number): void {
        const life =
            kind === 0
                ? 0.65 + hash(seed + 4) * 0.5
                : kind === 1
                  ? 0.44 + hash(seed + 4) * 0.35
                  : kind >= 3
                    ? 2.6 + hash(seed + 4) * 1.2
                    : 1.6 + hash(seed + 4) * 1.5;
        if (age >= life) return;
        let p = this.particles.find((p) => !p.mesh.visible);
        if (!p && this.particles.length >= LIMIT) {
            // Preserve growth under saturation; optional ambient motes can be skipped.
            if (kind >= 2) return;
            p = this.particles.reduce((a, b) =>
                (this.time - a.born) / a.life > (this.time - b.born) / b.life ? a : b,
            );
        }
        if (!p) {
            const mesh = new Mesh({ geometry: this.geometry, shader: createVineParticleShader() });
            this.container.addChild(mesh);
            p = {
                mesh,
                owner,
                kind,
                born: 0,
                life,
                fadeAt: Infinity,
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                lift: 0,
                size,
                radius: 0,
                seed,
            };
            this.particles.push(p);
        }
        const angle = hash(seed) * TAU;
        Object.assign(p, {
            owner,
            kind,
            born: this.time - age,
            life,
            fadeAt: Infinity,
            size,
            seed,
            x: point.x + (hash(seed + 1) - 0.5) * size * 0.15,
            y: point.y + (hash(seed + 2) - 0.5) * size * (kind === 0 ? 0.35 : 0.12),
            vx: Math.cos(angle) * size * (kind === 1 ? 0.45 : 0.13),
            vy: Math.sin(angle) * size * (kind === 1 ? 0.25 : 0.08),
            lift: size * (kind === 1 ? 0.7 + hash(seed + 6) * 0.6 : kind === 0 ? 0.14 : 0.28),
            radius:
                size *
                (kind === 0
                    ? 0.22 + hash(seed + 5) * 0.22
                    : kind === 1
                      ? 0.015 + hash(seed + 5) * 0.025
                      : 0.09 + hash(seed + 5) * 0.045),
        });
        if (kind >= 3) {
            // Ground light stays on the floor; wisps rise independently in y-up world space.
            p.x = point.x;
            p.y = point.y;
            p.vx = kind === 3 ? size * (0.045 + hash(seed + 8) * 0.04) : 0;
            p.vy = 0;
            p.lift = kind === 3 ? size * (0.13 + hash(seed + 7) * 0.09) : 0;
            p.radius = size * (kind === 3 ? 0.27 + hash(seed + 5) * 0.15 : 0.32 + hash(seed + 5) * 0.14);
        }
        p.mesh.visible = true;
        p.mesh.blendMode = kind === 2 || kind === 4 ? "add" : "normal";
        p.mesh.shader!.resources.particle.uniforms.uKind = kind;
        p.mesh.shader!.resources.particle.uniforms.uSeed = hash(seed) * 97;
    }
    private fadeOwner(owner: number): void {
        for (const p of this.particles) if (p.owner === owner) p.fadeAt = Math.min(p.fadeAt, this.time + 0.13);
    }
    public end(): void {
        for (const [owner, path] of this.paths)
            if (!path.seen) {
                this.fadeOwner(owner);
                this.paths.delete(owner);
            }
        for (const p of this.particles) {
            if (!p.mesh.visible) continue;
            const age = this.time - p.born,
                t = age / p.life;
            if (t >= 1 || this.time >= p.fadeAt) {
                p.mesh.visible = false;
                continue;
            }
            const travel = p.kind === 1 ? (1 - Math.exp(-age * 2)) / 2 : age;
            const altitude = p.kind === 1 ? Math.max(0, p.lift * age - p.size * 1.65 * age * age) : p.lift * age;
            const flutter = p.kind === 2 ? Math.sin(age * 2.6 + p.seed) * p.size * 0.065 * Math.min(1, age * 3) : 0;
            p.mesh.position.set(p.x + p.vx * travel + flutter, p.y + p.vy * travel + altitude);
            const radius = p.radius * (p.kind === 0 ? 0.65 + t * 1.9 : p.kind === 3 ? 0.7 + t * 0.9 : 1);
            p.mesh.scale.set(radius, radius * (p.kind === 0 ? 1.6 : p.kind === 3 ? 2.2 : p.kind === 4 ? 0.55 : 1));
            p.mesh.rotation = p.kind === 1 ? p.seed + age * (hash(p.seed + 9) - 0.5) * 9 : 0;
            p.mesh.alpha = Math.min(1, (p.fadeAt - this.time) / 0.13);
            p.mesh.shader!.resources.particle.uniforms.uAge = Math.max(0, t);
        }
    }
    public destroy(): void {
        for (const p of this.particles) {
            p.mesh.shader!.destroy();
            p.mesh.destroy();
        }
        this.particles.length = 0;
        this.paths.clear();
        this.geometry.destroy(true);
        this.container.destroy();
    }
}
