import { CyclopsStoneFracture } from "./CyclopsStoneFracture";
import { readCyclopsImpactMode, type CyclopsImpactMode } from "./CyclopsFracturePhysics";
import { Assets, Container, Graphics, Matrix, Rectangle, Sprite, Texture } from "pixi.js";
import { GridSettings, HoCMath } from "@heroesofcrypto/common";
import { images } from "../../generated/image_imports";
import { animationAtlases } from "../../generated/animation_atlases";
import { CYCLOPS_IMPACT_AREA_CELLS, cyclopsImpactFrame } from "../CyclopsStoneImpact";
import { attachCannonEngineWake, updateCannonEngineWake } from "../TsarCannonMaterial";
import {
    cannonContactCenter,
    cannonExplosionFrame,
    cannonFlightFrame,
    CANNON_FLIGHT_FRAME_SIZE,
    CANNON_FLIGHT_BALL_DIAMETER,
    CANNON_FLIGHT_BALL_ANCHOR,
    CANNON_FLIGHT_SPEED_MULTIPLIER,
    CANNON_EXPLOSION_SPEED_MULTIPLIER,
    CANNON_EXPLOSION_RADIUS_SCALE,
} from "../TsarCannonImpact";
import {
    GARGANTUAN_IMPACT_ANCHOR_Y,
    GARGANTUAN_IMPACT_DURATIONS,
    GARGANTUAN_IMPACT_FRAME_SIZE,
    GARGANTUAN_IMPACT_PAINTED_EXTENT,
} from "../GargantuanStoneImpact";

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
    /** Optional cancellation for an individual lab shot, including a pending texture load. */
    signal?: AbortSignal;
    /** Invoked only on arrival; cancellation and scene teardown never count as a hit. */
    onImpact?: () => void;
    /** Remaining destinations after `to`, traversed by the same projectile at constant speed. */
    path?: HoCMath.XY[];
    /** Append the actual release position after all destinations, including ricochets. */
    returnToOrigin?: boolean;
    /** Synchronous arrival callback: index 0 is `to`, followed by entries in `path`. */
    onWaypoint?: (index: number) => void;
    /** Zena's Chakram: a spinning bladed disc rather than a bolt or a cannonball. */
    chakram?: boolean;
    /** The caller owns the ricochet chain and the return to the hand. */
    chakramDeferReturn?: boolean;
    /** Authored held diameter × 1.15, in world pixels. */
    chakramDiameter?: number;
    /** Trent's Vine Throw: a braided, thorn-clawed length of living wood. */
    vine?: boolean;
    /** Orc's physical throwing axe: a broad double crescent that spins through the whole flight. */
    orcAxe?: boolean;
    orcAppearance?: { length: number; rotation: number; facing: number };
    /** Arbalester's selected cyan-silver bolt. */
    arbalesterBolt?: boolean;
    /** Centaur's selected long, leather-gripped spear. */
    centaurSpear?: boolean;
    /** Dryad's selected living thorn dart. */
    dryadDart?: boolean;
    /** Physical arrow released by the lab bow; length matches its held sprite. */
    dryadArrow?: boolean;
    arrowLength?: number;
    /** Beholder's selected compact purple psychic eye. */
    beholderEye?: boolean;
    /** Elf's selected emerald leaf-fletched arrow. */
    elfArrow?: boolean;
    /** Medusa's selected spectral serpent projectile. */
    medusaSerpent?: boolean;
    /** Painted physical serpent released from the lab figure's forearm. */
    medusaArmSerpent?: boolean;
    serpentLength?: number;
    /** Cyclops's selected heavy chipped boulder. */
    cyclopsRock?: boolean;
    /** Floor contact, independent of a target’s torso aim point. */
    cyclopsImpactPosition?: HoCMath.XY;
    /** Monk's selected golden solar energy orb. */
    monkOrb?: boolean;
    /** The lab orb uses the held lime-gold ball size and idle halo. */
    monkLabOrbRadius?: number;
    /** Tsar Cannon's selected molten siege ball. */
    tsarCannonball?: boolean;
    labIronCannonball?: boolean;
    cannonExplodeOnImpact?: boolean;
    cannonImpactPosition?: HoCMath.XY;
    /** Piercing volleys travel through recorded victims to their endpoint. */
    cannonPiercing?: boolean;
    cannonTraceTarget?: HoCMath.XY;
    /** Painted ball diameter in world pixels, measured from the firing unit's inner muzzle. */
    cannonballDiameter?: number;
    /** Gargantuan's original held stone. */
    gargantuanRock?: boolean;
    gargantuanRockDiameter?: number;
    gargantuanRockHeight?: number;
    gargantuanImpactPosition?: HoCMath.XY;

    onProgress?: (progress: number) => void;
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
    chakramDiameter?: number;
    vine: boolean;
    orcAxe: boolean;
    orcAppearance?: { length: number; rotation: number; facing: number };
    arbalesterBolt: boolean;
    centaurSpear: boolean;
    dryadDart: boolean;
    dryadArrow: boolean;
    beholderEye: boolean;
    elfArrow: boolean;
    medusaSerpent: boolean;
    medusaArmSerpent: boolean;
    cyclopsRock: boolean;
    cyclopsImpactMode: CyclopsImpactMode;
    cyclopsImpactPosition?: HoCMath.XY;
    monkOrb: boolean;
    monkLabOrbRadius?: number;
    tsarCannonball: boolean;
    labIronCannonball: boolean;
    cannonballDiameter?: number;
    flightElapsedMs: number;
    cannonExplodeOnImpact: boolean;
    cannonImpactPosition?: HoCMath.XY;
    gargantuanRock: boolean;
    gargantuanImpactPosition?: HoCMath.XY;
    /** Set when the vine dart is drawn from art rather than from strokes. */
    sprite?: Sprite;
    spin: number; // radians of blade rotation accumulated in flight
    resolve: () => void;
    onImpact?: () => void;
    removeAbortListener?: () => void;
    path: HoCMath.XY[];
    waypoint: number;
    onWaypoint?: (index: number) => void;

    onProgress?: (progress: number) => void;
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
    sprite: Sprite;
    elapsedMs: number;
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
    private readonly lifecycleMarker: Container;
    private destroyed = false;
    private projectiles: IProjectile[] = [];
    private rockImpacts: IRockImpact[] = [];
    private cannonExplosions: ICannonExplosion[] = [];
    private cannonExplosionFrames?: Texture[];
    private gargantuanImpactFrames?: Texture[];
    private cyclopsImpacts: ICannonExplosion[] = [];
    private cyclopsImpactMode: CyclopsImpactMode = readCyclopsImpactMode();
    private cyclopsFracture?: CyclopsStoneFracture;
    public setCyclopsImpactMode(mode: CyclopsImpactMode): void {
        this.cyclopsImpactMode = mode;
    }
    private zenaChakramTexture?: Texture;
    private zenaChakramSparkFrames?: Texture[];
    private zenaBounceFrames?: Texture[];
    private zenaBursts: { sparks: Sprite; elapsed: number; diameter: number; resolve: () => void }[] = [];
    private armorPiercingBoltTexture?: Texture;
    private orcThrowingAxeTexture?: Texture;
    private arbalesterCyanBoltTexture?: Texture;
    private centaurSpearTexture?: Texture;
    private dryadThornDartTexture?: Texture;
    private dryadArrowTexture?: Texture;
    private beholderPurpleEyeTexture?: Texture;
    private elfEmeraldArrowTexture?: Texture;
    private medusaSpectralSerpentTexture?: Texture;
    private medusaArmSerpentFrames?: Texture[];
    private cyclopsHeavyBoulderTexture?: Texture;
    private monkSolarOrbTexture?: Texture;
    private tsarCannonMoltenBallTexture?: Texture;
    private tsarCannonIronBallTexture?: Texture;
    private cannonFlightFrames?: Texture[];
    private gargantuanHeldStoneTexture?: Texture;
    private readonly loadedProjectileUrls = new Set<string>();
    public constructor(context: IRangedProjectilesContext) {
        this.context = context;
        this.lifecycleMarker = new Container();
        this.lifecycleMarker.visible = false;
        this.lifecycleMarker.eventMode = "none";
        this.lifecycleMarker.once("destroyed", () => this.releaseOwnedResources());
        this.context.attachToWorldRoot(this.lifecycleMarker, PROJECTILE_Z);
    }
    private async ensureProjectileTexture(opts: IFireProjectileOptions): Promise<void> {
        if (opts.chakram && !this.zenaChakramSparkFrames && !this.zenaChakramTexture) {
            const url = images.zena_chakram_sparks_v16;
            try {
                const atlas = await Assets.load<Texture>(url);
                if (this.destroyed) {
                    void Assets.unload(url).catch(() => undefined);
                    return;
                }
                this.loadedProjectileUrls.add(url);
                atlas.source.scaleMode = "linear";
                atlas.source.autoGenerateMipmaps = true;
                this.zenaChakramSparkFrames ??= Array.from(
                    { length: 8 },
                    (_, i) =>
                        new Texture({
                            source: atlas.source,
                            frame: new Rectangle((i % 4) * 512, Math.floor(i / 4) * 512, 512, 512),
                        }),
                );
                this.zenaChakramTexture = this.zenaChakramSparkFrames[0];
            } catch {
                // Keep the original weapon available if the effect atlas cannot be decoded.
            }
        }
        if (opts.medusaArmSerpent) {
            if (this.medusaArmSerpentFrames) return;
            const url = images.medusa_lab_projectile_atlas;
            try {
                const atlas = await Assets.load<Texture>(url);
                if (this.destroyed) {
                    void Assets.unload(url).catch(() => undefined);
                    return;
                }
                this.loadedProjectileUrls.add(url);
                const meta = animationAtlases["Medusa Lab"].projectile;
                atlas.source.scaleMode = "linear";
                // Preserve the thin painted silhouette when the native atlas is minified on the board.
                atlas.source.autoGenerateMipmaps = true;
                this.medusaArmSerpentFrames ??= Array.from(
                    { length: meta.frameCount },
                    (_, i) =>
                        new Texture({
                            source: atlas.source,
                            frame: new Rectangle(
                                (i % meta.layout.cols) * meta.frameWidth,
                                Math.floor(i / meta.layout.cols) * meta.frameHeight,
                                meta.frameWidth,
                                meta.frameHeight,
                            ),
                        }),
                );
            } catch {
                // The normal projectile fallback still resolves interrupted or unavailable previews.
            }
            return;
        }
        const request = opts.chakram
            ? {
                  current: this.zenaChakramTexture,
                  url: images.zena_chakram_v14,
                  assign: (texture: Texture) => (this.zenaChakramTexture = texture),
              }
            : opts.dryadArrow
              ? {
                    current: this.dryadArrowTexture,
                    url: images.dryad_lab_arrow,
                    assign: (texture: Texture) => (this.dryadArrowTexture = texture),
                }
              : opts.orcAxe
                ? {
                      current: this.orcThrowingAxeTexture,
                      url: images.orc_throwing_axe,
                      assign: (texture: Texture) => (this.orcThrowingAxeTexture = texture),
                  }
                : opts.arbalesterBolt
                  ? {
                        current: this.arbalesterCyanBoltTexture,
                        url: images.arbalester_cyan_bolt,
                        assign: (texture: Texture) => (this.arbalesterCyanBoltTexture = texture),
                    }
                  : opts.centaurSpear
                    ? {
                          current: this.centaurSpearTexture,
                          url: images.centaur_spear_variant_4,
                          assign: (texture: Texture) => (this.centaurSpearTexture = texture),
                      }
                    : opts.dryadDart
                      ? {
                            current: this.dryadThornDartTexture,
                            url: images.dryad_thorn_dart,
                            assign: (texture: Texture) => (this.dryadThornDartTexture = texture),
                        }
                      : opts.beholderEye
                        ? {
                              current: this.beholderPurpleEyeTexture,
                              url: images.beholder_purple_eye_orb,
                              assign: (texture: Texture) => (this.beholderPurpleEyeTexture = texture),
                          }
                        : opts.elfArrow
                          ? {
                                current: this.elfEmeraldArrowTexture,
                                url: images.elf_emerald_arrow,
                                assign: (texture: Texture) => (this.elfEmeraldArrowTexture = texture),
                            }
                          : opts.medusaSerpent
                            ? {
                                  current: this.medusaSpectralSerpentTexture,
                                  url: images.medusa_spectral_serpent,
                                  assign: (texture: Texture) => (this.medusaSpectralSerpentTexture = texture),
                              }
                            : opts.cyclopsRock
                              ? {
                                    current: this.cyclopsHeavyBoulderTexture,
                                    url: images.cyclops_lab_boulder,
                                    assign: (texture: Texture) => (this.cyclopsHeavyBoulderTexture = texture),
                                }
                              : opts.monkOrb
                                ? {
                                      current: this.monkSolarOrbTexture,
                                      url: images.monk_solar_orb,
                                      assign: (texture: Texture) => (this.monkSolarOrbTexture = texture),
                                  }
                                : opts.tsarCannonball
                                  ? {
                                        current: opts.labIronCannonball
                                            ? this.tsarCannonIronBallTexture
                                            : this.tsarCannonMoltenBallTexture,
                                        url: opts.labIronCannonball
                                            ? images.vfx_tsar_cannon_flight_v21_atlas
                                            : images.tsar_cannon_molten_ball,
                                        assign: (texture: Texture) => {
                                            if (opts.labIronCannonball) this.tsarCannonIronBallTexture = texture;
                                            else this.tsarCannonMoltenBallTexture = texture;
                                        },
                                    }
                                  : opts.gargantuanRock
                                    ? {
                                          current: this.gargantuanHeldStoneTexture,
                                          url: images.gargantuan_held_stone_v4,
                                          assign: (texture: Texture) => (this.gargantuanHeldStoneTexture = texture),
                                      }
                                    : !opts.big && !opts.chakram && !opts.vine
                                      ? {
                                            current: this.armorPiercingBoltTexture,
                                            url: images.armor_piercing_bolt,
                                            assign: (texture: Texture) => (this.armorPiercingBoltTexture = texture),
                                        }
                                      : undefined;
        if (!request || request.current) return;

        try {
            const texture = await Assets.load<Texture>(request.url);
            if (this.destroyed) {
                // A late decode must not remain stranded in Pixi's global cache after its scene is gone.
                void Assets.unload(request.url).catch(() => undefined);
                return;
            }
            this.loadedProjectileUrls.add(request.url);
            texture.source.scaleMode = "linear";
            request.assign(texture);
        } catch {
            // The existing vector fallbacks keep combat moving if an optional projectile image fails.
        }
    }
    public async prepare(opts: IFireProjectileOptions): Promise<void> {
        if (!this.destroyed)
            await Promise.all([
                this.ensureProjectileTexture(opts),
                opts.tsarCannonball ? this.ensureCannonExplosionTexture() : Promise.resolve(),
                opts.cyclopsRock && this.cyclopsImpactMode === "sprites"
                    ? this.ensureGargantuanImpactTexture()
                    : Promise.resolve(),
                opts.chakram ? this.ensureChakramBounceTexture() : Promise.resolve(),
            ]);
    }
    public hasActive(): boolean {
        return this.projectiles.length > 0 || this.zenaBursts.length > 0;
    }
    private async ensureChakramBounceTexture(): Promise<void> {
        if (!this.zenaBounceFrames) {
            const url = images.zena_chakram_burst_v17;
            try {
                const atlas = await Assets.load<Texture>(url);
                if (this.destroyed) {
                    void Assets.unload(url).catch(() => undefined);
                    return;
                }
                this.loadedProjectileUrls.add(url);
                this.zenaBounceFrames ??= Array.from(
                    { length: 8 },
                    (_, i) =>
                        new Texture({
                            source: atlas.source,
                            frame: new Rectangle((i % 4) * 512, Math.floor(i / 4) * 512, 512, 512),
                        }),
                );
            } catch {
                return;
            }
        }
    }
    public async showChakramBounce(point: HoCMath.XY, diameter?: number): Promise<void> {
        if (this.destroyed) return;
        if (!this.zenaBounceFrames) await this.ensureChakramBounceTexture();
        if (this.destroyed || !this.zenaBounceFrames) return;
        const size = diameter ?? this.context.getGridSettings().getCellSize() * CHAKRAM_RADIUS_FACTOR * 2;
        const sparks = this.makeDirectionalSprite(this.zenaBounceFrames[0], size * 3.2);
        sparks.position.set(point.x, point.y);
        sparks.blendMode = "add";
        this.context.attachToWorldRoot(sparks, PROJECTILE_Z + 1);
        await new Promise<void>((resolve) => this.zenaBursts.push({ sparks, elapsed: 0, diameter: size, resolve }));
    }
    public async fireAlongPath(points: HoCMath.XY[], opts: Omit<IFireProjectileOptions, "from" | "to">): Promise<void> {
        if (points.length < 2) return;
        await this.fire({ ...opts, from: points[0], to: points[1], path: points.slice(2) });
    }
    public async fire(opts: IFireProjectileOptions): Promise<void> {
        if (this.destroyed || opts.signal?.aborted) return;
        const cyclopsImpactMode = this.cyclopsImpactMode;
        await this.ensureProjectileTexture(opts);
        if (opts.tsarCannonball && !this.cannonExplosionFrames) await this.ensureCannonExplosionTexture();
        if (opts.cyclopsRock && cyclopsImpactMode === "sprites" && !this.gargantuanImpactFrames)
            await this.ensureGargantuanImpactTexture();
        // New Battle may have destroyed the lifecycle marker while the optional art above was decoding.
        // Never attach an orphaned projectile to the app-owned world root after that boundary.
        if (this.destroyed || opts.signal?.aborted) return;
        this.context.onProjectileFired?.();
        const cell = this.context.getGridSettings().getCellSize();
        const from = { x: opts.from.x, y: opts.from.y };
        const to =
            opts.tsarCannonball && opts.cannonImpactPosition && !opts.cannonPiercing
                ? cannonContactCenter(from, opts.cannonImpactPosition, opts.cannonballDiameter ?? cell)
                : opts.cyclopsRock && opts.cyclopsImpactPosition
                  ? { x: opts.cyclopsImpactPosition.x, y: opts.cyclopsImpactPosition.y + cell * 0.3 }
                  : { x: opts.to.x, y: opts.to.y };
        if (opts.orcAxe && opts.orcAppearance && this.orcThrowingAxeTexture) {
            const appearance = opts.orcAppearance;
            const scale = appearance.length / this.orcThrowingAxeTexture.width;
            const localX = this.orcThrowingAxeTexture.width * 0.24 * scale * appearance.facing;
            const localY = this.orcThrowingAxeTexture.height * 0.32 * scale;
            from.x += localX * Math.cos(appearance.rotation) - localY * Math.sin(appearance.rotation);
            from.y += localX * Math.sin(appearance.rotation) + localY * Math.cos(appearance.rotation);
        }
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
                speed:
                    cell *
                    (opts.labIronCannonball
                        ? 16 * CANNON_FLIGHT_SPEED_MULTIPLIER
                        : opts.medusaArmSerpent
                          ? PROJECTILE_SPEED_FACTOR
                          : opts.dryadArrow
                            ? PROJECTILE_SPEED_FACTOR
                            : opts.orcAxe
                              ? 52.2
                              : opts.chakram
                                ? CHAKRAM_SPEED_FACTOR
                                : PROJECTILE_SPEED_FACTOR),
                big: opts.big,
                arc: opts.big ? cell * BIG_ARC_FACTOR : 0,
                cell,
                chakram: !!opts.chakram,
                chakramDiameter: opts.chakramDiameter,
                vine: !!opts.vine,
                orcAxe: !!opts.orcAxe,
                orcAppearance: opts.orcAppearance,
                arbalesterBolt: !!opts.arbalesterBolt,
                centaurSpear: !!opts.centaurSpear,
                dryadDart: !!opts.dryadDart,
                dryadArrow: !!opts.dryadArrow,
                beholderEye: !!opts.beholderEye,
                elfArrow: !!opts.elfArrow,
                medusaSerpent: !!opts.medusaSerpent,
                medusaArmSerpent: !!opts.medusaArmSerpent,
                cyclopsRock: !!opts.cyclopsRock,
                cyclopsImpactMode,
                cyclopsImpactPosition: opts.cyclopsImpactPosition,
                monkOrb: !!opts.monkOrb,
                monkLabOrbRadius: opts.monkLabOrbRadius,
                tsarCannonball: !!opts.tsarCannonball,
                labIronCannonball: !!opts.labIronCannonball,
                cannonballDiameter: opts.cannonballDiameter,
                flightElapsedMs: 0,
                cannonExplodeOnImpact: opts.cannonExplodeOnImpact !== false,
                cannonImpactPosition: opts.cannonImpactPosition,
                gargantuanRock: !!opts.gargantuanRock,
                gargantuanImpactPosition: opts.gargantuanImpactPosition,
                sprite:
                    opts.monkLabOrbRadius !== undefined
                        ? undefined
                        : opts.dryadArrow && this.dryadArrowTexture
                          ? this.makeDirectionalSprite(this.dryadArrowTexture, opts.arrowLength ?? cell * 0.75)
                          : opts.orcAxe
                            ? this.makeOrcThrowingAxeSprite(cell, opts.orcAppearance)
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
                                                ? this.makeTsarCannonMoltenBallSprite(
                                                      cell,
                                                      opts.cannonballDiameter,
                                                      opts.labIronCannonball,
                                                  )
                                                : opts.gargantuanRock
                                                  ? this.makeGargantuanHeldStoneSprite(
                                                        cell,
                                                        opts.gargantuanRockDiameter,
                                                        opts.gargantuanRockHeight,
                                                    )
                                                  : !opts.big && !opts.chakram
                                                    ? this.makeArmorPiercingBoltSprite(cell)
                                                    : undefined,
                spin: 0,
                resolve,
                onImpact: opts.onImpact,
                onProgress: opts.onProgress,
                path: [...(opts.path ?? []), ...(opts.returnToOrigin ? [from] : [])].map((point) => ({ ...point })),
                waypoint: 0,
                onWaypoint: opts.onWaypoint,
            };
            if (opts.chakram && this.zenaChakramTexture) {
                projectile.sprite = this.makeDirectionalSprite(
                    this.zenaChakramTexture,
                    (opts.chakramDiameter ?? cell * CHAKRAM_RADIUS_FACTOR * 2) *
                        (this.zenaChakramSparkFrames ? 512 / 280 : 1),
                );
            }
            if (opts.medusaArmSerpent && this.medusaArmSerpentFrames?.length) {
                projectile.sprite?.destroy();
                projectile.sprite = this.makeDirectionalSprite(
                    this.medusaArmSerpentFrames[0],
                    opts.serpentLength ?? cell * 0.65,
                );
                projectile.sprite.anchor.set(0.04, 0.5);
            }
            // The shaft is subpixel at board scale. Keep its held length while giving the
            // flying arrow enough thickness to survive minification against the floor.
            if (projectile.dryadArrow && projectile.sprite) projectile.sprite.scale.y *= 1.8;
            this.draw(projectile, from.x, from.y);
            this.projectiles.push(projectile);
            if (opts.signal) {
                const cancel = (): void => {
                    const index = this.projectiles.indexOf(projectile);
                    if (index < 0) return;
                    this.projectiles.splice(index, 1);
                    projectile.removeAbortListener?.();
                    projectile.sprite?.destroy();
                    projectile.g.destroy();
                    projectile.resolve();
                };
                opts.signal.addEventListener("abort", cancel, { once: true });
                projectile.removeAbortListener = () => opts.signal?.removeEventListener("abort", cancel);
                if (opts.signal.aborted) cancel();
            }
        });
    }
    public update(dt: number): void {
        // Advance existing blasts before spawning contacts so the ignition cel is rendered once.
        this.updateCannonExplosions(dt);
        this.updateCyclopsImpacts(dt);
        this.cyclopsFracture?.update(dt);
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.flightElapsedMs += dt * 4000;
            p.traveled += p.speed * dt;
            // A thrown chakram spins hard the whole way — this is what sells it as a disc rather than a
            // coin flipping edge-on, and it keeps spinning through the ricochet arcs.
            p.spin += (p.orcAxe ? ORC_AXE_SPIN_PER_DT : CHAKRAM_SPIN_PER_DT) * dt;
            // Carry the unused distance through every corner in this frame. Re-spawning at each
            // corner discarded it, reset the spin and left a frame with no visible weapon.
            while (p.traveled >= p.dist) {
                this.draw(p, p.to.x, p.to.y);
                p.onWaypoint?.(p.waypoint);
                if (p.g.destroyed) break; // A contact callback may cancel the shot or clear the scene.
                const next = p.path[p.waypoint++];
                if (!next) break;
                p.traveled -= p.dist;
                p.from = p.to;
                p.to = next;
                p.dist = Math.hypot(next.x - p.from.x, next.y - p.from.y);
                p.angle = Math.atan2(next.y - p.from.y, next.x - p.from.x);
            }
            if (p.g.destroyed) continue;
            const t = p.dist > 1e-3 ? Math.min(1, p.traveled / p.dist) : 1;

            const x = p.from.x + (p.to.x - p.from.x) * t;
            let y = p.from.y + (p.to.y - p.from.y) * t;
            if (p.arc > 0) {
                // Parabolic lob: 0 at both ends, peak at the midpoint.
                y += Math.sin(Math.PI * t) * p.arc;
            }
            this.draw(p, x, y);
            p.onProgress?.(t);

            if (t >= 1) {
                if (p.cyclopsRock) this.spawnCyclopsImpact(p);
                if (p.gargantuanRock) this.spawnGargantuanImpact(p);
                if (p.tsarCannonball && p.cannonExplodeOnImpact) this.spawnCannonExplosion(p);
                p.sprite?.destroy();
                p.g.destroy();
                this.projectiles.splice(i, 1);
                p.removeAbortListener?.();
                try {
                    p.onImpact?.();
                } finally {
                    p.resolve();
                }
            }
        }
        for (let i = this.zenaBursts.length - 1; i >= 0; i--) {
            const burst = this.zenaBursts[i];
            burst.elapsed += dt * 4000;
            const t = Math.min(1, burst.elapsed / 100);
            burst.sparks.rotation -= dt * 25;
            burst.sparks.texture = this.zenaBounceFrames![Math.min(7, Math.floor(t * 8))];
            burst.sparks.width = burst.sparks.height = burst.diameter * (3.2 + t * 1.2);
            burst.sparks.alpha = (1 - t) ** 0.55;
            if (t >= 1) {
                burst.sparks.destroy();
                this.zenaBursts.splice(i, 1);
                burst.resolve();
            }
        }
        this.updateRockImpacts(dt);
    }
    public clear(options: { keepInFlight?: boolean } = {}): void {
        if (options.keepInFlight) {
            return;
        }
        for (const p of this.projectiles) {
            p.removeAbortListener?.();
            p.sprite?.destroy();
            p.g.destroy();
            p.resolve();
        }
        this.projectiles.length = 0;
        for (const burst of this.zenaBursts) {
            burst.sparks.destroy();
            burst.resolve();
        }
        this.zenaBursts.length = 0;
        for (const impact of this.rockImpacts) impact.g.destroy();
        this.rockImpacts.length = 0;
        for (const explosion of this.cannonExplosions) explosion.sprite.destroy();
        this.cannonExplosions.length = 0;
        for (const impact of this.cyclopsImpacts) impact.sprite.destroy();
        this.cyclopsImpacts.length = 0;
        this.cyclopsFracture?.clear();
    }
    public destroy(): void {
        this.releaseOwnedResources();
        if (!this.lifecycleMarker.destroyed) this.lifecycleMarker.destroy();
    }
    private releaseOwnedResources(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.clear();
        // These Texture objects belong to Pixi's global Assets cache; drop only this scene's references.
        this.zenaChakramTexture = undefined;
        for (const frame of this.zenaChakramSparkFrames ?? []) frame.destroy(false);
        this.zenaChakramSparkFrames = undefined;
        for (const frame of this.zenaBounceFrames ?? []) frame.destroy(false);
        this.zenaBounceFrames = undefined;
        this.armorPiercingBoltTexture = undefined;
        this.orcThrowingAxeTexture = undefined;
        this.arbalesterCyanBoltTexture = undefined;
        this.centaurSpearTexture = undefined;
        this.dryadThornDartTexture = undefined;
        this.dryadArrowTexture = undefined;
        this.beholderPurpleEyeTexture = undefined;
        this.elfEmeraldArrowTexture = undefined;
        this.medusaSpectralSerpentTexture = undefined;
        for (const frame of this.medusaArmSerpentFrames ?? []) frame.destroy(false);
        this.medusaArmSerpentFrames = undefined;
        this.cyclopsHeavyBoulderTexture = undefined;
        this.monkSolarOrbTexture = undefined;
        this.tsarCannonMoltenBallTexture = undefined;
        this.tsarCannonIronBallTexture = undefined;
        for (const frame of this.cannonFlightFrames ?? []) frame.destroy(false);
        this.cannonFlightFrames = undefined;
        for (const frame of this.cannonExplosionFrames ?? []) frame.destroy(false);
        this.cannonExplosionFrames = undefined;
        this.gargantuanHeldStoneTexture = undefined;
        for (const frame of this.gargantuanImpactFrames ?? []) frame.destroy(false);
        this.gargantuanImpactFrames = undefined;
        for (const url of this.loadedProjectileUrls) {
            void Assets.unload(url).catch(() => undefined);
        }
        this.loadedProjectileUrls.clear();
    }
    private draw(p: IProjectile, x: number, y: number): void {
        const g = p.g;
        g.clear();
        if (p.medusaArmSerpent && p.sprite && this.medusaArmSerpentFrames?.length) {
            const meta = animationAtlases["Medusa Lab"].projectile;
            const flightMs = (p.traveled / p.speed) * 4000;
            const index = Math.floor(flightMs / (meta.frameDurationSec * 1000)) % this.medusaArmSerpentFrames.length;
            p.sprite.texture = this.medusaArmSerpentFrames[index];
            this.drawDirectionalSprite(p, x, y);
            return;
        }
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
        if (p.monkLabOrbRadius !== undefined) {
            this.drawMonkLabOrb(p, x, y);
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
            this.drawGargantuanHeldStone(p, x, y);
            return;
        }
        if (
            (p.arbalesterBolt ||
                p.centaurSpear ||
                p.dryadDart ||
                p.dryadArrow ||
                p.beholderEye ||
                p.elfArrow ||
                p.medusaSerpent) &&
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
    private makeTsarCannonMoltenBallSprite(cell: number, diameter?: number, iron = false): Sprite | undefined {
        const texture = iron ? this.tsarCannonIronBallTexture : this.tsarCannonMoltenBallTexture;
        if (!texture) return undefined;
        if (iron) {
            this.cannonFlightFrames ??= Array.from(
                { length: 16 },
                (_, i) =>
                    new Texture({
                        source: texture.source,
                        frame: new Rectangle(
                            (i % 4) * CANNON_FLIGHT_FRAME_SIZE,
                            Math.floor(i / 4) * CANNON_FLIGHT_FRAME_SIZE,
                            CANNON_FLIGHT_FRAME_SIZE,
                            CANNON_FLIGHT_FRAME_SIZE,
                        ),
                    }),
            );
            const sprite = new Sprite(this.cannonFlightFrames[0]);
            sprite.anchor.set(CANNON_FLIGHT_BALL_ANCHOR.x, CANNON_FLIGHT_BALL_ANCHOR.y);
            sprite.scale.set((diameter ?? cell * 0.34) / CANNON_FLIGHT_BALL_DIAMETER);
            attachCannonEngineWake(sprite);
            return sprite;
        }
        return this.makeDirectionalSprite(texture, diameter ?? cell);
    }
    private makeGargantuanHeldStoneSprite(cell: number, diameter?: number, height?: number): Sprite | undefined {
        if (!this.gargantuanHeldStoneTexture) return undefined;
        const sprite = this.makeDirectionalSprite(
            this.gargantuanHeldStoneTexture,
            (diameter ?? cell * 0.78) * (512 / 496),
        );
        // Match the unit's board projection and upward world Y at release.
        sprite.scale.y = -(height ?? diameter ?? cell * 0.78) / 496;
        return sprite;
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
    private drawGargantuanHeldStone(p: IProjectile, x: number, y: number): void {
        const sprite = p.sprite!;
        if (!sprite.parent) this.context.attachToWorldRoot(sprite, PROJECTILE_Z);
        sprite.position.set(x, y);
        sprite.rotation = p.spin * 0.055;
        sprite.visible = true;
    }
    private drawTsarCannonMoltenBall(p: IProjectile, x: number, y: number): void {
        const sprite = p.sprite!;
        if (!sprite.parent) this.context.attachToWorldRoot(sprite, PROJECTILE_Z);
        sprite.position.set(x, y);
        sprite.rotation = p.spin * 0.065;
        sprite.visible = true;
        if (p.labIronCannonball && this.cannonFlightFrames) {
            sprite.texture = this.cannonFlightFrames[cannonFlightFrame(p.flightElapsedMs)];
            updateCannonEngineWake(sprite, p.flightElapsedMs);
            let sx = 1,
                sy = 1;
            for (let parent = sprite.parent; parent; parent = parent.parent) {
                sx *= Math.abs(parent.scale.x);
                sy *= Math.abs(parent.scale.y);
            }
            const ratio = sy > 0 ? sx / sy : 1;
            const angle = Math.atan2(-Math.sin(p.angle) * sy, Math.cos(p.angle) * sx);
            const c = Math.cos(angle),
                s = Math.sin(angle);
            const scale = (p.cannonballDiameter ?? p.cell * 0.34) / CANNON_FLIGHT_BALL_DIAMETER;
            // Billboard in screen space: round iron sphere and wake aligned to the projected flight path.
            sprite.setFromMatrix(new Matrix(c * scale, -s * scale * ratio, -s * scale, -c * scale * ratio, x, y));
            return;
        }

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
    private async ensureGargantuanImpactTexture(): Promise<void> {
        if (this.gargantuanImpactFrames) return;
        const url = images.vfx_gargantuan_stone_impact_v1_atlas;
        try {
            const atlas = await Assets.load<Texture>(url);
            if (this.destroyed) {
                void Assets.unload(url).catch(() => undefined);
                return;
            }
            this.loadedProjectileUrls.add(url);
            atlas.source.scaleMode = "linear";
            const size = GARGANTUAN_IMPACT_FRAME_SIZE;
            this.gargantuanImpactFrames ??= GARGANTUAN_IMPACT_DURATIONS.map(
                (_, i) =>
                    new Texture({
                        source: atlas.source,
                        frame: new Rectangle((i % 4) * size, Math.floor(i / 4) * size, size, size),
                    }),
            );
        } catch {
            // A missing optional effect must not delay the hit or replace painted debris with particles.
        }
    }
    private spawnCyclopsImpact(p: IProjectile): void {
        if (p.cyclopsImpactMode === "engine") {
            this.cyclopsFracture ??= new CyclopsStoneFracture((object, z) => this.context.attachToWorldRoot(object, z));
            this.cyclopsFracture.spawn(p.cyclopsImpactPosition ?? { x: p.to.x, y: p.to.y - p.cell * 0.3 }, p.cell);
            return;
        }
        if (!this.gargantuanImpactFrames) {
            this.spawnRockImpact(p, false);
            return;
        }
        const sprite = new Sprite(this.gargantuanImpactFrames[0]);
        sprite.anchor.set(0.5, GARGANTUAN_IMPACT_ANCHOR_Y);
        const scale = (p.cell * CYCLOPS_IMPACT_AREA_CELLS) / GARGANTUAN_IMPACT_PAINTED_EXTENT;
        sprite.scale.set(scale, -scale);
        const contact = p.cyclopsImpactPosition ?? { x: p.to.x, y: p.to.y - p.cell * 0.3 };
        sprite.position.set(contact.x, contact.y);
        this.context.attachToWorldRoot(sprite, PROJECTILE_Z + 2);
        this.cyclopsImpacts.push({ sprite, elapsedMs: 0 });
    }
    private updateCyclopsImpacts(dt: number): void {
        for (let i = this.cyclopsImpacts.length - 1; i >= 0; i--) {
            const impact = this.cyclopsImpacts[i];
            impact.elapsedMs += dt * 4000;
            const frame = cyclopsImpactFrame(impact.elapsedMs);
            if (frame < 0) {
                impact.sprite.destroy();
                this.cyclopsImpacts.splice(i, 1);
            } else if (this.gargantuanImpactFrames) {
                impact.sprite.texture = this.gargantuanImpactFrames[frame];
            }
        }
    }
    private spawnGargantuanImpact(p: IProjectile): void {
        this.cyclopsFracture ??= new CyclopsStoneFracture((object, z) => this.context.attachToWorldRoot(object, z));
        this.cyclopsFracture.spawn(p.gargantuanImpactPosition ?? p.to, p.cell);
    }
    private async ensureCannonExplosionTexture(): Promise<void> {
        if (this.cannonExplosionFrames) return;
        const url = images.vfx_tsar_cannon_impact_v19_atlas;
        try {
            const atlas = await Assets.load<Texture>(url);
            if (this.destroyed) {
                void Assets.unload(url).catch(() => undefined);
                return;
            }
            this.loadedProjectileUrls.add(url);
            this.cannonExplosionFrames ??= Array.from(
                { length: 16 },
                (_, i) =>
                    new Texture({
                        source: atlas.source,
                        frame: new Rectangle((i % 4) * 320, Math.floor(i / 4) * 320, 320, 320),
                    }),
            );
        } catch {
            // Missing optional VFX must never interrupt combat or manufacture a delayed impact.
        }
    }
    private spawnCannonExplosion(p: IProjectile): void {
        if (!this.cannonExplosionFrames) return;
        const sprite = this.makeDirectionalSprite(
            this.cannonExplosionFrames[0],
            p.cell * 2.8 * CANNON_EXPLOSION_RADIUS_SCALE,
        );
        sprite.scale.y *= -1;
        const contact = p.cannonImpactPosition ?? p.to;
        sprite.position.set(contact.x, contact.y);
        this.context.attachToWorldRoot(sprite, PROJECTILE_Z + 3);
        this.fitCannonExplosionArtwork(sprite);
        this.cannonExplosions.push({ sprite, elapsedMs: 0 });
    }
    private fitCannonExplosionArtwork(sprite: Sprite): void {
        // The board camera fits X and Y separately. Fire/smoke is upright artwork, not a floor decal.
        let x = 1;
        let y = 1;
        for (let parent = sprite.parent; parent; parent = parent.parent) {
            x *= Math.abs(parent.scale.x);
            y *= Math.abs(parent.scale.y);
        }
        sprite.scale.y = -Math.abs(sprite.scale.x) * (y > 0 ? x / y : 1);
    }
    private updateCannonExplosions(dt: number): void {
        for (let index = this.cannonExplosions.length - 1; index >= 0; index--) {
            const explosion = this.cannonExplosions[index];
            explosion.elapsedMs += dt * 4000 * CANNON_EXPLOSION_SPEED_MULTIPLIER;
            const frame = cannonExplosionFrame(explosion.elapsedMs);
            if (frame < 0) {
                explosion.sprite.destroy();
                this.cannonExplosions.splice(index, 1);
            } else if (this.cannonExplosionFrames) {
                explosion.sprite.texture = this.cannonExplosionFrames[frame];
                this.fitCannonExplosionArtwork(explosion.sprite);
            }
        }
    }
    private drawMonkLabOrb(p: IProjectile, x: number, y: number): void {
        const r = p.monkLabOrbRadius!;
        const pulse = 0.9 + 0.1 * Math.cos(p.spin * 0.2);
        // Same lime/gold halo falloff as the held ball; concentric thin bands avoid stacked opacity.
        for (let i = 30; i >= 1; i--) {
            const radius = (r * 3.88 * i) / 30;
            const d = ((radius / r) * 34) / 0.8;
            const taper = Math.max(0, Math.min(1, (165 - d) / 40));
            const alpha =
                Math.min(0.98, 0.9 * Math.exp(-((d / 84) ** 2)) + 0.65 * Math.exp(-((d / 43) ** 2))) * taper * pulse;
            p.g.circle(x, y, radius).stroke({ width: (r * 3.88) / 30 + 0.05, color: 0xc3ef42, alpha });
        }
        p.g.circle(x, y, r).fill({ color: 0x8ebf20, alpha: 1 });
        p.g.circle(x - r * 0.15, y + r * 0.12, r * 0.78).fill({ color: 0xd9f777, alpha: 0.95 });
        for (let i = 0; i < 4; i++) {
            const a = p.spin * 0.35 + i * 1.7;
            p.g
                .ellipse(x + Math.cos(a) * r * 0.16, y + Math.sin(a) * r * 0.16, r * 0.77, r * (0.26 + 0.08 * i))
                .stroke({ width: Math.max(0.3, r * 0.12), color: i % 2 ? 0xfaffca : 0x77b51e, alpha: 0.8 });
        }
        p.g.circle(x - r * 0.28, y + r * 0.3, r * 0.23).fill({ color: 0xffffdf, alpha: 0.96 });
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
    private makeOrcThrowingAxeSprite(
        cell: number,
        appearance?: IFireProjectileOptions["orcAppearance"],
    ): Sprite | undefined {
        if (!this.orcThrowingAxeTexture) return undefined;
        const sprite = new Sprite(this.orcThrowingAxeTexture);
        // Flight starts with the grip at the hand, then spins about the weapon centre.
        sprite.anchor.set(0.5);
        const scale = (appearance?.length ?? cell * 1.1) / Math.max(1, this.orcThrowingAxeTexture.width);
        sprite.scale.set(scale * (appearance?.facing ?? 1), -scale);
        return sprite;
    }
    private drawOrcThrowingAxe(p: IProjectile, x: number, y: number): void {
        const sprite = p.sprite!;
        if (!sprite.parent) this.context.attachToWorldRoot(sprite, PROJECTILE_Z);
        sprite.position.set(x, y);
        sprite.rotation = (p.orcAppearance?.rotation ?? p.angle) + p.spin * (p.orcAppearance?.facing ?? 1);
        sprite.visible = true;
    }
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
        const r = (p.chakramDiameter ?? p.cell * CHAKRAM_RADIUS_FACTOR * 2) / 2;
        if (p.sprite) {
            if (!p.sprite.parent) this.context.attachToWorldRoot(p.sprite, PROJECTILE_Z);
            p.sprite.position.set(x, y);
            p.sprite.rotation = p.spin;
            if (this.zenaChakramSparkFrames?.length) {
                // spin advances 22.5 rad per real second; painted sparks animate at 20 fps.
                const frame = Math.floor((p.spin / 22.5) * 20) % this.zenaChakramSparkFrames.length;
                p.sprite.texture = this.zenaChakramSparkFrames[frame];
            }
            return;
        }

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
        this.drawChakramRimSparks(p, x, y, r);
    }
    private drawChakramRimSparks(p: IProjectile, x: number, y: number, r: number): void {
        const g = p.g;
        // A complete luminous rim, with hot spark segments travelling around the circle.
        g.zIndex = PROJECTILE_Z + 1;
        g.circle(x, y, r).stroke({ width: Math.max(3, r * 0.26), color: 0xffa020, alpha: 0.25 });
        g.circle(x, y, r).stroke({ width: Math.max(1.2, r * 0.075), color: 0xffd65a, alpha: 0.9 });
        for (let i = 0; i < 36; i++) {
            const angle = p.spin + (i * Math.PI * 2) / 36;
            const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(p.spin * 0.7 + i * 1.7));
            const radius = r * (1 + 0.025 * Math.sin(i * 2.4 + p.spin));
            const sx = x + Math.cos(angle) * radius;
            const sy = y + Math.sin(angle) * radius;
            const endAngle = angle + 0.1 + pulse * 0.15;
            g.moveTo(sx, sy)
                .arc(x, y, radius, angle, endAngle)
                .stroke({ width: Math.max(1, r * 0.07), color: 0xfff5c0, alpha: pulse });
            if (i % 2 === 0) {
                const outer = r * (1.1 + pulse * 0.16);
                const ex = x + Math.cos(endAngle) * outer;
                const ey = y + Math.sin(endAngle) * outer;
                g.moveTo(sx, sy)
                    .lineTo(ex, ey)
                    .stroke({ width: Math.max(0.8, r * 0.045), color: 0xffd65a, alpha: pulse });
                g.circle(sx, sy, Math.max(0.8, r * 0.04)).fill({ color: 0xfffbe5, alpha: pulse });
            }
        }
    }
}
