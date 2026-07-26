import { Container, Graphics } from "pixi.js";
import { GridSettings, HoCMath } from "@heroesofcrypto/common";

/**
 * Renders flying projectiles for ranged attacks. Each projectile is a single
 * `Graphics` redrawn every frame at its current world position, mirroring the
 * absolute-coordinate drawing approach of `HoverManager.drawAttackArrow` (no
 * Y-flip needed). Damage is applied by the caller when `fire()` resolves, so the
 * stack-count drop / damage number / death skull all land in sync with arrival.
 *
 * Speed convention matches the rest of the scene (e.g. MoveAnimationManager):
 * movement is `speed * dt` per step where `speed = cellSize * factor`. The frame
 * loop hands Step() the legacy 1/240 value at 60Hz, so `dt` accrues ~0.25 per
 * real second — speeds are tuned against that, the same as unit movement.
 */
export interface IRangedProjectilesContext {
    getGridSettings(): GridSettings;
    attachToWorldRoot(obj: Container, zIndex?: number): void;
}

/** Creature names (lower-case) that fire a larger "cannonball" projectile. */
export const BIG_PROJECTILE_UNITS = new Set<string>(["cyclops", "tsar cannon", "gargantuan"]);

export interface IFireProjectileOptions {
    from: HoCMath.XY;
    to: HoCMath.XY;
    big: boolean;
    /** Zena's Chakram: a spinning bladed disc rather than a bolt or a cannonball. */
    chakram?: boolean;
}

interface IProjectile {
    g: Graphics;
    from: HoCMath.XY;
    to: HoCMath.XY;
    angle: number;
    dist: number;
    traveled: number;
    speed: number; // world px per dt-unit (= cellSize * factor)
    big: boolean;
    arc: number; // peak lob height in world px (0 = straight line)
    cell: number; // grid cell size captured at spawn (drives drawing scale)
    chakram: boolean;
    spin: number; // radians of blade rotation accumulated in flight
    resolve: () => void;
}

// --- Tuning ---
const PROJECTILE_Z = 1950; // above the units container (z=1000), below floating numbers (z=2000)
// speed = cellSize * factor. Unit walking uses ~16 (=4 cells/real-sec); projectiles fly ~4x that.
const PROJECTILE_SPEED_FACTOR = 64; // ~16 cells/real-second — snappy
const BIG_RADIUS_FACTOR = 0.32; // cannonball radius relative to cell
const BIG_ARC_FACTOR = 0.4; // cannonball lob height relative to cell
const BOLT_LEN_FACTOR = 0.55; // default bolt length relative to cell
const BOLT_WIDTH_FACTOR = 0.07; // default bolt core width relative to cell
const CHAKRAM_RADIUS_FACTOR = 0.34; // disc radius relative to cell
const CHAKRAM_SPIN_PER_DT = 90; // radians per dt-unit — a hard, weapon-like spin
const CHAKRAM_BLADES = 3; // cut-outs around the ring, echoing the art

