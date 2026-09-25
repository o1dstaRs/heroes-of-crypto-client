import { Container, Graphics } from "pixi.js";

import type { HoCMath } from "@heroesofcrypto/common";

/**
 * The burning cells laid down by Fire Wall (the Nightmare's Book of Nightmares).
 *
 * Driven straight off the authoritative `FightProperties.fireWalls` store rather than off the
 * fire_wall_placed/fire_wall_expired events — the same choice SmokeCloudLayer and VineLayer make, and for the
 * same reason: that store rides the fight snapshot, so the ranked client already has it without replaying
 * anything, and sandbox and ranked share one code path.
 *
 * Visually this is the loudest of the three ground effects, which is the point — the wall is the one a player
 * must not walk into by accident. It is drawn in four passes per cell: an additive heat glow pooled on the
 * ground, a fan of flame tongues, embers rising off the top, and the bed of coals they stand in. Everything
 * is seeded per cell so neighbouring cells never animate in lockstep (which would read as one flat band) but
 * an individual cell never flickers between frames either.
 *
 * Three rules keep it from reading as drawn rather than burning, and they are the whole reason the shapes
 * here are as fussy as they are:
 *   - NOTHING IS ON ONE RATE. Every wobble sums two sines whose ratio is irrational, so no motion repeats on
 *     a period the eye can catch. A single sine is instantly recognisable as machinery.
 *   - NOTHING IS SYMMETRIC OR EVENLY SPACED. Tongue count, spacing, root depth, both shoulders of every
 *     curve and the height of each cell's crest all come off the cell seed. An even fan of identical leaves
 *     was what made a 4-cell wall look like four copies of one clump.
 *   - THE WALL SHARES ITS AIR. One draught term, `windAt`, leans every cell the same way at the same moment,
 *     and leans each flame more the further it is from its root. Independent per-cell lean is what made a
 *     row of cells read as separate campfires instead of one burning line.
 *
 * A cell on its last lap burns visibly low — shorter tongues, fewer embers, redder and dimmer — which is the
 * player's warning that the wall is about to go out.
 */

/** One burning cell as the engine reports it: board cell + laps of life left. */
export interface IFireWallCell {
    x: number;
    y: number;
    l: number;
}

type ToWorld = (cell: HoCMath.XY) => (HoCMath.XY & { cellSize?: number }) | undefined;

/** Seconds a wall takes to catch when cast, and to burn down once the engine drops it. */
const IGNITE_SECONDS = 0.32;
const BURNOUT_SECONDS = 0.26;

/** Flame palette, coolest (the outer heat haze) to hottest (the core). */
const EMBER_RED = 0x7a1500;
const FLAME_ORANGE = 0xff6a00;
const FLAME_YELLOW = 0xffd04a;
const FLAME_CORE = 0xfff2c4;
/** The colour the fire fades toward on its last lap: mostly spent embers. */
const DYING_ORANGE = 0xc23a00;

/**
 * Flame tongues per cell, and embers rising off each cell.
 *
 * The tongue count is a RANGE, not a constant: a fixed fan gave every cell the same silhouette, so a 4-cell
 * wall read as four copies of one clump. Each cell picks its own count from its seed and keeps it for life.
 */
const MIN_TONGUES = 4;
const MAX_TONGUES = 7;
const EMBERS = 3;

interface IFireVisual {
    cell: HoCMath.XY;
    x: number;
    y: number;
    cellSize: number;
    /** Base grid size used when the cached world projection was resolved. */
    projectionCellSize: number;
    /** 0..1 catch-fire / burn-down progress. */
    life: number;
    /** True while the authoritative store reports this cell during the current reconciliation. */
    alive: boolean;
    /** True once the engine stopped reporting this cell — animate out, then drop. */
    dying: boolean;
    lapsRemaining: number;
    phase: number;
}

