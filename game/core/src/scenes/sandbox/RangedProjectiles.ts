import { Container, Graphics, Sprite, Texture } from "pixi.js";
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
    /** Remove the stationary aiming preview as soon as a shot starts moving. */
    onProjectileFired?: () => void;
    /**
     * Optional texture lookup. Vector projectiles are fine for geometric shapes (a bolt, a cannonball, the
     * chakram's ring), but an organic one — Trent's thorn-clawed vine — cannot be faithfully drawn with
     * strokes at one cell across. When `vine_dart_256` exists it is used as a sprite instead, and the art
     * carries the detail; otherwise the vector fallback below is drawn.
     */
    texAny?: (name: string) => Texture | undefined;
}

/** Creature names (lower-case) that fire a larger "cannonball" projectile. */
export const BIG_PROJECTILE_UNITS = new Set<string>(["cyclops", "tsar cannon", "gargantuan"]);

export interface IFireProjectileOptions {
    from: HoCMath.XY;
    to: HoCMath.XY;
    big: boolean;
    /** Zena's Chakram: a spinning bladed disc rather than a bolt or a cannonball. */
    chakram?: boolean;
    /** Trent's Vine Throw: a braided, thorn-clawed length of living wood. */
    vine?: boolean;
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
    vine: boolean;
    /** Set when the vine dart is drawn from art rather than from strokes. */
    sprite?: Sprite;
    spin: number; // radians of blade rotation accumulated in flight
    resolve: () => void;
}

// --- Tuning ---
const PROJECTILE_Z = 1950; // above the units container (z=1000), below floating numbers (z=2000)
// speed = cellSize * factor. Unit walking uses ~16 (=4 cells/real-sec); projectiles fly ~4x that.
const PROJECTILE_SPEED_FACTOR = 64; // ~16 cells/real-second — snappy
// The chakram flies slower than a bolt on purpose: its whole show is the ricochet path, and at bolt
// speed the eye can't follow which victim it curls to next. Slow enough to track, fast enough to cut.
const CHAKRAM_SPEED_FACTOR = 42; // ~10.5 cells/real-second
const BIG_RADIUS_FACTOR = 0.32; // cannonball radius relative to cell
const BIG_ARC_FACTOR = 0.4; // cannonball lob height relative to cell
const BOLT_LEN_FACTOR = 0.55; // default bolt length relative to cell
const BOLT_WIDTH_FACTOR = 0.07; // default bolt core width relative to cell
const CHAKRAM_RADIUS_FACTOR = 0.34; // disc radius relative to cell
const CHAKRAM_SPIN_PER_DT = 90; // radians per dt-unit — a hard, weapon-like spin
const CHAKRAM_BLADES = 3; // cut-outs around the ring, echoing the art
// Vine dart: long, thin and fast, so it reads as a whip of wood rather than a log being lobbed.
const VINE_LEN_FACTOR = 1.15; // length relative to cell — deliberately longer than a bolt
const VINE_WIDTH_FACTOR = 0.15; // braid thickness relative to cell
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for the braid pass still being written
const VINE_STRANDS = 3; // interwoven strands; one stroke reads as a stick, three read as cordage
const VINE_WRITHE_PER_DT = 26; // how fast the braid squirms in flight
/** Charred bark, bone-pale claw edges and the red heat inside — Trent's own palette. */
const VINE_BARK_DARK = 0x140d07;
const VINE_BARK_MID = 0x4a3520;
const VINE_BARK_LIGHT = 0x8a7350;
const VINE_CLAW = 0xd8cdb6;
const VINE_EMBER = 0xff3a18;
const VINE_EMBER_DEEP = 0x9c1608;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for the braid pass still being written
const VINE_MOSS = 0x5c7a2e;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for the braid pass still being written
const VINE_CAP = 0x5e2038;

