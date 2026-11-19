import { Container, Graphics } from "pixi.js";

export interface ParalysisStatusUnit {
    isDead(): boolean;
    hasPresentedStatus?(name: string): boolean;
    getUnitProperties?(): { applied_debuffs?: readonly string[]; applied_effects?: readonly string[] } | undefined;
}

export interface ParalysisStatusFrame {
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
}

interface Context {
    getUnits(): ReadonlyMap<string, ParalysisStatusUnit> | undefined;
    getFrame(unit: ParalysisStatusUnit): ParalysisStatusFrame | undefined;
    isImpactPending?(): boolean;
    attach(container: Container, zIndex: number): void;
}

interface Field {
    node: Graphics;
    phase: number;
    frame: number;
    width: number;
    height: number;
}

const TAU = Math.PI * 2;

/** Deterministic 0..1 noise, so a crackle keeps its shape for its whole strike instead of shimmering. */
function hash(seed: number): number {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

export class ParalysisStatusVfx {
    private readonly fields = new Map<string, Field>();
    private readonly presented = new Set<string>();
    private elapsed = 0;
    public constructor(private readonly context: Context) {}
    public present(id: string): void {
        this.presented.add(id);
    }
    public update(dt: number): void {
        this.elapsed = (this.elapsed + (Number.isFinite(dt) && dt > 0 ? dt : 0)) % 120;
        const units = this.context.getUnits();
        if (!units) {
            this.clear();
            return;
        }
        const pending = this.context.isImpactPending?.() ?? false;
        for (const [id, unit] of units) {
            const properties = unit.getUnitProperties?.();
            const afflicted = unit.hasPresentedStatus
                ? unit.hasPresentedStatus("Paralysis")
                : !!(
                      properties?.applied_debuffs?.includes("Paralysis") ||
                      properties?.applied_effects?.includes("Paralysis")
                  );
            let field = this.fields.get(id);
            const defer = pending && !unit.hasPresentedStatus;
            if (unit.isDead() || (!afflicted && (!defer || this.presented.has(id)))) {
                field?.node.destroy();
                this.fields.delete(id);
                continue;
            }
            if (!afflicted && !field) continue;
            if (!field && defer && !this.presented.has(id)) continue;
            const frame = this.context.getFrame(unit);
            if (!frame || !Object.values(frame).every(Number.isFinite) || frame.width <= 0 || frame.height <= 0) {
                if (field) field.node.visible = false;
                continue;
            }
            if (!field) {
                const node = new Graphics();
                node.label = "paralysis-status-field";
                node.eventMode = "none";
                node.blendMode = "add";
                field = { node, phase: this.fields.size * 1.618, frame: -1, width: 0, height: 0 };
                this.fields.set(id, field);
                node.once("destroyed", () => {
                    if (this.fields.get(id)?.node === node) this.fields.delete(id);
                });
                this.context.attach(node, frame.zIndex);
            }
            field.node.visible = true;
            field.node.position.set(frame.x, frame.y);
            field.node.zIndex = frame.zIndex;
            const tick = Math.floor(this.elapsed * 30);
            if (field.frame !== tick || field.width !== frame.width || field.height !== frame.height) {
                field.frame = tick;
                field.width = frame.width;
                field.height = frame.height;
                this.paint(field, frame.width, frame.height);
            }
        }
        for (const [id, field] of this.fields) {
            if (!units.has(id)) field.node.destroy();
        }
        this.presented.clear();
    }
    /**
     * A floor field beneath the paralysed unit's feet, drawn in world pixels (never a stretched unit square,
     * which distorted every stroke): a soft electric pool, a clean glowing rim with currents running around
     * it, short crackles hugging the rim and a few motes drifting up. y-up world: negative y is toward the floor.
     */
    private paint(field: Field, width: number, height: number): void {
        const g = field.node;
        const t = this.elapsed + field.phase;
        const rx = width * 0.5;
        const ry = rx * 0.3;
        const cy = -height * 0.36;
        const pulse = 0.78 + Math.sin(t * 3.2) * 0.14;
        const at = (angle: number, scale = 1): [number, number] => [
            Math.cos(angle) * rx * scale,
            cy + Math.sin(angle) * ry * scale,
        ];
        g.clear();

        // 1. Soft pool: a faint floor tint, with glow bleeding inward from the rim and fading toward the centre.
        g.ellipse(0, cy, rx, ry).fill({ color: 0x0f3fb0, alpha: 0.1 * pulse });
        for (let i = 0; i < 5; i++) {
            const k = 0.96 - i * 0.08;
            g.ellipse(0, cy, rx * k, ry * k).stroke({
                width: Math.max(2, rx * 0.08),
                color: 0x1f6bff,
                alpha: (0.14 - i * 0.025) * pulse,
            });
        }

        // 2. Rim: a wide soft halo under a crisp bright line.
        g.ellipse(0, cy, rx, ry).stroke({ width: Math.max(4, rx * 0.16), color: 0x1f6bff, alpha: 0.3 * pulse });
        g.ellipse(0, cy, rx, ry).stroke({ width: Math.max(1.5, rx * 0.03), color: 0x5cc8ff, alpha: 0.75 * pulse });
        g.ellipse(0, cy, rx * 0.72, ry * 0.72).stroke({ width: 1, color: 0x3fa4ff, alpha: 0.3 * pulse });

        // 3. Currents: three bright comets chase each other around the rim, tails fading behind them.
        const SEGMENTS = 14;
        for (let c = 0; c < 3; c++) {
            const head = t * 2.1 + (c * TAU) / 3;
            for (let s = 0; s < SEGMENTS; s++) {
                const a0 = head - (s + 1) * 0.07;
                const a1 = head - s * 0.07;
                const fade = 1 - s / SEGMENTS;
                const [x0, y0] = at(a0);
                const [x1, y1] = at(a1);
                g.moveTo(x0, y0).lineTo(x1, y1);
                g.stroke({
                    width: Math.max(2, rx * 0.05) * fade,
                    color: fade > 0.8 ? 0xf2fdff : 0x7fdcff,
                    alpha: 0.9 * fade * pulse,
                });
            }
        }

        // 4. Crackles: short forked arcs that follow the rim and re-strike several times a second.
        const strike = Math.floor(t * 9);
        for (let b = 0; b < 3; b++) {
            const seed = strike * 7.31 + b * 13.7 + field.phase * 3.1;
            const life = (t * 9) % 1;
            const start = hash(seed) * TAU;
            const span = 0.45 + hash(seed + 1) * 0.4;
            const points: [number, number][] = [];
            for (let i = 0; i <= 7; i++) {
                const a = start + (span * i) / 7;
                const lift = i === 0 || i === 7 ? 1 : 1 + (hash(seed + i * 2.7) - 0.5) * 0.5;
                points.push(at(a, lift));
            }
            const alpha = (1 - life) * 0.95;
            for (const [w, color, a] of [
                [Math.max(4, rx * 0.09), 0x2f7bff, alpha * 0.45],
                [Math.max(1.4, rx * 0.025), 0xf2fdff, alpha],
            ] as const) {
                g.moveTo(points[0][0], points[0][1]);
                for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
                g.stroke({ width: w, color, alpha: a, join: "round", cap: "round" });
            }
        }

        // 5. Motes: sparks lift off the rim and fade as they rise.
        for (let m = 0; m < 7; m++) {
            const cycle = (t * 0.55 + m / 7) % 1;
            const [x, y] = at(field.phase * 5 + m * 2.39);
            const rise = cycle * height * 0.32;
            g.circle(x * (1 - cycle * 0.15), y + rise, Math.max(1, rx * 0.022) * (1 - cycle * 0.5)).fill({
                color: 0x9fe6ff,
                alpha: (1 - cycle) * 0.85 * pulse,
            });
        }
    }
    public clear(): void {
        for (const field of this.fields.values()) field.node.destroy();
        this.fields.clear();
        this.presented.clear();
    }
}
