import { Container, Graphics, Mesh, MeshGeometry, type Shader } from "pixi.js";
import { createChargeEarthGeometry } from "./NomadChargeEarthGeometry";
import { createChargeNoise, createChargeEarthShader, createNomadChargeDustShader } from "./NomadChargeDustShader";
import { stepChargeEarth, type EarthBody } from "./NomadChargeEarthPhysics";

interface Puff {
    node: Mesh<MeshGeometry, Shader>;
    shader: Shader;
    age: number;
    life: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    radius: number;
    seed: number;
    aspect: number;
    fadeRemaining: number;
}
interface Clod extends EarthBody {
    node: Mesh<MeshGeometry, Shader>;
    shader: Shader;
    shadow: Graphics;
    age: number;
    life: number;
    cell: number;
    size: number;
    spin: number;
    angle: number;
    fadeRemaining: number;
    shedAt: number;
}

/** Bounded reusable engine VFX. Contacts remain on the ground after the horse has passed. */
export class NomadChargeDust {
    private readonly puffs: Puff[] = [];
    private readonly clods: Clod[] = [];
    private readonly noise = createChargeNoise();
    private readonly earthGeometry = Array.from({ length: 4 }, (_, i) => createChargeEarthGeometry(i));
    private readonly geometry = new MeshGeometry({
        positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    private seed = 7391;
    private accumulator = 0;
    public constructor(private readonly root: Container) {}
    /** Arrival deadline covers every existing layer, including ground shadows. */
    public finish(): void {
        for (const p of this.puffs) p.fadeRemaining = Math.min(p.fadeRemaining, 0.3);
        for (const c of this.clods) c.fadeRemaining = Math.min(c.fadeRemaining, 0.3);
    }
    private fade(remaining: number): number {
        const t = Math.min(1, Math.max(0, remaining / 0.3));
        return t * t * (3 - 2 * t);
    }
    private random(): number {
        this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
        return this.seed / 4294967296;
    }
    private puff(x: number, y: number, cell: number, dx: number, dy: number, small = false): void {
        let p = this.puffs.find((p) => p.age >= p.life);
        if (!p && this.puffs.length < 48) {
            const shader = createNomadChargeDustShader(this.noise);
            const node = new Mesh({ geometry: this.geometry, shader });
            this.root.addChild(node);
            p = {
                node,
                shader,
                age: 0,
                life: 0,
                x: 0,
                y: 0,
                dx: 0,
                dy: 0,
                radius: 0,
                seed: 0,
                aspect: 1,
                fadeRemaining: Infinity,
            };
            this.puffs.push(p);
        }
        // A fresh hoof contact must win over an old trail when the pool is full.
        // Secondary impact dust may be omitted; never leave a gap beneath a fast horse.
        if (!p && !small)
            p = this.puffs.reduce((oldest, candidate) =>
                candidate.age / candidate.life > oldest.age / oldest.life ? candidate : oldest,
            );
        if (!p) return;
        Object.assign(p, {
            x,
            y,
            age: 0,
            life: small ? 0.45 : 0.85 + this.random() * 0.4,
            dx,
            dy,
            radius: cell * (small ? 0.15 : 0.27 + this.random() * 0.28),
            aspect: small ? 0.65 : 1.05 + this.random() * 0.8,
            seed: this.random() * 100,
            fadeRemaining: Infinity,
        });
        p.node.visible = true;
        p.node.zIndex = 4000 - y - 3;
        p.shader.resources.dust.uniforms.uSeed = p.seed;
        p.shader.resources.dust.uniforms.uAge = 0;
        p.node.position.set(x, y);
        p.node.scale.set(0);
    }
    public contact(x: number, y: number, cell: number, dirX: number, dirY: number): void {
        for (let i = 0; i < 2; i++) {
            const spread = (this.random() - 0.5) * cell * 0.45;
            this.puff(
                x,
                y,
                cell,
                -dirX * cell * (0.9 + this.random() * 0.9) - dirY * spread,
                -dirY * cell * 0.45 + dirX * spread + cell * (0.3 + this.random() * 0.6),
            );
        }
        for (let i = 0; i < 9; i++) {
            let c = this.clods.find((c) => c.age >= c.life);
            if (!c && this.clods.length < 128) {
                const shader = createChargeEarthShader(this.noise);
                const node = new Mesh({ geometry: this.earthGeometry[this.clods.length % 4], shader });
                const shadow = new Graphics().ellipse(0, 0, 1.2, 0.38).fill({ color: 0x211a12, alpha: 0.3 });
                this.root.addChild(shadow, node);
                c = {
                    node,
                    shader,
                    shadow,
                    x: 0,
                    y: 0,
                    z: 0,
                    vx: 0,
                    vy: 0,
                    vz: 0,
                    bounces: 0,
                    age: 0,
                    life: 0,
                    cell: 0,
                    size: 0,
                    spin: 0,
                    angle: 0,
                    fadeRemaining: Infinity,
                    shedAt: 0,
                };
                this.clods.push(c);
            }
            if (!c)
                c = this.clods.reduce((oldest, candidate) =>
                    candidate.age / candidate.life > oldest.age / oldest.life ? candidate : oldest,
                );
            const spread = (this.random() - 0.5) * cell * 1.8;
            const kick = cell * (0.8 + this.random() * 1.4);
            Object.assign(c, {
                x,
                y,
                z: cell * 0.015,
                vx: -dirX * kick - dirY * spread,
                vy: -dirY * kick * 0.45 + dirX * spread * 0.45,
                vz: cell * (i < 2 ? 1.7 + this.random() * 1.1 : 0.6 + this.random() * 2.2),
                bounces: 0,
                age: 0,
                life: 0.9 + this.random() * 0.5,
                cell,
                size: cell * (i < 2 ? 0.085 + this.random() * 0.045 : 0.012 + this.random() ** 2 * 0.035),
                spin: (this.random() - 0.5) * 19,
                angle: this.random() * Math.PI * 2,
                fadeRemaining: Infinity,
                shedAt: 0.08 + this.random() * 0.06,
            });
            c.node.visible = c.shadow.visible = true;
            c.node.rotation = 0;
            c.node.scale.set(c.size);
        }
    }
    public update(dt: number): void {
        if (!(dt > 0) || !Number.isFinite(dt)) return;
        for (const c of this.clods) {
            c.fadeRemaining -= dt;
            if (c.fadeRemaining <= 1e-9) c.age = c.life;
        }
        // Fixed simulation steps make bounces independent of the render frame rate.
        this.accumulator += Math.min(dt, 2);
        while (this.accumulator >= 1 / 120) {
            this.accumulator -= 1 / 120;
            for (const c of this.clods) {
                if (c.age >= c.life) continue;
                c.age += 1 / 120;
                const impactSpeed = Math.max(0, -c.vz);
                const bounced = stepChargeEarth(c, 1 / 120, c.cell);
                if (c.fadeRemaining === Infinity && c.size > c.cell * 0.055) {
                    if (bounced && c.bounces === 1) {
                        // Two low jets follow the contact plane, scaled by impact speed.
                        const kick = Math.min(c.cell, impactSpeed * 0.3);
                        this.puff(c.x, c.y, c.cell, -kick + c.vx * 0.2, c.vy * 0.2, true);
                        this.puff(c.x, c.y, c.cell, kick + c.vx * 0.2, c.vy * 0.2, true);
                    } else if (c.z > c.cell * 0.07 && c.age >= c.shedAt && c.age < 0.32) {
                        // A short falling dust veil peels off large, airborne clods.
                        this.puff(c.x, c.y + c.z, c.cell * 0.32, -c.vx * 0.12, -c.cell * 0.6, true);
                        c.shedAt += 0.12;
                    }
                }
                c.angle += (c.spin / 120) * (c.z > 0 ? 1 : 0.1);
            }
        }
        for (const c of this.clods) {
            c.node.visible = c.shadow.visible = c.age < c.life;
            if (!c.node.visible) continue;
            const angles = c.shader.resources.earth.uniforms.uAngles;
            angles[0] = c.angle;
            angles[1] = c.angle * 0.73;
            angles[2] = c.angle * 0.41;
            c.node.position.set(c.x, c.y + c.z);
            c.node.zIndex = 4000 - c.y + 1;
            c.node.alpha = Math.min(1, (c.life - c.age) / 0.22) * this.fade(c.fadeRemaining);
            c.shadow.position.set(c.x, c.y);
            c.shadow.zIndex = 4000 - c.y - 4;
            c.shadow.scale.set(c.size * (1 + c.z / c.cell));
            c.shadow.alpha = c.node.alpha / (1 + (c.z / c.cell) * 8);
        }
        for (const p of this.puffs) {
            p.fadeRemaining -= dt;
            if (p.fadeRemaining <= 1e-9) p.age = p.life;
            p.node.alpha = this.fade(p.fadeRemaining);
            if (p.age >= p.life) {
                p.node.visible = false;
                continue;
            }
            p.age = Math.min(p.life, p.age + dt);
            const t = p.age / p.life;
            const drift = (1 - Math.exp(-p.age * 4)) / 4;
            p.node.position.set(
                p.x + p.dx * drift,
                p.y + p.dy * drift + p.radius * p.aspect * (0.22 + 1.15 * Math.sqrt(t)),
            );
            const size = p.radius * (0.28 + Math.sqrt(t) * 1.15);
            p.node.scale.set(size, size * p.aspect);
            p.shader.resources.dust.uniforms.uAge = t;
        }
    }
    public destroy(): void {
        for (const p of this.puffs) {
            p.shader.destroy();
            p.node.destroy();
        }
        for (const c of this.clods) {
            c.shader.destroy();
            c.node.destroy();
            c.shadow.destroy();
        }
        this.geometry.destroy();
        for (const geometry of this.earthGeometry) geometry.destroy();
        this.noise.destroy();
        this.puffs.length = this.clods.length = 0;
    }
}