export class RangedProjectiles {
    private context: IRangedProjectilesContext;
    private projectiles: IProjectile[] = [];
    public constructor(context: IRangedProjectilesContext) {
        this.context = context;
    }
    public hasActive(): boolean {
        return this.projectiles.length > 0;
    }
    /** Spawn a projectile flying from -> to. Resolves when it lands. */
    /**
     * Fly a projectile along a POLYLINE instead of a straight shot — Zena's chakram ricocheting through its
     * half circle. Each leg is flown in turn, so the disc visibly curves from one victim to the next rather
     * than teleporting; it keeps spinning throughout because spin is accumulated per projectile, not per leg.
     */
    public async fireAlongPath(points: HoCMath.XY[], opts: Omit<IFireProjectileOptions, "from" | "to">): Promise<void> {
        for (let leg = 1; leg < points.length; leg += 1) {
            await this.fire({ ...opts, from: points[leg - 1], to: points[leg] });
        }
    }
    public fire(opts: IFireProjectileOptions): Promise<void> {
        const cell = this.context.getGridSettings().getCellSize();
        const from = { x: opts.from.x, y: opts.from.y };
        const to = { x: opts.to.x, y: opts.to.y };
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        const g = new Graphics();
        this.context.attachToWorldRoot(g, PROJECTILE_Z);

        return new Promise<void>((resolve) => {
            const projectile: IProjectile = {
                g,
                from,
                to,
                angle,
                dist,
                traveled: 0,
                speed: cell * PROJECTILE_SPEED_FACTOR,
                big: opts.big,
                arc: opts.big ? cell * BIG_ARC_FACTOR : 0,
                cell,
                chakram: !!opts.chakram,
                spin: 0,
                resolve,
            };
            this.draw(projectile, from.x, from.y);
            this.projectiles.push(projectile);
        });
    }
    public update(dt: number): void {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.traveled += p.speed * dt;
            // A thrown chakram spins hard the whole way — this is what sells it as a disc rather than a
            // coin flipping edge-on, and it keeps spinning through the ricochet arcs.
            p.spin += CHAKRAM_SPIN_PER_DT * dt;
            const t = p.dist > 1e-3 ? Math.min(1, p.traveled / p.dist) : 1;

            const x = p.from.x + (p.to.x - p.from.x) * t;
            let y = p.from.y + (p.to.y - p.from.y) * t;
            if (p.arc > 0) {
                // Parabolic lob: 0 at both ends, peak at the midpoint.
                y += Math.sin(Math.PI * t) * p.arc;
            }
            this.draw(p, x, y);

            if (t >= 1) {
                p.g.destroy();
                this.projectiles.splice(i, 1);
                p.resolve();
            }
        }
    }
    /** Destroy all in-flight projectiles (e.g. fight reset). Resolves awaiters so callers don't hang. */
    public clear(): void {
        for (const p of this.projectiles) {
            p.g.destroy();
            p.resolve();
        }
        this.projectiles.length = 0;
    }
    public destroy(): void {
        this.clear();
    }
    /** Redraw the projectile at world position (x, y) using absolute coordinates. */
    private draw(p: IProjectile, x: number, y: number): void {
        const g = p.g;
        g.clear();
        if (p.chakram) {
            this.drawChakram(p, x, y);
            return;
        }
        if (p.big) {
            // Clean single cannonball: dark body + thin rim + a small specular glint.
            const r = p.cell * BIG_RADIUS_FACTOR;
            g.circle(x, y, r)
                .fill({ color: 0x2b2b2f, alpha: 1 })
                .stroke({ width: Math.max(1, r * 0.14), color: 0x0a0a0c, alpha: 0.95 });
            g.circle(x - r * 0.34, y + r * 0.34, r * 0.18).fill({ color: 0xc8ccd4, alpha: 0.45 });
        } else {
            const len = p.cell * BOLT_LEN_FACTOR;
            const half = len / 2;
            const w = Math.max(2, p.cell * BOLT_WIDTH_FACTOR);
            const ca = Math.cos(p.angle);
            const sa = Math.sin(p.angle);
            const tailX = x - ca * half;
            const tailY = y - sa * half;
            const tipX = x + ca * half;
            const tipY = y + sa * half;
            const headLen = len * 0.4;
            const headAngle = Math.PI / 6;
            // Glow.
            g.moveTo(tailX, tailY)
                .lineTo(tipX, tipY)
                .stroke({ width: w * 2.4, color: 0xffd27f, alpha: 0.35 });
            // Shaft.
            g.moveTo(tailX, tailY).lineTo(tipX, tipY).stroke({ width: w, color: 0xfff2cc, alpha: 1 });
            // Arrowhead.
            g.moveTo(tipX, tipY)
                .lineTo(tipX - headLen * Math.cos(p.angle - headAngle), tipY - headLen * Math.sin(p.angle - headAngle))
                .moveTo(tipX, tipY)
                .lineTo(tipX - headLen * Math.cos(p.angle + headAngle), tipY - headLen * Math.sin(p.angle + headAngle))
                .stroke({ width: w, color: 0xfff2cc, alpha: 1 });
        }
    }
    /**
     * Zena's chakram: a spinning bronze ring with blade cut-outs, wrapped in the motion blur a disc thrown
     * this hard would actually leave. Drawn rather than sprited so it can spin at any angle without a
     * texture rotation, and so the trail can be redrawn per frame from the live spin.
     */
    private drawChakram(p: IProjectile, x: number, y: number): void {
        const g = p.g;
        const r = p.cell * CHAKRAM_RADIUS_FACTOR;

        // Motion blur: two trailing ghosts behind the disc along its flight line.
        const ca = Math.cos(p.angle);
        const sa = Math.sin(p.angle);
        for (let ghost = 1; ghost <= 2; ghost += 1) {
            const back = r * 0.55 * ghost;
            g.circle(x - ca * back, y - sa * back, r * (1 - ghost * 0.12)).stroke({
                width: Math.max(1, r * 0.16),
                color: 0xffb964,
                alpha: 0.16 / ghost,
            });
        }

        // Outer glow, then the bronze ring itself.
        g.circle(x, y, r * 1.12).stroke({ width: Math.max(1, r * 0.2), color: 0xffcc7a, alpha: 0.3 });
        g.circle(x, y, r).stroke({ width: Math.max(2, r * 0.34), color: 0xb87333, alpha: 1 });
        g.circle(x, y, r * 0.82).stroke({ width: Math.max(1, r * 0.12), color: 0xffe2b0, alpha: 0.85 });

        // Blades: short spokes that rotate with the spin, so the disc visibly turns.
        for (let blade = 0; blade < CHAKRAM_BLADES; blade += 1) {
            const angle = p.spin + (blade * 2 * Math.PI) / CHAKRAM_BLADES;
            const inner = r * 0.3;
            const outer = r * 0.78;
            g.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner)
                .lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer)
                .stroke({ width: Math.max(1, r * 0.16), color: 0xffe9c4, alpha: 0.9 });
        }

        // Hub.
        g.circle(x, y, r * 0.2).fill({ color: 0x6b4423, alpha: 1 });
    }
}
