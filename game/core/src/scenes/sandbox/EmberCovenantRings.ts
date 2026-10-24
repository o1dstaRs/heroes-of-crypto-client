import type { UnitProperties } from "@heroesofcrypto/common";
import { Container, Graphics, MeshSimple, Sprite, Texture } from "pixi.js";

const NAME = "Ember Covenant Blessing";
const TAU = Math.PI * 2;
const BREAK_SECONDS = 0.85;
const IMPACT_SECONDS = 0.65;
const FRAGMENTS = 10;
const ARC_STEPS = 6;
const CIRCLE_SEGMENTS = 64;

// Pixi tessellates a sub-unit circle as a small polygon before the flag-sized scale is applied.
function circlePath(graphics: Graphics, radius: number): Graphics {
    graphics.moveTo(radius, 0);
    for (let i = 1; i < CIRCLE_SEGMENTS; i++) {
        const angle = (i * TAU) / CIRCLE_SEGMENTS;
        graphics.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    return graphics.closePath();
}

export interface EmberCovenantUnit {
    getTeam?(): number;
    getUnitProperties(): Pick<UnitProperties, "applied_buffs" | "applied_buffs_laps">;
    getBlessingHaloFrame?(): { x: number; y: number; width: number; height: number; zIndex: number } | undefined;
    isDead(): boolean;
}

interface Ring {
    team?: number;
    node: Container;
    plane: Container;
    flame: Sprite;
    echo: Sprite;
    sparks: Graphics;
    phase: number;
    age: number;
    breakAge?: number;
    fragments?: MeshSimple;
}

interface RingContext {
    isImpactPending?(): boolean;
    getUnits(): ReadonlyMap<string, EmberCovenantUnit> | undefined;
    getTexture(): Texture | undefined;
    attachToWorldRoot(container: Container, zIndex: number): void;
}

interface AbsorbImpact {
    node: Graphics;
    age: number;
    phase: number;
}

function phaseFor(id: string): number {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    return ((hash >>> 0) / 4294967296) * TAU;
}

function carriesCovenant(unit: EmberCovenantUnit): boolean {
    const properties = unit.getUnitProperties?.();
    return !!properties?.applied_buffs.some((name, index) => name === NAME && properties.applied_buffs_laps[index] > 0);
}

export class EmberCovenantRings {
    private readonly rings = new Map<string, Ring>();
    private readonly impacts = new Map<string, AbsorbImpact>();
    private elapsed = 0;
    public constructor(private readonly context: RingContext) {}
    public get active(): boolean {
        return this.rings.size > 0 || this.impacts.size > 0;
    }
    /** An authoritative absorb, independent of the shared blessing's disappearance. */
    public absorb(id: string): void {
        const units = this.context.getUnits();
        const unit = units?.get(id);
        const recipientRing = this.rings.get(id);
        const team = unit?.getTeam?.() ?? recipientRing?.team;
        if ((unit && !carriesCovenant(unit)) || (!unit && recipientRing)) {
            for (const [ringId, ring] of this.rings) {
                const ally = units?.get(ringId);
                if ((ally?.getTeam?.() ?? ring.team) === team && (!ally || !carriesCovenant(ally))) {
                    ring.breakAge ??= 0;
                    this.paint(ring, this.context.getTexture());
                }
            }
        }
        const frame =
            unit?.getBlessingHaloFrame?.() ??
            (recipientRing
                ? {
                      x: recipientRing.node.x,
                      y: recipientRing.node.y,
                      width: recipientRing.node.scale.x / 2.15,
                      height: recipientRing.node.scale.y / 2.75,
                      zIndex: recipientRing.node.zIndex + 0.1,
                  }
                : undefined);
        if (
            !frame ||
            (unit?.isDead() && !recipientRing) ||
            ![frame.x, frame.y, frame.width, frame.height, frame.zIndex].every(Number.isFinite) ||
            frame.width <= 0 ||
            frame.height <= 0
        )
            return;
        this.impacts.get(id)?.node.destroy();
        const node = new Graphics();
        node.label = "ember-covenant-absorb";
        node.eventMode = "none";
        node.blendMode = "add";
        node.position.set(frame.x, frame.y);
        node.scale.set(frame.width * 2.15, frame.height * 2.75);
        const impact = { node, age: 0, phase: phaseFor(id) };
        this.impacts.set(id, impact);
        node.once("destroyed", () => {
            if (this.impacts.get(id) === impact) this.impacts.delete(id);
        });
        this.context.attachToWorldRoot(node, frame.zIndex - 0.05);
        this.paintImpact(impact);
    }
    public update(dt: number): void {
        const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
        this.elapsed = (this.elapsed + step) % 120;
        const units = this.context.getUnits();
        if (!units) {
            this.clear();
            return;
        }
        for (const [id, unit] of units) {
            if (unit.isDead()) continue;
            let ring = this.rings.get(id);
            const protectedUnit = carriesCovenant(unit);
            if (!protectedUnit && !ring) continue;
            const frame = unit.getBlessingHaloFrame?.();
            if (
                !frame ||
                ![frame.x, frame.y, frame.width, frame.height, frame.zIndex].every(Number.isFinite) ||
                frame.width <= 0 ||
                frame.height <= 0
            ) {
                if (ring) ring.node.visible = false;
                continue;
            }
            if (!ring) {
                ring = this.create(id, frame.zIndex - 0.1, unit.getTeam?.());
                this.rings.set(id, ring);
            }
            if (protectedUnit) ring.breakAge = undefined;
            ring.node.visible = true;
            ring.node.position.set(frame.x, frame.y);
            ring.node.scale.set(frame.width * 2.15, frame.height * 2.75);
            ring.node.zIndex = frame.zIndex - 0.1;
        }
        let texture: Texture | undefined;
        if (this.rings.size) texture = this.context.getTexture();
        for (const [id, ring] of this.rings) {
            const unit = units.get(id);
            if ((!unit || !carriesCovenant(unit) || unit.isDead()) && !this.context.isImpactPending?.())
                ring.breakAge ??= 0;
            if (ring.breakAge !== undefined) {
                ring.breakAge += step;
                if (ring.breakAge >= BREAK_SECONDS) {
                    ring.node.destroy({ children: true });
                    continue;
                }
            }
            ring.age += step;
            this.paint(ring, texture);
        }
        for (const [id, impact] of this.impacts) {
            impact.age += step;
            if (
                impact.age >= IMPACT_SECONDS ||
                ((!units.has(id) || units.get(id)?.isDead()) && !this.context.isImpactPending?.())
            ) {
                impact.node.destroy();
                continue;
            }
            const frame = units.get(id)?.getBlessingHaloFrame?.();
            impact.node.visible = !!frame;
            if (frame) {
                impact.node.position.set(frame.x, frame.y);
                impact.node.scale.set(frame.width * 2.15, frame.height * 2.75);
                impact.node.zIndex = frame.zIndex - 0.05;
            }
            this.paintImpact(impact);
        }
    }
    private create(id: string, zIndex: number, team?: number): Ring {
        const node = new Container();
        node.label = "ember-covenant-ring";
        node.eventMode = "none";
        const plane = new Container();
        const flame = new Sprite(Texture.EMPTY);
        const echo = new Sprite(Texture.EMPTY);
        for (const sprite of [flame, echo]) sprite.anchor.set(0.5);
        echo.blendMode = "add";
        const sparks = new Graphics();
        sparks.blendMode = "add";
        plane.addChild(echo, flame, sparks);
        node.addChild(plane);
        const ring = { node, plane, flame, echo, sparks, phase: phaseFor(id), age: 0, team };
        node.once("destroyed", () => {
            if (this.rings.get(id)?.node === node) this.rings.delete(id);
        });
        this.context.attachToWorldRoot(node, zIndex);
        return ring;
    }
    private paint(ring: Ring, texture: Texture | undefined): void {
        const pulse = Math.sin(this.elapsed * 4 + ring.phase);
        const breaking = ring.breakAge !== undefined;
        const broken = (ring.breakAge ?? 0) / BREAK_SECONDS;
        const appear = Math.min(1, ring.age / 0.3);
        const burst = 1 - (1 - broken) ** 3;
        const flash = Math.max(0, 1 - broken / 0.3);
        ring.plane.scale.set((1 + pulse * 0.012) * (1 + burst * 0.18));
        ring.plane.alpha = appear * (1 - broken) ** 0.7;
        ring.flame.rotation = this.elapsed * 0.22 + ring.phase;
        ring.echo.rotation = -this.elapsed * 0.13 - ring.phase;
        ring.echo.alpha = 0.16 + pulse * 0.035 + (breaking ? flash * 0.85 : 0);
        ring.flame.alpha = 0.83 + pulse * 0.07;
        for (const sprite of [ring.flame, ring.echo]) {
            sprite.visible = !!texture && (!breaking || (sprite === ring.echo && broken < 0.3));
            if (texture && sprite.texture !== texture) sprite.texture = texture;
            sprite.width = 1;
            sprite.height = 1;
        }
        ring.echo.scale.set(ring.echo.scale.x * (1 + burst * 0.22), ring.echo.scale.y * (1 + burst * 0.22));
        if (ring.fragments) ring.fragments.visible = breaking;
        if (breaking && texture) this.paintFragments(ring, texture, broken);
        const sparks = ring.sparks;
        sparks.clear();
        if (!texture) {
            circlePath(sparks, 0.37).stroke({ width: 0.012, color: 0xffb22f, alpha: 0.75 });
            circlePath(sparks, 0.39).stroke({ width: 0.03, color: 0xff641a, alpha: 0.12 });
        }
        if (breaking) {
            const radius = 0.36 + burst * 0.36;
            circlePath(sparks, radius).stroke({ width: 0.045 * (1 - broken), color: 0xff681b, alpha: 0.5 });
            circlePath(sparks, radius).stroke({ width: 0.009, color: 0xffe8a2, alpha: (1 - broken) * 0.9 });
            for (let i = 0; i < 26; i++) {
                const angle = ring.phase + (i * TAU) / 26;
                const travel = burst * (0.22 + (i % 4) * 0.055);
                const x = Math.cos(angle) * (0.34 + travel);
                const y = Math.sin(angle) * (0.34 + travel) + broken * broken * 0.2;
                const tail = 0.025 + (1 - broken) * 0.07;
                sparks
                    .moveTo(x - Math.cos(angle) * tail, y - Math.sin(angle) * tail)
                    .lineTo(x, y)
                    .stroke({ width: 0.006, color: i % 3 ? 0xffac37 : 0xfff2ce, alpha: (1 - broken) ** 1.3 });
                sparks.circle(x, y, 0.015).fill({ color: 0xff6d13, alpha: (1 - broken) * 0.18 });
            }
        }
        for (let i = 0; i < 10; i++) {
            const t = (this.elapsed * 0.38 + i * 0.618 + ring.phase) % 1;
            const angle = ring.phase + (i * TAU) / 10 + this.elapsed * 0.3;
            const radius = 0.37 + t * 0.045 + broken * 0.16;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius + t * 0.04 + broken * 0.12;
            const alpha = (1 - t) * (breaking ? 1 : 0.6);
            sparks.circle(x, y, 0.012).fill({ color: 0xff8c1c, alpha: alpha * 0.22 });
            sparks.circle(x, y, 0.0035).fill({ color: 0xffefae, alpha });
        }
    }
    private paintFragments(ring: Ring, texture: Texture, broken: number): void {
        if (!ring.fragments) {
            const count = FRAGMENTS * (ARC_STEPS + 1) * 2;
            const vertices = new Float32Array(count * 2);
            const uvs = new Float32Array(count * 2);
            const indices: number[] = [];
            for (let fragment = 0; fragment < FRAGMENTS; fragment++) {
                const start = fragment * (ARC_STEPS + 1) * 2;
                for (let step = 0; step <= ARC_STEPS; step++) {
                    const angle = ((fragment + step / ARC_STEPS) * TAU) / FRAGMENTS;
                    for (let side = 0; side < 2; side++) {
                        const index = (start + step * 2 + side) * 2;
                        const radius = side ? 0.54 : 0.2;
                        uvs[index] = 0.5 + Math.cos(angle) * radius;
                        uvs[index + 1] = 0.5 + Math.sin(angle) * radius;
                    }
                    if (step < ARC_STEPS) {
                        const i = start + step * 2;
                        indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
                    }
                }
            }
            const mesh = new MeshSimple({ texture, vertices, uvs, indices: new Uint32Array(indices) });
            mesh.label = "ember-covenant-dissolve";
            mesh.blendMode = "add";
            mesh.once("destroyed", () => mesh.geometry.destroy());
            ring.plane.addChildAt(mesh, 2);
            ring.fragments = mesh;
        }
        const vertices = ring.fragments.vertices;
        const uvs = ring.fragments.geometry.uvs;
        for (let fragment = 0; fragment < FRAGMENTS; fragment++) {
            const start = fragment * (ARC_STEPS + 1) * 2;
            const rotation = ring.flame.rotation + Math.sin(fragment * 2.1) * broken * 0.25;
            const angle = ((fragment + 0.5) * TAU) / FRAGMENTS + rotation;
            const drift = (1 - (1 - broken) ** 3) * (0.22 + (fragment % 3) * 0.045);
            for (let step = 0; step <= ARC_STEPS; step++) {
                for (let side = 0; side < 2; side++) {
                    const index = (start + step * 2 + side) * 2;
                    const x = (uvs[index] - 0.5) * (1 - broken * 0.25);
                    const y = (uvs[index + 1] - 0.5) * (1 - broken * 0.25);
                    vertices[index] = x * Math.cos(rotation) - y * Math.sin(rotation) + Math.cos(angle) * drift;
                    vertices[index + 1] =
                        x * Math.sin(rotation) + y * Math.cos(rotation) + Math.sin(angle) * drift + broken * 0.2;
                }
            }
        }
        ring.fragments.alpha = (1 - broken) * (1.3 + Math.sin(broken * Math.PI) * 0.4);
    }
    private paintImpact(impact: AbsorbImpact): void {
        const t = Math.min(1, impact.age / IMPACT_SECONDS);
        const burst = 1 - (1 - t) ** 3;
        const flash = Math.max(0, 1 - t / 0.28);
        const g = impact.node;
        g.clear();
        g.alpha = (1 - t) ** 0.65;
        // A hot white core at contact, then a gold pressure ring and outward ember streaks.
        circlePath(g, 0.27 + burst * 0.13).fill({ color: 0xff8a20, alpha: flash * 0.32 });
        circlePath(g, 0.18 + burst * 0.08).fill({ color: 0xfff1bf, alpha: flash * 0.65 });
        const radius = 0.28 + burst * 0.65;
        circlePath(g, radius).stroke({ width: 0.06 * (1 - t), color: 0xff7a1d, alpha: 0.35 });
        circlePath(g, radius).stroke({ width: 0.012 * (1 - t), color: 0xffe9ab, alpha: 0.9 });
        for (let i = 0; i < 20; i++) {
            const angle = impact.phase + (i * TAU) / 20;
            const reach = 0.3 + burst * (0.55 + (i % 3) * 0.1);
            const x = Math.cos(angle) * reach;
            const y = Math.sin(angle) * reach + t * t * 0.15;
            const tail = (1 - t) * 0.16;
            g.moveTo(x - Math.cos(angle) * tail, y - Math.sin(angle) * tail)
                .lineTo(x, y)
                .stroke({ width: 0.008 * (1 - t), color: i % 3 ? 0xffbd55 : 0xfff5da, alpha: 0.95 });
        }
    }
    public clear(): void {
        for (const ring of this.rings.values()) ring.node.destroy({ children: true });
        this.rings.clear();
        for (const impact of this.impacts.values()) impact.node.destroy();
        this.impacts.clear();
    }
}
