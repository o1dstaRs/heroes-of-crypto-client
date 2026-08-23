import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { GridSettings, HoCMath } from "@heroesofcrypto/common";
import { images } from "../../generated/image_imports";

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
    /** Orc's physical throwing axe: a broad double crescent that spins through the whole flight. */
    orcAxe?: boolean;
    /** Arbalester's selected cyan-silver bolt. */
    arbalesterBolt?: boolean;
    /** Centaur's selected long, leather-gripped spear. */
    centaurSpear?: boolean;
    /** Dryad's selected living thorn dart. */
    dryadDart?: boolean;
    /** Beholder's selected compact purple psychic eye. */
    beholderEye?: boolean;
    /** Elf's selected emerald leaf-fletched arrow. */
    elfArrow?: boolean;
    /** Medusa's selected spectral serpent projectile. */
    medusaSerpent?: boolean;
    /** Cyclops's selected heavy chipped boulder. */
    cyclopsRock?: boolean;
    /** Monk's selected golden solar energy orb. */
    monkOrb?: boolean;
    /** Tsar Cannon's selected molten siege ball. */
    tsarCannonball?: boolean;
    /** Gargantuan's selected root-wrapped boulder. */
    gargantuanRock?: boolean;
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
    orcAxe: boolean;
    arbalesterBolt: boolean;
    centaurSpear: boolean;
    dryadDart: boolean;
    beholderEye: boolean;
    elfArrow: boolean;
    medusaSerpent: boolean;
    cyclopsRock: boolean;
    monkOrb: boolean;
    tsarCannonball: boolean;
    gargantuanRock: boolean;
    /** Set when the vine dart is drawn from art rather than from strokes. */
    sprite?: Sprite;
    spin: number; // radians of blade rotation accumulated in flight
    resolve: () => void;
}

interface IRockImpact {
    g: Graphics;
    position: HoCMath.XY;
    cell: number;
    angle: number;
    ageSeconds: number;
    durationSeconds: number;
    phase: number;
    natureWrapped: boolean;
}

