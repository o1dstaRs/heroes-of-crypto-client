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
}

const TAU = Math.PI * 2;

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
                field = { node, phase: this.fields.size * 1.618, frame: -1 };
                this.fields.set(id, field);
                node.once("destroyed", () => {
                    if (this.fields.get(id)?.node === node) this.fields.delete(id);
                });
                this.context.attach(node, frame.zIndex);
            }
            field.node.visible = true;
            field.node.position.set(frame.x, frame.y);
            field.node.scale.set(frame.width, frame.height);
            field.node.zIndex = frame.zIndex;
            const tick = Math.floor(this.elapsed * 12);
            if (field.frame !== tick) {
                field.frame = tick;
                this.paint(field);
            }
        }
        for (const [id, field] of this.fields) {
            if (!units.has(id)) field.node.destroy();
        }
        this.presented.clear();
    }
    private paint(field: Field): void {
        const g = field.node;
        const pulse = 0.65 + Math.sin(this.elapsed * 3 + field.phase) * 0.16;
        g.clear();
        g.ellipse(0, -0.35, 0.51, 0.12).stroke({ width: 0.035, color: 0x207bdd, alpha: 0.26 });
        g.ellipse(0, -0.35, 0.5, 0.12).stroke({ width: 0.008, color: 0x9beaff, alpha: pulse });
        for (let arc = 0; arc < 4; arc++) {
            const side = arc % 2 ? -1 : 1;
            const high = arc < 2;
            const x = side * (high ? 0.23 : 0.42);
            const y = high ? 0.2 : -0.12;
            for (let layer = 0; layer < 2; layer++) {
                g.moveTo(x, y - 0.21);
                for (let part = 1; part <= 6; part++) {
                    const jitter = Math.sin(field.frame * 1.9 + arc * 2.4 + part * 4.1) * 0.045;
                    g.lineTo(x + jitter, y - 0.21 + part * 0.07);
                }
                g.stroke({
                    width: layer ? 0.009 : 0.04,
                    color: layer ? 0xc4f5ff : 0x318bff,
                    alpha: layer ? pulse : 0.19,
                });
            }
        }
        for (let i = 0; i < 5; i++) {
            const angle = this.elapsed * 0.8 + field.phase + (i * TAU) / 5;
            const x = Math.cos(angle) * 0.48;
            const y = Math.sin(angle) * 0.11 - 0.35;
            g.circle(x, y, 0.014).fill({ color: 0xcaf8ff, alpha: pulse });
        }
    }
    public clear(): void {
        for (const field of this.fields.values()) field.node.destroy();
        this.fields.clear();
        this.presented.clear();
    }
}