export class FireWallLayer {
    private readonly container = new Container();
    /** Heat haze, drawn additively so overlapping cells pool into a brighter band along the wall. */
    private readonly glow = new Graphics();
    /** The flames and embers themselves, drawn normally on top of the glow. */
    private readonly flames = new Graphics();
    private readonly visuals = new Map<number, IFireVisual>();
    private time = 0;
    /** Avoid repeatedly invalidating both Graphics buffers after the last wall burns out. */
    private hasGeometry = false;
    public constructor() {
        this.glow.blendMode = "add";
        this.container.addChild(this.glow);
        this.container.addChild(this.flames);
    }
    public getContainer(): Container {
        return this.container;
    }
    private static key(cell: { x: number; y: number }): number {
        return (cell.x << 8) | (cell.y & 0xff);
    }
    /** Stable per-cell pseudo-random in 0..1 — keeps each cell's flame shape fixed across frames. */
    private static seed(key: number, salt: number): number {
        const x = Math.sin(key * 73.17 + salt * 19.31 + 1.77) * 37619.4271;
        return x - Math.floor(x);
    }
    /**
     * Two sines at deliberately incommensurate rates, summed to -1..1.
     *
     * A single sine is what made the old flames read as mechanical: every tongue swept left-right on an
     * obvious loop, and the eye locks onto that period immediately. Summing two rates whose ratio is
     * irrational never repeats on any interval a player can perceive, which is what fire actually looks
     * like, and it costs one extra sine per use.
     */
    private static wobble(t: number, phase: number, rate: number): number {
        return 0.62 * Math.sin(t * rate + phase) + 0.38 * Math.sin(t * rate * 1.618 + phase * 1.7 + 1.3);
    }
    /**
     * The draught blowing along the whole wall, -1..1, shared by every cell.
     *
     * Real fire on open ground leans together: gusts are far wider than a 2-metre cell, so neighbouring
     * flames agree about which way the air is moving even while each one flickers on its own. Giving every
     * cell an independent lean is the single biggest reason a row of procedural flames reads as separate
     * campfires instead of one burning line.
     */
    private windAt(): number {
        return 0.6 * Math.sin(this.time * 0.63) + 0.4 * Math.sin(this.time * 0.29 + 1.1);
    }
    /**
     * Sync to the authoritative cell list and advance the animations.
     *
     * `cells` is the whole truth: anything present catches fire, anything that disappeared burns out. The
     * engine owns lifetime — this layer never expires a wall on its own.
     */
    public update(dt: number, cells: readonly IFireWallCell[], cellSize: number, toWorld: ToWorld): void {
        // Fire Wall is absent for most of a match. Leave its clock and both Graphics buffers completely
        // dormant until an authoritative cell exists or an old wall is still burning out.
        if (!cells.length && !this.visuals.size) return;
        this.time += dt;

        for (const visual of this.visuals.values()) {
            visual.alive = false;
        }
        for (const cell of cells) {
            const key = FireWallLayer.key(cell);
            const existing = this.visuals.get(key);
            if (existing) {
                existing.alive = true;
                existing.dying = false;
                existing.lapsRemaining = cell.l;
                if (existing.projectionCellSize !== cellSize) {
                    const world = toWorld(cell);
                    if (world) {
                        existing.x = world.x;
                        existing.y = world.y;
                        existing.cellSize = world.cellSize ?? cellSize;
                        existing.projectionCellSize = cellSize;
                    }
                }
            } else {
                const world = toWorld(cell);
                if (!world) {
                    continue;
                }
                this.visuals.set(key, {
                    cell: { x: cell.x, y: cell.y },
                    x: world.x,
                    y: world.y,
                    cellSize: world.cellSize ?? cellSize,
                    projectionCellSize: cellSize,
                    life: 0,
                    alive: true,
                    dying: false,
                    lapsRemaining: cell.l,
                    phase: FireWallLayer.seed(key, 1) * Math.PI * 2,
                });
            }
        }

        for (const [key, visual] of this.visuals) {
            if (!visual.alive) {
                visual.dying = true;
            }
            const rate = visual.dying ? -dt / BURNOUT_SECONDS : dt / IGNITE_SECONDS;
            visual.life = Math.min(1, Math.max(0, visual.life + rate));
            if (visual.dying && visual.life <= 0) {
                this.visuals.delete(key);
            }
        }

        this.redraw();
    }
    private redraw(): void {
        const glow = this.glow;
        const flames = this.flames;
        if (!this.visuals.size) {
            if (this.hasGeometry) {
                glow.clear();
                flames.clear();
                this.hasGeometry = false;
            }
            return;
        }
        glow.clear();
        flames.clear();
        this.hasGeometry = true;

        for (const [key, visual] of this.visuals) {
            const pos = visual;
            const localCellSize = visual.cellSize;
            const isLastLap = visual.lapsRemaining <= 1;
            const half = localCellSize * 0.5;
            const life = visual.life;
            // The whole cell breathes on its own phase, so a 4-cell wall never pulses as one block. Two
            // rates rather than one: a slow swell with a faster flicker riding it, which is how a real
            // flame's brightness behaves — it never settles into a hum.
            const breath =
                0.82 +
                0.13 * FireWallLayer.wobble(this.time, visual.phase, 6.1) +
                0.05 * Math.sin(this.time * 14.7 + visual.phase * 2.3);
            // Each cell burns a little taller or shorter than its neighbours and keeps that for life, so the
            // top of the wall is a ragged crest instead of one ruled line.
            const crest = 0.82 + FireWallLayer.seed(key, 31) * 0.36;
            const height = half * (isLastLap ? 0.72 : 1.12) * life * breath * crest;
            const alpha = life * (isLastLap ? 0.6 : 0.95);
            const hot = isLastLap ? DYING_ORANGE : FLAME_ORANGE;
            // The draught, shared along the wall, plus a little per-cell disagreement so the lean is not
            // perfectly rigid either. A dying cell is pushed around more easily than a full-strength one.
            const wind =
                (this.windAt() * 0.8 + FireWallLayer.wobble(this.time, visual.phase * 2.1, 1.7) * 0.2) *
                (isLastLap ? 1.35 : 1);

            // 1. Heat glow: two additive pools, the inner one hotter. Cheap, and it is what makes a run of
            //    burning cells read as a continuous wall rather than separate campfires. Ellipses, not
            //    discs — heat spills sideways along the ground far more than it stacks upward, and a
            //    circle put a visible halo above each cell that looked like a lamp rather than a fire.
            glow.ellipse(pos.x, pos.y + half * 0.1, half * 1.12 * life * breath, half * 0.66 * life * breath).fill({
                color: EMBER_RED,
                alpha: alpha * 0.34,
            });
            glow.ellipse(
                pos.x + wind * half * 0.1,
                pos.y + half * 0.14,
                half * 0.58 * life * breath,
                half * 0.4 * life * breath,
            ).fill({
                color: hot,
                alpha: alpha * 0.38,
            });

            // 2. Flame tongues: each one a tapering curve leaning on the draught and its own wobble.
            //    The count, the spacing and the shape all come off the cell's seed, so no two cells in a
            //    wall silhouette alike and none of them is symmetric.
            const tongues = MIN_TONGUES + Math.floor(FireWallLayer.seed(key, 41) * (MAX_TONGUES - MIN_TONGUES + 1));
            for (let i = 0; i < tongues; i++) {
                const tongueSeed = FireWallLayer.seed(key, i + 2);
                const placeSeed = FireWallLayer.seed(key, i + 53);
                // Evenly fanned, then nudged off the grid by up to a third of a slot. An exactly even fan is
                // the tell that this is drawn rather than burning.
                const slot = tongues === 1 ? 0 : (i / (tongues - 1) - 0.5) * 2; // -1..1 across the cell
                const spread = slot + (placeSeed - 0.5) * (0.66 / Math.max(1, tongues - 1)) * 2;
                const wobble =
                    FireWallLayer.wobble(this.time, visual.phase + i * 1.9, 4.3 + tongueSeed * 2.6) *
                    localCellSize *
                    0.075;
                const baseX = pos.x + spread * half * 0.72;
                // Stagger the roots slightly in depth too, so the bases do not all sit on one ruled line.
                const baseY = pos.y + half * (0.3 + placeSeed * 0.09);
                // Middle tongues stand tallest, so the cell silhouettes as a flame rather than a hedge.
                const tongueHeight = height * (0.55 + 0.45 * (1 - Math.abs(spread))) * (0.75 + tongueSeed * 0.5);
                // A flame leans more the further it gets from its root: the tip is in moving air, the base
                // is anchored in the fuel. Scaling the lean by height is what turns a wobble into a lean.
                const lean = wind * tongueHeight * 0.28;
                const tipX = baseX + wobble + lean;
                const tipY = baseY - tongueHeight;
                const width = localCellSize * 0.15 * (0.6 + tongueSeed * 0.6) * life;
                // Independent left and right shoulders. Sharing one control point mirrored the curve and
                // gave every tongue the same leaf shape; real ones are lopsided.
                const leftBulge = 0.28 + tongueSeed * 0.34;
                const rightBulge = 0.28 + placeSeed * 0.34;

                // Outer, cooler body of the tongue.
                flames
                    .moveTo(baseX - width, baseY)
                    .quadraticCurveTo(
                        baseX - width * leftBulge + (wobble + lean) * 0.5,
                        baseY - tongueHeight * (0.48 + tongueSeed * 0.16),
                        tipX,
                        tipY,
                    )
                    .quadraticCurveTo(
                        baseX + width * rightBulge + (wobble + lean) * 0.5,
                        baseY - tongueHeight * (0.48 + placeSeed * 0.16),
                        baseX + width,
                        baseY,
                    )
                    .closePath()
                    .fill({ color: hot, alpha: alpha * 0.8 });

                // Hot inner sliver, shorter and narrower — the bit that sells it as fire and not orange paint.
                const innerW = width * 0.42;
                const innerH = tongueHeight * 0.62;
                const innerLean = wind * innerH * 0.24;
                flames
                    .moveTo(baseX - innerW, baseY)
                    .quadraticCurveTo(
                        baseX + wobble * 0.4 + innerLean * 0.5,
                        baseY - innerH * 0.6,
                        baseX + wobble * 0.6 + innerLean,
                        baseY - innerH,
                    )
                    .quadraticCurveTo(baseX + innerW * 0.6, baseY - innerH * 0.5, baseX + innerW, baseY)
                    .closePath()
                    .fill({ color: isLastLap ? FLAME_ORANGE : FLAME_YELLOW, alpha: alpha * 0.85 });

                // Every so often a tip pinches off and rises as its own teardrop before burning out. Fire
                // sheds its tips constantly; flames that stay attached for their whole life look like cloth.
                if (!isLastLap && tongueHeight > half * 0.35) {
                    const shedT = (this.time * (0.5 + tongueSeed * 0.45) + tongueSeed * 7.3) % 1;
                    if (shedT < 0.55) {
                        const rise = shedT / 0.55;
                        const shedY = tipY - rise * tongueHeight * 0.55;
                        const shedR = width * 0.4 * (1 - rise * 0.75);
                        flames
                            .ellipse(tipX + wind * tongueHeight * 0.16 * rise, shedY, shedR * 0.8, shedR * 1.25)
                            .fill({ color: FLAME_YELLOW, alpha: alpha * 0.5 * (1 - rise) });
                    }
                }
            }

            // 3. Embers drifting up out of the flames. Each rides its own looping 0..1 ramp, so they leave the
            //    cell at different times and the wall keeps shedding sparks instead of pulsing them in unison.
            if (!isLastLap || life > 0.5) {
                for (let i = 0; i < EMBERS; i++) {
                    const emberSeed = FireWallLayer.seed(key, i + 12);
                    const t = (this.time * (0.55 + emberSeed * 0.5) + emberSeed) % 1;
                    const driftX = FireWallLayer.wobble(this.time, emberSeed * 9.4, 2.1) * localCellSize * 0.16;
                    // An ember is a loose particle, so the draught owns it far more than it owns a rooted
                    // tongue, and it keeps accelerating downwind the higher and lighter it gets.
                    const carried = wind * localCellSize * 0.42 * t * t;
                    const ex = pos.x + (emberSeed - 0.5) * localCellSize * 0.6 + driftX * t + carried;
                    const ey = pos.y + half * 0.3 - t * (height + half * 0.5);
                    // Embers cool as they climb: core white at the flame, deep ember red by the time they go
                    // out. Snapping between two colours mid-flight was a visible pop.
                    const fade = (1 - t) * alpha * 0.9;
                    flames
                        .circle(ex, ey, localCellSize * 0.035 * (1 - t * 0.6) * life)
                        .fill({ color: t < 0.3 ? FLAME_CORE : t < 0.68 ? FLAME_YELLOW : EMBER_RED, alpha: fade });
                }
            }

            // 4. The bed of burning fuel, so the cell still reads as "on fire" even at the bottom of the
            //    ignite animation, before any tongue is tall enough to be visible. This used to be a single
            //    rect, and a crisp horizontal edge with square corners was the most artificial thing on the
            //    board — nothing about a fire is axis-aligned. Three overlapping ellipses of different
            //    sizes and heats give it a ragged, glowing edge for the same handful of draw calls.
            for (let i = 0; i < 3; i++) {
                const bedSeed = FireWallLayer.seed(key, i + 71);
                const bedX = pos.x + (bedSeed - 0.5) * half * 0.9;
                const bedY = pos.y + half * (0.3 + (i % 2) * 0.035);
                const bedW = half * (0.34 + bedSeed * 0.3);
                // The bed itself pulses gently, a beat behind the flames above it, like coals drawing air.
                const bedPulse = 0.85 + 0.15 * Math.sin(this.time * 3.3 + visual.phase + i);
                flames.ellipse(bedX, bedY, bedW * bedPulse, localCellSize * 0.042 * bedPulse).fill({
                    color: i === 1 ? hot : EMBER_RED,
                    alpha: alpha * (i === 1 ? 0.4 : 0.55),
                });
            }
        }
    }
    public destroy(): void {
        this.visuals.clear();
        this.container.destroy({ children: true });
    }
}