interface ICannonExplosion {
    g: Graphics;
    position: HoCMath.XY;
    cell: number;
    ageSeconds: number;
    durationSeconds: number;
    phase: number;
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
const ORC_AXE_SPIN_PER_DT = 48; // slower, weightier end-over-end rotation
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
    private rockImpacts: IRockImpact[] = [];
    private cannonExplosions: ICannonExplosion[] = [];
    private armorPiercingBoltTexture?: Texture;
    private orcThrowingAxeTexture?: Texture;
    private arbalesterCyanBoltTexture?: Texture;
    private centaurSpearTexture?: Texture;
    private dryadThornDartTexture?: Texture;
    private beholderPurpleEyeTexture?: Texture;
    private elfEmeraldArrowTexture?: Texture;
    private medusaSpectralSerpentTexture?: Texture;
    private cyclopsHeavyBoulderTexture?: Texture;
    private monkSolarOrbTexture?: Texture;
    private tsarCannonMoltenBallTexture?: Texture;
    private gargantuanRootBoulderTexture?: Texture;
    public constructor(context: IRangedProjectilesContext) {
        this.context = context;
        void Assets.load<Texture>(images.armor_piercing_bolt).then((texture) => {
            texture.source.scaleMode = "linear";
            this.armorPiercingBoltTexture = texture;
        });
        void Assets.load<Texture>(images.orc_throwing_axe).then((texture) => {
            texture.source.scaleMode = "linear";
            this.orcThrowingAxeTexture = texture;
        });
        void Assets.load<Texture>(images.arbalester_cyan_bolt).then((texture) => {
            texture.source.scaleMode = "linear";
            this.arbalesterCyanBoltTexture = texture;
        });
        void Assets.load<Texture>(images.centaur_spear_variant_4).then((texture) => {
            texture.source.scaleMode = "linear";
            this.centaurSpearTexture = texture;
        });
        void Assets.load<Texture>(images.dryad_thorn_dart).then((texture) => {
            texture.source.scaleMode = "linear";
            this.dryadThornDartTexture = texture;
        });
        void Assets.load<Texture>(images.beholder_purple_eye_orb).then((texture) => {
            texture.source.scaleMode = "linear";
            this.beholderPurpleEyeTexture = texture;
        });
        void Assets.load<Texture>(images.elf_emerald_arrow).then((texture) => {
            texture.source.scaleMode = "linear";
            this.elfEmeraldArrowTexture = texture;
        });
        void Assets.load<Texture>(images.medusa_spectral_serpent).then((texture) => {
            texture.source.scaleMode = "linear";
            this.medusaSpectralSerpentTexture = texture;
        });
        void Assets.load<Texture>(images.cyclops_heavy_boulder).then((texture) => {
            texture.source.scaleMode = "linear";
            this.cyclopsHeavyBoulderTexture = texture;
        });
        void Assets.load<Texture>(images.monk_solar_orb).then((texture) => {
            texture.source.scaleMode = "linear";
            this.monkSolarOrbTexture = texture;
        });
        void Assets.load<Texture>(images.tsar_cannon_molten_ball).then((texture) => {
            texture.source.scaleMode = "linear";
            this.tsarCannonMoltenBallTexture = texture;
        });
        void Assets.load<Texture>(images.gargantuan_root_boulder).then((texture) => {
            texture.source.scaleMode = "linear";
            this.gargantuanRootBoulderTexture = texture;
        });
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
                orcAxe: !!opts.orcAxe,
                arbalesterBolt: !!opts.arbalesterBolt,
                centaurSpear: !!opts.centaurSpear,
                dryadDart: !!opts.dryadDart,
                beholderEye: !!opts.beholderEye,
                elfArrow: !!opts.elfArrow,
                medusaSerpent: !!opts.medusaSerpent,
                cyclopsRock: !!opts.cyclopsRock,
                monkOrb: !!opts.monkOrb,
                tsarCannonball: !!opts.tsarCannonball,
                gargantuanRock: !!opts.gargantuanRock,
                sprite: opts.orcAxe
                    ? this.makeOrcThrowingAxeSprite(cell)
                    : opts.vine
                      ? this.makeVineSprite(cell)
                      : opts.arbalesterBolt
                        ? this.makeArbalesterCyanBoltSprite(cell)
                        : opts.centaurSpear
                          ? this.makeCentaurSpearSprite(cell)
                          : opts.dryadDart
                            ? this.makeDryadThornDartSprite(cell)
                            : opts.beholderEye
                              ? this.makeBeholderPurpleEyeSprite(cell)
                              : opts.elfArrow
                                ? this.makeElfEmeraldArrowSprite(cell)
                                : opts.medusaSerpent
                                  ? this.makeMedusaSpectralSerpentSprite(cell)
                                  : opts.cyclopsRock
                                    ? this.makeCyclopsHeavyBoulderSprite(cell)
                                    : opts.monkOrb
                                      ? this.makeMonkSolarOrbSprite(cell)
                                      : opts.tsarCannonball
                                        ? this.makeTsarCannonMoltenBallSprite(cell)
                                        : opts.gargantuanRock
                                          ? this.makeGargantuanRootBoulderSprite(cell)
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
            p.spin += (p.orcAxe ? ORC_AXE_SPIN_PER_DT : CHAKRAM_SPIN_PER_DT) * dt;
            const t = p.dist > 1e-3 ? Math.min(1, p.traveled / p.dist) : 1;

            const x = p.from.x + (p.to.x - p.from.x) * t;
            let y = p.from.y + (p.to.y - p.from.y) * t;
            if (p.arc > 0) {
                // Parabolic lob: 0 at both ends, peak at the midpoint.
                y += Math.sin(Math.PI * t) * p.arc;
            }
            this.draw(p, x, y);

            if (t >= 1) {
                if (p.cyclopsRock || p.gargantuanRock) this.spawnRockImpact(p, p.gargantuanRock);
                if (p.tsarCannonball) this.spawnCannonExplosion(p);
                p.sprite?.destroy();
                p.g.destroy();
                this.projectiles.splice(i, 1);
                p.resolve();
            }
        }
        this.updateRockImpacts(dt);
        this.updateCannonExplosions(dt);
    }
    /**
     * Destroy all in-flight projectiles (e.g. fight reset). Resolves awaiters so callers don't hang.
     *
     * `keepInFlight` is for the RANKED BOARD REBUILD, which fires on the snapshot landing right after
     * a replayed action — i.e. routinely WHILE the shot that caused it is still flying. A projectile
     * (like a rock impact or cannon blast) describes an event that already resolved and is anchored to
     * the world root, not to any unit the rebuild replaces — cutting it off mid-air was the live
     * "projectile sometimes disappears" report. Kept flights land and resolve normally a beat later.
     */
    public clear(options: { keepInFlight?: boolean } = {}): void {
        if (options.keepInFlight) {
            return;
        }
        for (const p of this.projectiles) {
            p.sprite?.destroy();
            p.g.destroy();
            p.resolve();
        }
        this.projectiles.length = 0;
        for (const impact of this.rockImpacts) impact.g.destroy();
        this.rockImpacts.length = 0;
        for (const explosion of this.cannonExplosions) explosion.g.destroy();
        this.cannonExplosions.length = 0;
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
        if (p.orcAxe && p.sprite) {
            this.drawOrcThrowingAxe(p, x, y);
            return;
        }
        if (p.cyclopsRock && p.sprite) {
            this.drawCyclopsHeavyBoulder(p, x, y);
            return;
        }
        if (p.monkOrb && p.sprite) {
            this.drawMonkSolarOrb(p, x, y);
            return;
        }
        if (p.tsarCannonball && p.sprite) {
            this.drawTsarCannonMoltenBall(p, x, y);
            return;
        }
        if (p.gargantuanRock && p.sprite) {
            this.drawGargantuanRootBoulder(p, x, y);
            return;
        }
        if (
            (p.arbalesterBolt || p.centaurSpear || p.dryadDart || p.beholderEye || p.elfArrow || p.medusaSerpent) &&
            p.sprite
        ) {
            this.drawDirectionalSprite(p, x, y);
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
    private makeArbalesterCyanBoltSprite(cell: number): Sprite | undefined {
        if (!this.arbalesterCyanBoltTexture) return undefined;
        const sprite = new Sprite(this.arbalesterCyanBoltTexture);
        sprite.anchor.set(0.5);
        const targetLength = cell * 0.84;
        sprite.scale.set(targetLength / Math.max(1, this.arbalesterCyanBoltTexture.width));
        return sprite;
    }
    private makeCentaurSpearSprite(cell: number): Sprite | undefined {
        if (!this.centaurSpearTexture) return undefined;
        const sprite = new Sprite(this.centaurSpearTexture);
        sprite.anchor.set(0.5);
        // About one third longer than the Arbalester bolt while retaining the selected weapon's handle.
        const targetLength = cell * 1.13;
        sprite.scale.set(targetLength / Math.max(1, this.centaurSpearTexture.width));
        return sprite;
    }
    private makeDryadThornDartSprite(cell: number): Sprite | undefined {
        if (!this.dryadThornDartTexture) return undefined;
        return this.makeDirectionalSprite(this.dryadThornDartTexture, cell * 0.98);
    }
    private makeBeholderPurpleEyeSprite(cell: number): Sprite | undefined {
        if (!this.beholderPurpleEyeTexture) return undefined;
        // The source is square with generous transparent padding. 0.944 is exactly 20% below the previous
        // 1.18 target, so the visible eye stays compact while the new flame wake remains easy to read.
        return this.makeDirectionalSprite(this.beholderPurpleEyeTexture, cell * 0.944);
    }
    private makeElfEmeraldArrowSprite(cell: number): Sprite | undefined {
        if (!this.elfEmeraldArrowTexture) return undefined;
        return this.makeDirectionalSprite(this.elfEmeraldArrowTexture, cell * 1.03);
    }
    private makeMedusaSpectralSerpentSprite(cell: number): Sprite | undefined {
        if (!this.medusaSpectralSerpentTexture) return undefined;
        return this.makeDirectionalSprite(this.medusaSpectralSerpentTexture, cell * 1.08);
    }
    private makeCyclopsHeavyBoulderSprite(cell: number): Sprite | undefined {
        if (!this.cyclopsHeavyBoulderTexture) return undefined;
        return this.makeDirectionalSprite(this.cyclopsHeavyBoulderTexture, cell * 0.72);
    }
    private makeMonkSolarOrbSprite(cell: number): Sprite | undefined {
        if (!this.monkSolarOrbTexture) return undefined;
        // Exactly 20% below the originally selected 0.62-cell size.
        return this.makeDirectionalSprite(this.monkSolarOrbTexture, cell * 0.496);
    }
    private makeTsarCannonMoltenBallSprite(cell: number): Sprite | undefined {
        if (!this.tsarCannonMoltenBallTexture) return undefined;
        return this.makeDirectionalSprite(this.tsarCannonMoltenBallTexture, cell * 0.68);
    }
    private makeGargantuanRootBoulderSprite(cell: number): Sprite | undefined {
        if (!this.gargantuanRootBoulderTexture) return undefined;
        return this.makeDirectionalSprite(this.gargantuanRootBoulderTexture, cell * 0.78);
    }
    private makeDirectionalSprite(texture: Texture, targetLength: number): Sprite {
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.scale.set(targetLength / Math.max(1, texture.width));
        return sprite;
    }
    private drawDirectionalSprite(p: IProjectile, x: number, y: number): void {
        const sprite = p.sprite!;
        if (!sprite.parent) this.context.attachToWorldRoot(sprite, PROJECTILE_Z);
        sprite.position.set(x, y);
        // Beholder's projectile is a front-facing round eye, not an arrow: keep its vertical pupil upright
        // while the orb translates along the trajectory. Directional weapons still point into the shot.
        sprite.rotation = p.beholderEye ? 0 : p.angle;
        sprite.visible = true;

        if (p.beholderEye) this.drawBeholderRocketFlame(p, x, y);
    }
    /**
     * A layered psychic flame behind the Beholder eye. It is rebuilt in world coordinates every frame,
     * therefore it always burns opposite the shot direction while the eye and its vertical pupil stay
     * upright. The small sine offsets keep the tips alive without moving the projectile off its path.
     */
    private drawBeholderRocketFlame(p: IProjectile, x: number, y: number): void {
        const ca = Math.cos(p.angle);
        const sa = Math.sin(p.angle);
        const nx = -sa;
        const ny = ca;
        const eyeBack = p.cell * 0.19;
        const flameLength = p.cell * (0.54 + 0.06 * Math.sin(p.spin * 0.8));
        const flameHalfWidth = p.cell * (0.16 + 0.025 * Math.sin(p.spin * 1.25 + 0.7));
        const rootX = x - ca * eyeBack;
        const rootY = y - sa * eyeBack;
        const tipWobble = Math.sin(p.spin * 1.6) * p.cell * 0.045;
        const tipX = rootX - ca * flameLength + nx * tipWobble;
        const tipY = rootY - sa * flameLength + ny * tipWobble;

        // Soft violet exhaust halo.
        p.g
            .moveTo(rootX + nx * flameHalfWidth * 1.45, rootY + ny * flameHalfWidth * 1.45)
            .quadraticCurveTo(
                rootX - ca * flameLength * 0.52 + nx * flameHalfWidth,
                rootY - sa * flameLength * 0.52 + ny * flameHalfWidth,
                tipX,
                tipY,
            )
            .quadraticCurveTo(
                rootX - ca * flameLength * 0.46 - nx * flameHalfWidth,
                rootY - sa * flameLength * 0.46 - ny * flameHalfWidth,
                rootX - nx * flameHalfWidth * 1.45,
                rootY - ny * flameHalfWidth * 1.45,
            )
            .closePath()
            .fill({ color: 0x7a19ff, alpha: 0.3 });

        // Saturated purple body and a short white-magenta hot core make the wake read as rocket fire.
        p.g
            .moveTo(rootX + nx * flameHalfWidth, rootY + ny * flameHalfWidth)
            .quadraticCurveTo(
                rootX - ca * flameLength * 0.45 + nx * flameHalfWidth * 0.55,
                rootY - sa * flameLength * 0.45 + ny * flameHalfWidth * 0.55,
                tipX,
                tipY,
            )
            .quadraticCurveTo(
                rootX - ca * flameLength * 0.42 - nx * flameHalfWidth * 0.55,
                rootY - sa * flameLength * 0.42 - ny * flameHalfWidth * 0.55,
                rootX - nx * flameHalfWidth,
                rootY - ny * flameHalfWidth,
            )
            .closePath()
            .fill({ color: 0xb222ff, alpha: 0.82 });

        const coreLength = flameLength * 0.48;
        const coreTipX = rootX - ca * coreLength - nx * tipWobble * 0.2;
        const coreTipY = rootY - sa * coreLength - ny * tipWobble * 0.2;
        p.g
            .moveTo(rootX + nx * flameHalfWidth * 0.42, rootY + ny * flameHalfWidth * 0.42)
            .quadraticCurveTo(rootX - ca * coreLength * 0.55, rootY - sa * coreLength * 0.55, coreTipX, coreTipY)
            .quadraticCurveTo(
                rootX - ca * coreLength * 0.5,
                rootY - sa * coreLength * 0.5,
                rootX - nx * flameHalfWidth * 0.42,
                rootY - ny * flameHalfWidth * 0.42,
            )
            .closePath()
            .fill({ color: 0xffb9ff, alpha: 0.92 });
    }
    private drawCyclopsHeavyBoulder(p: IProjectile, x: number, y: number): void {
        const sprite = p.sprite!;
        if (!sprite.parent) this.context.attachToWorldRoot(sprite, PROJECTILE_Z);
        sprite.position.set(x, y);
        // A slow, weighty tumble. Reusing the projectile's accumulated spin keeps it deterministic.
        sprite.rotation = p.spin * 0.075;
        sprite.visible = true;

        const ca = Math.cos(p.angle);
        const sa = Math.sin(p.angle);
        const nx = -sa;
        const ny = ca;
        const phase = p.spin * 0.7;
        for (let i = 0; i < 5; i += 1) {
            const distance = p.cell * (0.27 + i * 0.12);
            const drift = Math.sin(phase + i * 1.7) * p.cell * (0.035 + i * 0.008);
            const px = x - ca * distance + nx * drift;
            const py = y - sa * distance + ny * drift;
            const radius = p.cell * (0.07 - i * 0.009);
            p.g.circle(px, py, Math.max(1.5, radius)).fill({
                color: i % 2 === 0 ? 0x81796e : 0x5e5a55,
                alpha: Math.max(0.08, 0.31 - i * 0.045),
            });
        }
        // Two hard chips in the wake keep the trail physical rather than smoky magic.
        for (let i = 0; i < 2; i += 1) {
            const distance = p.cell * (0.37 + i * 0.24);
            const offset = (i === 0 ? 1 : -1) * p.cell * 0.085;
            const px = x - ca * distance + nx * offset;
            const py = y - sa * distance + ny * offset;
            p.g.circle(px, py, p.cell * (0.032 - i * 0.006)).fill({ color: 0x77736f, alpha: 0.78 });
        }
    }
    private drawGargantuanRootBoulder(p: IProjectile, x: number, y: number): void {
        const sprite = p.sprite!;
        if (!sprite.parent) this.context.attachToWorldRoot(sprite, PROJECTILE_Z);
        sprite.position.set(x, y);
        sprite.rotation = p.spin * 0.055;
        sprite.visible = true;

        const ca = Math.cos(p.angle);
        const sa = Math.sin(p.angle);
        const nx = -sa;
        const ny = ca;
        // Loose soil and leaves make the living root bundle distinct from the Cyclops's bare stone.
        for (let i = 0; i < 5; i += 1) {
            const distance = p.cell * (0.32 + i * 0.13);
            const offset = Math.sin(p.spin * 0.52 + i * 1.4) * p.cell * 0.1;
            const px = x - ca * distance + nx * offset;
            const py = y - sa * distance + ny * offset;
            if (i % 2 === 0) {
                p.g.circle(px, py, p.cell * (0.035 + i * 0.003)).fill({ color: 0x6b5137, alpha: 0.52 - i * 0.055 });
            } else {
                const leafAngle = p.angle + p.spin * 0.14 + i;
                const lx = Math.cos(leafAngle) * p.cell * 0.065;
                const ly = Math.sin(leafAngle) * p.cell * 0.065;
                p.g
                    .moveTo(px + lx, py + ly)
                    .quadraticCurveTo(px + ny * p.cell * 0.04, py - nx * p.cell * 0.04, px - lx, py - ly)
                    .quadraticCurveTo(px - ny * p.cell * 0.04, py + nx * p.cell * 0.04, px + lx, py + ly)
                    .fill({ color: 0x5e7f32, alpha: 0.72 - i * 0.07 });
            }
        }
    }
    private drawTsarCannonMoltenBall(p: IProjectile, x: number, y: number): void {
        const sprite = p.sprite!;
        if (!sprite.parent) this.context.attachToWorldRoot(sprite, PROJECTILE_Z);
        sprite.position.set(x, y);
        sprite.rotation = p.spin * 0.065;
        sprite.visible = true;

        const ca = Math.cos(p.angle);
        const sa = Math.sin(p.angle);
        const nx = -sa;
        const ny = ca;
        const back = p.cell * 0.24;
        const rootX = x - ca * back;
        const rootY = y - sa * back;
        const tailLength = p.cell * (0.68 + Math.sin(p.spin * 0.85) * 0.08);
        const halfWidth = p.cell * (0.17 + Math.sin(p.spin * 1.3) * 0.025);
        const wobble = Math.sin(p.spin * 1.5) * p.cell * 0.05;
        const tipX = rootX - ca * tailLength + nx * wobble;
        const tipY = rootY - sa * tailLength + ny * wobble;
        p.g
            .moveTo(rootX + nx * halfWidth * 1.35, rootY + ny * halfWidth * 1.35)
            .quadraticCurveTo(
                rootX - ca * tailLength * 0.5 + nx * halfWidth,
                rootY - sa * tailLength * 0.5 + ny * halfWidth,
                tipX,
                tipY,
            )
            .quadraticCurveTo(
                rootX - ca * tailLength * 0.47 - nx * halfWidth,
                rootY - sa * tailLength * 0.47 - ny * halfWidth,
                rootX - nx * halfWidth * 1.35,
                rootY - ny * halfWidth * 1.35,
            )
            .closePath()
            .fill({ color: 0xff4b0a, alpha: 0.42 });
        p.g
            .moveTo(rootX + nx * halfWidth * 0.72, rootY + ny * halfWidth * 0.72)
            .quadraticCurveTo(rootX - ca * tailLength * 0.42, rootY - sa * tailLength * 0.42, tipX, tipY)
            .quadraticCurveTo(
                rootX - ca * tailLength * 0.38,
                rootY - sa * tailLength * 0.38,
                rootX - nx * halfWidth * 0.72,
                rootY - ny * halfWidth * 0.72,
            )
            .closePath()
            .fill({ color: 0xffc24b, alpha: 0.9 });
        for (let i = 0; i < 4; i += 1) {
            const distance = p.cell * (0.48 + i * 0.17);
            const offset = Math.sin(p.spin + i * 1.8) * p.cell * 0.12;
            p.g
                .circle(x - ca * distance + nx * offset, y - sa * distance + ny * offset, p.cell * (0.03 + i * 0.008))
                .fill({ color: i < 2 ? 0xff8b24 : 0x4d4039, alpha: 0.66 - i * 0.1 });
        }
    }
    private spawnRockImpact(p: IProjectile, natureWrapped: boolean): void {
        const g = new Graphics();
        this.context.attachToWorldRoot(g, PROJECTILE_Z + 2);
        this.rockImpacts.push({
            g,
            position: { x: p.to.x, y: p.to.y },
            cell: p.cell,
            angle: p.angle,
            ageSeconds: 0,
            durationSeconds: natureWrapped ? 0.66 : 0.56,
            phase: p.spin,
            natureWrapped,
        });
    }
    private updateRockImpacts(dt: number): void {
        // Projectile dt advances at roughly one quarter of real time (see the speed convention above).
        const elapsedSeconds = dt * 4;
        for (let impactIndex = this.rockImpacts.length - 1; impactIndex >= 0; impactIndex -= 1) {
            const impact = this.rockImpacts[impactIndex];
            impact.ageSeconds += elapsedSeconds;
            const t = Math.min(1, impact.ageSeconds / impact.durationSeconds);
            this.drawRockImpact(impact, t);
            if (t >= 1) {
                impact.g.destroy();
                this.rockImpacts.splice(impactIndex, 1);
            }
        }
    }
    private drawRockImpact(impact: IRockImpact, t: number): void {
        const { g, position, cell } = impact;
        const fade = 1 - t;
        g.clear();

        // A compact impact flash followed by two dusty pressure rings.
        g.circle(position.x, position.y, cell * (0.16 + t * 0.18)).fill({
            color: 0xe2d2bc,
            alpha: 0.28 * fade,
        });
        for (let ring = 0; ring < 2; ring += 1) {
            const delayedT = Math.max(0, Math.min(1, t * 1.25 - ring * 0.2));
            if (delayedT <= 0) continue;
            g.circle(position.x, position.y, cell * (0.18 + delayedT * (0.44 + ring * 0.1))).stroke({
                width: Math.max(1, cell * 0.065 * (1 - delayedT)),
                color: ring === 0 ? 0xb0a394 : 0x756e67,
                alpha: 0.38 * (1 - delayedT),
            });
        }

        // Eight large, angular pieces burst mostly forward and sideways from the target.
        for (let i = 0; i < 8; i += 1) {
            const spread = (i / 7 - 0.5) * Math.PI * 1.7;
            const theta = impact.angle + spread;
            const travel = cell * (0.1 + t * (0.34 + (i % 3) * 0.075));
            const gravity = cell * 0.19 * t * t;
            const cx = position.x + Math.cos(theta) * travel;
            const cy = position.y + Math.sin(theta) * travel + gravity;
            const size = cell * (0.06 + (i % 3) * 0.013) * (1 - t * 0.3);
            const rotation = impact.phase * 0.08 + i * 0.9 + t * (2.4 + (i % 2));
            const ca = Math.cos(rotation);
            const sa = Math.sin(rotation);
            const point = (lx: number, ly: number): HoCMath.XY => ({
                x: cx + lx * ca - ly * sa,
                y: cy + lx * sa + ly * ca,
            });
            const a = point(size, 0);
            const b = point(-size * 0.52, size * 0.62);
            const c = point(-size * 0.72, -size * 0.48);
            g.poly([a.x, a.y, b.x, b.y, c.x, c.y])
                .fill({
                    color: impact.natureWrapped
                        ? i % 3 === 0
                            ? 0x65472d
                            : i % 2 === 0
                              ? 0x777675
                              : 0x4e4d4b
                        : i % 2 === 0
                          ? 0x777675
                          : 0x4e4d4b,
                    alpha: 0.96 * fade,
                })
                .stroke({ width: Math.max(0.8, cell * 0.012), color: 0x272625, alpha: 0.82 * fade });
        }

        // Fine chips keep the break readable after the large fragments begin fading.
        for (let i = 0; i < 10; i += 1) {
            const theta = impact.angle + i * 2.17;
            const travel = cell * (0.16 + t * (0.2 + (i % 4) * 0.055));
            const px = position.x + Math.cos(theta) * travel;
            const py = position.y + Math.sin(theta) * travel + cell * 0.11 * t * t;
            g.circle(px, py, Math.max(1, cell * (0.017 + (i % 3) * 0.006))).fill({
                color: 0x89847d,
                alpha: 0.76 * fade,
            });
        }
        if (impact.natureWrapped) {
            // Root splinters and torn leaves linger a little longer than the stone dust.
            for (let i = 0; i < 7; i += 1) {
                const theta = impact.angle + i * 1.73;
                const travel = cell * (0.13 + t * (0.31 + (i % 3) * 0.05));
                const px = position.x + Math.cos(theta) * travel;
                const py = position.y + Math.sin(theta) * travel + cell * 0.14 * t * t;
                const length = cell * (0.055 + (i % 2) * 0.025);
                const leafAngle = theta + t * (2.2 + i * 0.17);
                const lx = Math.cos(leafAngle) * length;
                const ly = Math.sin(leafAngle) * length;
                if (i % 2 === 0) {
                    g.moveTo(px - lx, py - ly)
                        .lineTo(px + lx, py + ly)
                        .stroke({
                            width: Math.max(1.2, cell * 0.025),
                            color: 0x6e4528,
                            alpha: 0.88 * fade,
                            cap: "round",
                        });
                } else {
                    g.moveTo(px + lx, py + ly)
                        .quadraticCurveTo(px + ly * 0.55, py - lx * 0.55, px - lx, py - ly)
                        .quadraticCurveTo(px - ly * 0.55, py + lx * 0.55, px + lx, py + ly)
                        .fill({ color: i % 3 === 0 ? 0x7c9b45 : 0x4f702f, alpha: 0.9 * fade });
                }
            }
        }
    }
    private spawnCannonExplosion(p: IProjectile): void {
        const g = new Graphics();
        this.context.attachToWorldRoot(g, PROJECTILE_Z + 3);
        this.cannonExplosions.push({
            g,
            position: { x: p.to.x, y: p.to.y },
            cell: p.cell,
            ageSeconds: 0,
            durationSeconds: 0.72,
            phase: p.spin,
        });
    }
    private updateCannonExplosions(dt: number): void {
        const elapsedSeconds = dt * 4;
        for (let index = this.cannonExplosions.length - 1; index >= 0; index -= 1) {
            const explosion = this.cannonExplosions[index];
            explosion.ageSeconds += elapsedSeconds;
            const t = Math.min(1, explosion.ageSeconds / explosion.durationSeconds);
            this.drawCannonExplosion(explosion, t);
            if (t >= 1) {
                explosion.g.destroy();
                this.cannonExplosions.splice(index, 1);
            }
        }
    }
    private drawCannonExplosion(explosion: ICannonExplosion, t: number): void {
        const { g, position, cell } = explosion;
        const fade = 1 - t;
        g.clear();

        // White-hot contact flash, then orange fire expands into a soot-dark smoke shell.
        const flashT = Math.min(1, t * 4.2);
        g.circle(position.x, position.y, cell * (0.12 + flashT * 0.27)).fill({
            color: 0xfff2bd,
            alpha: 0.92 * (1 - flashT),
        });
        const fireRadius = cell * (0.18 + Math.sin(Math.PI * Math.min(1, t * 1.35)) * 0.56);
        g.circle(position.x, position.y, fireRadius).fill({ color: 0xff4a08, alpha: 0.42 * fade });
        g.circle(position.x, position.y, fireRadius * 0.68).fill({ color: 0xffa21c, alpha: 0.72 * fade });
        g.circle(position.x, position.y, fireRadius * 0.36).fill({ color: 0xffef91, alpha: 0.86 * fade });

        // Uneven flame lobes keep the explosion from reading as three perfect UI circles.
        for (let i = 0; i < 9; i += 1) {
            const theta = (Math.PI * 2 * i) / 9 + explosion.phase * 0.03;
            const lobeTravel = cell * t * (0.34 + (i % 3) * 0.1);
            const px = position.x + Math.cos(theta) * lobeTravel;
            const py = position.y + Math.sin(theta) * lobeTravel;
            const radius = cell * (0.12 + (i % 2) * 0.045) * (0.72 + fade * 0.45);
            g.circle(px, py, radius).fill({
                color: i % 3 === 0 ? 0xffd24a : i % 2 === 0 ? 0xff6514 : 0x9d2f12,
                alpha: 0.72 * fade,
            });
        }

        const shockT = Math.min(1, t * 1.45);
        g.circle(position.x, position.y, cell * (0.2 + shockT * 0.78)).stroke({
            width: Math.max(1, cell * 0.09 * (1 - shockT)),
            color: 0xffb340,
            alpha: 0.76 * (1 - shockT),
        });

        // Smoke takes over late, rises slightly, and fades after the flame has collapsed.
        const smokeT = Math.max(0, (t - 0.22) / 0.78);
        for (let i = 0; i < 7; i += 1) {
            const theta = i * 2.31 + explosion.phase * 0.015;
            const travel = cell * smokeT * (0.16 + (i % 3) * 0.08);
            const px = position.x + Math.cos(theta) * travel;
            const py = position.y + Math.sin(theta) * travel - cell * smokeT * (0.12 + (i % 2) * 0.06);
            g.circle(px, py, cell * (0.1 + smokeT * 0.09 + (i % 2) * 0.025)).fill({
                color: i % 2 === 0 ? 0x2c2928 : 0x514741,
                alpha: 0.4 * smokeT * fade,
            });
        }
    }
    private drawMonkSolarOrb(p: IProjectile, x: number, y: number): void {
        const sprite = p.sprite!;
        if (!sprite.parent) this.context.attachToWorldRoot(sprite, PROJECTILE_Z);
        sprite.position.set(x, y);
        sprite.rotation = 0;
        sprite.alpha = 0.94 + Math.sin(p.spin * 0.85) * 0.06;
        sprite.visible = true;

        const ca = Math.cos(p.angle);
        const sa = Math.sin(p.angle);
        const nx = -sa;
        const ny = ca;
        const back = p.cell * 0.19;
        const rootX = x - ca * back;
        const rootY = y - sa * back;
        const tailLength = p.cell * (0.58 + Math.sin(p.spin * 0.9) * 0.07);
        const halfWidth = p.cell * (0.14 + Math.sin(p.spin * 1.35 + 0.4) * 0.025);
        const wobble = Math.sin(p.spin * 1.7) * p.cell * 0.045;
        const tipX = rootX - ca * tailLength + nx * wobble;
        const tipY = rootY - sa * tailLength + ny * wobble;

        p.g
            .moveTo(rootX + nx * halfWidth * 1.4, rootY + ny * halfWidth * 1.4)
            .quadraticCurveTo(
                rootX - ca * tailLength * 0.48 + nx * halfWidth,
                rootY - sa * tailLength * 0.48 + ny * halfWidth,
                tipX,
                tipY,
            )
            .quadraticCurveTo(
                rootX - ca * tailLength * 0.44 - nx * halfWidth,
                rootY - sa * tailLength * 0.44 - ny * halfWidth,
                rootX - nx * halfWidth * 1.4,
                rootY - ny * halfWidth * 1.4,
            )
            .closePath()
            .fill({ color: 0xffa500, alpha: 0.26 });
        p.g
            .moveTo(rootX + nx * halfWidth, rootY + ny * halfWidth)
            .quadraticCurveTo(
                rootX - ca * tailLength * 0.4 + nx * halfWidth * 0.45,
                rootY - sa * tailLength * 0.4 + ny * halfWidth * 0.45,
                tipX,
                tipY,
            )
            .quadraticCurveTo(
                rootX - ca * tailLength * 0.38 - nx * halfWidth * 0.45,
                rootY - sa * tailLength * 0.38 - ny * halfWidth * 0.45,
                rootX - nx * halfWidth,
                rootY - ny * halfWidth,
            )
            .closePath()
            .fill({ color: 0xffc233, alpha: 0.84 });

        // A soft halo and fast motes sell the orb as concentrated energy without obscuring its ornament.
        p.g.circle(x, y, p.cell * (0.35 + Math.sin(p.spin) * 0.018)).stroke({
            width: Math.max(1.5, p.cell * 0.035),
            color: 0xffe28a,
            alpha: 0.42,
        });
        for (let i = 0; i < 3; i += 1) {
            const distance = p.cell * (0.4 + i * 0.16);
            const offset = Math.sin(p.spin * 1.15 + i * 2.1) * p.cell * 0.11;
            p.g.circle(x - ca * distance + nx * offset, y - sa * distance + ny * offset, p.cell * 0.022).fill({
                color: 0xffed9c,
                alpha: 0.66 - i * 0.13,
            });
        }
    }
    private makeOrcThrowingAxeSprite(cell: number): Sprite | undefined {
        if (!this.orcThrowingAxeTexture) return undefined;
        const sprite = new Sprite(this.orcThrowingAxeTexture);
        sprite.anchor.set(0.5);
        // 12.5% larger than the previous 1.13-cell weapon.
        const targetLength = cell * 1.27125;
        sprite.scale.set(targetLength / Math.max(1, this.orcThrowingAxeTexture.width));
        return sprite;
    }
    private drawOrcThrowingAxe(p: IProjectile, x: number, y: number): void {
        const sprite = p.sprite!;
        if (!sprite.parent) this.context.attachToWorldRoot(sprite, PROJECTILE_Z);
        sprite.position.set(x, y);
        // Start along the shot, then rotate the complete silhouette end-over-end around its centre.
        const weaponAngle = p.angle + p.spin;
        sprite.rotation = weaponAngle;
        sprite.visible = true;

        // The source handle is very fine at board scale. A leather-and-wood reinforcement directly behind
        // only the shaft makes it about 25% broader without stretching either axe head. It shares the live
        // spin angle, so no backing line is left behind as the weapon turns.
        const ca = Math.cos(weaponAngle);
        const sa = Math.sin(weaponAngle);
        const weaponLength = p.cell * 1.27125;
        const handleStart = weaponLength * -0.47;
        const handleEnd = weaponLength * 0.14;
        const startX = x + ca * handleStart;
        const startY = y + sa * handleStart;
        const endX = x + ca * handleEnd;
        const endY = y + sa * handleEnd;
        p.g
            .moveTo(startX, startY)
            .lineTo(endX, endY)
            .stroke({ width: Math.max(3, p.cell * 0.11), color: 0x1a0e09, alpha: 0.98, cap: "round" })
            .moveTo(startX, startY)
            .lineTo(endX, endY)
            .stroke({ width: Math.max(2, p.cell * 0.086), color: 0x51301e, alpha: 0.96, cap: "round" });

        // A restrained pair of bronze motion ghosts makes the rotation readable without turning the
        // physical weapon into a glowing spell.
        const r = p.cell * 0.26;
        for (let ghost = 1; ghost <= 2; ghost += 1) {
            p.g.circle(x, y, r * (0.8 + ghost * 0.13)).stroke({
                width: Math.max(1, p.cell * 0.018),
                color: 0xa97a4c,
                alpha: 0.13 / ghost,
            });
        }
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