export class RangedProjectiles {
    private context: IRangedProjectilesContext;
    private projectiles: IProjectile[] = [];
    private armorPiercingBoltTexture?: Texture;
    public constructor(context: IRangedProjectilesContext) {
        this.context = context;
        const texture = context.texAny?.("armor_piercing_bolt_512");
        if (texture) {
            texture.source.scaleMode = "linear";
            this.armorPiercingBoltTexture = texture;
        }
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
        this.context.onProjectileFired?.();
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
                speed: cell * (opts.chakram ? CHAKRAM_SPEED_FACTOR : PROJECTILE_SPEED_FACTOR),
                big: opts.big,
                arc: opts.big ? cell * BIG_ARC_FACTOR : 0,
                cell,
                chakram: !!opts.chakram,
                vine: !!opts.vine,
                sprite: opts.vine
                    ? this.makeVineSprite(cell)
                    : !opts.big && !opts.chakram
                      ? this.makeArmorPiercingBoltSprite(cell)
                      : undefined,
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
                p.sprite?.destroy();
                p.g.destroy();
                this.projectiles.splice(i, 1);
                p.resolve();
            }
        }
    }
    /** Destroy all in-flight projectiles (e.g. fight reset). Resolves awaiters so callers don't hang. */
    public clear(): void {
        for (const p of this.projectiles) {
            p.sprite?.destroy();
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
        if (p.vine) {
            this.drawVine(p, x, y);
            return;
        }
        if (p.big) {
            // Clean single cannonball: dark body + thin rim + a small specular glint.
            const r = p.cell * BIG_RADIUS_FACTOR;
            g.circle(x, y, r)
                .fill({ color: 0x2b2b2f, alpha: 1 })
                .stroke({ width: Math.max(1, r * 0.14), color: 0x0a0a0c, alpha: 0.95 });
            g.circle(x - r * 0.34, y + r * 0.34, r * 0.18).fill({ color: 0xc8ccd4, alpha: 0.45 });
        } else if (p.sprite) {
            this.drawArmorPiercingBoltSprite(p, x, y);
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
    private makeArmorPiercingBoltSprite(cell: number): Sprite | undefined {
        if (!this.armorPiercingBoltTexture) return undefined;
        const sprite = new Sprite(this.armorPiercingBoltTexture);
        sprite.anchor.set(0.5);
        const targetLength = cell * 0.82;
        sprite.scale.set(targetLength / Math.max(1, this.armorPiercingBoltTexture.width));
        return sprite;
    }
    private drawArmorPiercingBoltSprite(p: IProjectile, x: number, y: number): void {
        const sprite = p.sprite!;
        if (!sprite.parent) this.context.attachToWorldRoot(sprite, PROJECTILE_Z);
        sprite.position.set(x, y);
        // The source points right. The world root already flips Y for the screen, so using the world-space
        // trajectory angle here keeps the bolt's point aimed at its destination in every quadrant.
        sprite.rotation = p.angle;
        sprite.visible = true;

        // A short ember wake ties the dark sprite into the existing projectile effects without obscuring
        // the new silhouette.
        const ca = Math.cos(p.angle);
        const sa = Math.sin(p.angle);
        const trail = p.cell * 0.34;
        p.g
            .moveTo(x - ca * trail, y - sa * trail)
            .lineTo(x - ca * trail * 1.9, y - sa * trail * 1.9)
            .stroke({ width: Math.max(2, p.cell * 0.045), color: 0xff4a24, alpha: 0.42, cap: "round" });
    }
    /**
     * Zena's chakram: a spinning bronze ring with blade cut-outs, wrapped in the motion blur a disc thrown
     * this hard would actually leave. Drawn rather than sprited so it can spin at any angle without a
     * texture rotation, and so the trail can be redrawn per frame from the live spin.
     */
    /**
     * Trent's Vine Throw: a braided length of living wood thrown like a whip, clawed at the head.
     *
     * Drawn rather than sprited for the same reason as the chakram — it has to squirm and re-aim every
     * frame at any angle. Built from the reference art in four reads, outside in: red speed streaks (this
     * thing is FAST, and the streaks are what says so), a braid of interwoven strands rather than one stick,
     * the heat glowing out from between the strands, and a pair of hooked bone-pale claws at the head. A
     * couple of caps and moss ride along, because the thing tore itself off a living tree.
     */
    /** The dart's art, if it has been supplied. Sized to the cell and pivoted so it points along flight. */
    private makeVineSprite(cell: number): Sprite | undefined {
        const texture = this.context.texAny?.("vine_dart_256");
        if (!texture) {
            return undefined;
        }
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        const target = cell * VINE_LEN_FACTOR;
        sprite.scale.set(target / Math.max(1, texture.width));
        return sprite;
    }
    private drawVine(p: IProjectile, x: number, y: number): void {
        if (p.sprite) {
            this.drawVineSprite(p, x, y);
            return;
        }
        this.drawVineVector(p, x, y);
    }
    /** Art-backed dart: the sprite carries the shape, this only aims it and lays the speed streaks. */
    private drawVineSprite(p: IProjectile, x: number, y: number): void {
        const sprite = p.sprite!;
        if (!sprite.parent) {
            this.context.attachToWorldRoot(sprite, PROJECTILE_Z);
        }
        sprite.position.set(x, y);
        // Art is authored pointing right; the world root is y-flipped, so negate to keep it nose-first.
        sprite.rotation = -p.angle;
        const g = p.g;
        const w = Math.max(3, p.cell * VINE_WIDTH_FACTOR);
        const len = p.cell * VINE_LEN_FACTOR;
        const ca = Math.cos(p.angle);
        const sa = Math.sin(p.angle);
        const nx = -sa;
        const ny = ca;
        for (let i = 0; i < 4; i += 1) {
            const spread = (i - 1.5) * w * 0.7;
            const tailLen = len * (1.6 + (i % 2) * 0.9);
            g.moveTo(x - ca * len * 0.35 + nx * spread, y - sa * len * 0.35 + ny * spread)
                .lineTo(x - ca * tailLen + nx * spread * 1.8, y - sa * tailLen + ny * spread * 1.8)
                .stroke({ width: Math.max(1, w * 0.34), color: VINE_EMBER, alpha: 0.34 - Math.abs(i - 1.5) * 0.07 });
        }
    }
    private drawVineVector(p: IProjectile, x: number, y: number): void {
        const g = p.g;
        const len = p.cell * VINE_LEN_FACTOR;
        const w = Math.max(3, p.cell * VINE_WIDTH_FACTOR);
        const ca = Math.cos(p.angle);
        const sa = Math.sin(p.angle);
        const nx = -sa;
        const ny = ca;
        const writhe = p.spin * (VINE_WRITHE_PER_DT / CHAKRAM_SPIN_PER_DT);
        /** Local frame: u walks the flight axis with the head at 1, `side` steps perpendicular. */
        const at = (u: number, side: number) => ({
            x: x + ca * (u - 1) * len + nx * side,
            y: y + sa * (u - 1) * len + ny * side,
        });

        // This renders about one cell long in play, so it is built for SILHOUETTE, not for detail: bold
        // streaks, a thick braid, a solid dark head and two heavy sickles. Filigree at this size just
        // turns to visual noise — the reference art's fine thorns are carried by the icon, not by the dart.

        // 1 — speed streaks, the loudest cue that this thing is thrown hard.
        for (let i = 0; i < 4; i += 1) {
            const spread = (i - 1.5) * w * 0.7;
            const tailLen = len * (1.6 + (i % 2) * 0.9);
            const a = at(0.8, spread);
            g.moveTo(a.x, a.y)
                .lineTo(x - ca * tailLen + nx * spread * 1.8, y - sa * tailLen + ny * spread * 1.8)
                .stroke({ width: Math.max(1, w * 0.34), color: VINE_EMBER, alpha: 0.34 - Math.abs(i - 1.5) * 0.07 });
        }

        // 2 — braid: two thick strands crossing over each other. Two, not three: at this size a third
        // strand only muddies the middle.
        const STEPS = 10;
        const strandAt = (u: number, strand: number) =>
            at(u, Math.sin(writhe * 0.5 + strand * Math.PI + u * 6) * w * 0.8 * (0.35 + u * 0.65));
        for (let strand = 0; strand < 2; strand += 1) {
            for (let pass = 0; pass < 2; pass += 1) {
                const color = pass === 0 ? VINE_BARK_DARK : strand === 0 ? VINE_BARK_MID : VINE_BARK_LIGHT;
                const width = pass === 0 ? w * 1.05 : w * 0.62;
                for (let i = 1; i <= STEPS; i += 1) {
                    const a = strandAt((i - 1) / STEPS, strand);
                    const b = strandAt(i / STEPS, strand);
                    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color, alpha: 1, cap: "round" });
                }
            }
        }

        // 3 — heat down the core, brightest at the head.
        for (let i = 1; i <= STEPS; i += 1) {
            const a = at((i - 1) / STEPS, 0);
            const b = at(i / STEPS, 0);
            const heat = 0.2 + 0.65 * (i / STEPS);
            g.moveTo(a.x, a.y)
                .lineTo(b.x, b.y)
                .stroke({ width: w * 0.75, color: VINE_EMBER_DEEP, alpha: heat * 0.5 });
            g.moveTo(a.x, a.y)
                .lineTo(b.x, b.y)
                .stroke({ width: w * 0.24, color: VINE_EMBER, alpha: heat });
        }

        // 4 — head: a solid dark wedge driving forward. Gives the dart one unmistakable pointed end, which
        // is what a fast small object needs to read as "aimed".
        const noseTip = at(1.5, 0);
        const noseL = at(0.92, w * 0.9);
        const noseR = at(0.92, -w * 0.9);
        g.moveTo(noseL.x, noseL.y)
            .lineTo(noseTip.x, noseTip.y)
            .lineTo(noseR.x, noseR.y)
            .closePath()
            .fill({ color: VINE_BARK_MID, alpha: 1 });

        // 5 — two heavy sickles sweeping forward and out from behind the head.
        for (const side of [1, -1]) {
            const hook = 1 + 0.1 * Math.sin(writhe + side * 1.3);
            const root = at(0.86, side * w * 0.7);
            const tip = at(1.42 * hook, side * w * 1.9);
            const outer = at(1.0, side * w * 2.5 * hook);
            const inner = at(1.05, side * w * 0.55);
            g.moveTo(root.x, root.y)
                .quadraticCurveTo(outer.x, outer.y, tip.x, tip.y)
                .quadraticCurveTo(inner.x, inner.y, root.x, root.y)
                .fill({ color: VINE_BARK_MID, alpha: 1 });
            // Only the very tip catches light. A pale line down the whole outer curve is what made these
            // read as crab pincers instead of blades.
            g.circle(tip.x, tip.y, w * 0.18).fill({ color: VINE_CLAW, alpha: 0.85 });
        }
    }
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
