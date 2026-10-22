import type { GridSettings, HoCMath, UnitProperties } from "@heroesofcrypto/common";
import { Container, Graphics, Matrix, MeshSimple, Sprite, Texture } from "pixi.js";

import { projectBattlefieldPoint } from "./BattlefieldVisualGrid";

const NAME = "Ember Covenant Blessing";
const TAU = Math.PI * 2;
const BREAK_SECONDS = 0.55;
const FRAGMENTS = 10;
const ARC_STEPS = 6;

export interface EmberCovenantUnit {
    getUnitProperties(): Pick<UnitProperties, "applied_buffs" | "applied_buffs_laps">;
    getPosition(): HoCMath.XY;
    getFootprintWidth(): number;
    getFootprintHeight(): number;
    getBlessingHaloAnchor?(settings: GridSettings): HoCMath.XY;
    isDead(): boolean;
}

interface Ring {
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
    getUnits(): ReadonlyMap<string, EmberCovenantUnit> | undefined;
    getGridSettings(): GridSettings | undefined;
    getTexture(): Texture | undefined;
    getBoardScale?(): { x: number; y: number } | undefined;
    attachToWorldRoot(container: Container, zIndex: number): void;
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
    private elapsed = 0;
    public constructor(private readonly context: RingContext) {}
    public get active(): boolean {
        return this.rings.size > 0;
    }
    public update(dt: number): void {
        const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
        this.elapsed = (this.elapsed + step) % 120;
        const units = this.context.getUnits();
        const gs = this.context.getGridSettings();
        if (!units || !gs) {
            this.clear();
            return;
        }
        for (const [id, unit] of units) {
            if (unit.isDead() || !carriesCovenant(unit)) continue;
            let ring = this.rings.get(id);
            if (!ring) {
                ring = this.create(id);
                this.rings.set(id, ring);
            }
            ring.breakAge = undefined;
            const position = unit.getPosition();
            const cell = gs.getStep();
            if (![position.x, position.y, cell].every(Number.isFinite) || cell <= 0) continue;
            const center = projectBattlefieldPoint(position, gs);
            const top = unit.getBlessingHaloAnchor?.(gs) ?? {
                x: center.x,
                y: center.y + cell * (0.9 + unit.getFootprintHeight() * 0.3),
            };
            if (![top.x, top.y].every(Number.isFinite)) continue;
            const diameter = cell * (1.35 + (unit.getFootprintWidth() - 1) * 0.4);
            const scale = this.context.getBoardScale?.();
            const cameraRatio =
                scale && [scale.x, scale.y].every(Number.isFinite) && scale.x > 0 && scale.y > 0
                    ? scale.x / scale.y
                    : 1;
            const bob = Math.sin(this.elapsed * 2 + ring.phase) * cell * 0.012;
            ring.node.setFromMatrix(
                new Matrix(
                    diameter,
                    0,
                    0,
                    diameter * 0.34 * cameraRatio,
                    top.x,
                    top.y + cell * 0.04 * cameraRatio + bob,
                ),
            );
        }
        let texture: Texture | undefined;
        if (this.rings.size) texture = this.context.getTexture();
        for (const [id, ring] of this.rings) {
            const unit = units.get(id);
            if (!unit || !carriesCovenant(unit) || unit.isDead()) ring.breakAge ??= 0;
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
    }
    private create(id: string): Ring {
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
        const ring = { node, plane, flame, echo, sparks, phase: phaseFor(id), age: 0 };
        node.once("destroyed", () => {
            if (this.rings.get(id)?.node === node) this.rings.delete(id);
        });
        this.context.attachToWorldRoot(node, 5503);
        return ring;
    }
    private paint(ring: Ring, texture: Texture | undefined): void {
        const pulse = Math.sin(this.elapsed * 4 + ring.phase);
        const broken = ring.breakAge === undefined ? 0 : ring.breakAge / BREAK_SECONDS;
        const appear = Math.min(1, ring.age / 0.3);
        ring.plane.scale.set((1 + pulse * 0.012) * (1 - broken * 0.25));
        ring.plane.alpha = appear * (1 - broken) ** 0.7;
        ring.flame.rotation = this.elapsed * 0.22 + ring.phase;
        ring.echo.rotation = -this.elapsed * 0.13 - ring.phase;
        ring.echo.alpha = 0.16 + pulse * 0.035 + broken * 0.4;
        ring.flame.alpha = 0.83 + pulse * 0.07;
        for (const sprite of [ring.flame, ring.echo]) {
            sprite.visible = !!texture && broken === 0;
            if (texture && sprite.texture !== texture) sprite.texture = texture;
            sprite.width = 1;
            sprite.height = 1;
        }
        if (ring.fragments) ring.fragments.visible = broken > 0;
        if (broken > 0 && texture) this.paintFragments(ring, texture, broken);
        const sparks = ring.sparks;
        sparks.clear();
        if (!texture) {
            sparks.circle(0, 0, 0.37).stroke({ width: 0.012, color: 0xffb22f, alpha: 0.75 });
            sparks.circle(0, 0, 0.39).stroke({ width: 0.03, color: 0xff641a, alpha: 0.12 });
        }
        for (let i = 0; i < 10; i++) {
            const t = (this.elapsed * 0.38 + i * 0.618 + ring.phase) % 1;
            const angle = ring.phase + (i * TAU) / 10 + this.elapsed * 0.3;
            const radius = 0.37 + t * 0.045 + broken * 0.16;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius + t * 0.04 + broken * 0.12;
            const alpha = (1 - t) * (broken ? 1 : 0.6);
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
            const drift = broken * (0.12 + (fragment % 3) * 0.025);
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
    public clear(): void {
        for (const ring of this.rings.values()) ring.node.destroy({ children: true });
        this.rings.clear();
    }
}
