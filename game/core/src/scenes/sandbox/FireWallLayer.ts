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
 * must not walk into by accident. It is drawn in three passes per cell: an additive heat glow underneath, a
 * fan of flame tongues that wobble on their own per-cell phase, and embers rising off the top. Everything is
 * seeded per cell so neighbouring cells never animate in lockstep (which would read as one flat band) but an
 * individual cell never flickers between frames either.
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

/** Flame tongues per cell, and embers rising off each cell. */
const TONGUES = 5;
const EMBERS = 3;

interface IFireVisual {
    cell: HoCMath.XY;
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
     * Sync to the authoritative cell list and advance the animations.
     *
     * `cells` is the whole truth: anything present catches fire, anything that disappeared burns out. The
     * engine owns lifetime — this layer never expires a wall on its own.
     */
    public update(dt: number, cells: readonly IFireWallCell[], cellSize: number, toWorld: ToWorld): void {
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
            } else {
                this.visuals.set(key, {
                    cell: { x: cell.x, y: cell.y },
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

        this.redraw(cellSize, toWorld);
    }
    private redraw(cellSize: number, toWorld: ToWorld): void {
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
            const pos = toWorld(visual.cell);
            if (!pos) {
                continue;
            }

            const localCellSize = pos.cellSize ?? cellSize;
            const isLastLap = visual.lapsRemaining <= 1;
            const half = localCellSize * 0.5;
            const life = visual.life;
            // The whole cell breathes on its own phase, so a 3-cell wall never pulses as one block.
            const breath = 0.82 + 0.18 * Math.sin(this.time * 6.1 + visual.phase);
            const height = half * (isLastLap ? 0.72 : 1.12) * life * breath;
            const alpha = life * (isLastLap ? 0.6 : 0.95);
            const hot = isLastLap ? DYING_ORANGE : FLAME_ORANGE;

            // 1. Heat glow: two additive discs, the inner one hotter. Cheap, and it is what makes a run of
            //    burning cells read as a continuous wall rather than three separate campfires.
            glow.circle(pos.x, pos.y, half * 0.95 * life * breath).fill({
                color: EMBER_RED,
                alpha: alpha * 0.34,
            });
            glow.circle(pos.x, pos.y + half * 0.12, half * 0.52 * life * breath).fill({
                color: hot,
                alpha: alpha * 0.38,
            });

            // 2. Flame tongues: each one a tapering curve leaning on its own wobble, fanned across the cell.
            for (let i = 0; i < TONGUES; i++) {
                const spread = (i / (TONGUES - 1) - 0.5) * 2; // -1..1 across the cell
                const tongueSeed = FireWallLayer.seed(key, i + 2);
                const wobble =
                    Math.sin(this.time * (4.3 + tongueSeed * 2.6) + visual.phase + i) * localCellSize * 0.07;
                const baseX = pos.x + spread * half * 0.72;
                const baseY = pos.y + half * 0.34;
                // Middle tongues stand tallest, so the cell silhouettes as a flame rather than a hedge.
                const tongueHeight = height * (0.55 + 0.45 * (1 - Math.abs(spread))) * (0.75 + tongueSeed * 0.5);
                const tipX = baseX + wobble;
                const tipY = baseY - tongueHeight;
                const width = localCellSize * 0.15 * (0.6 + tongueSeed * 0.6) * life;

                // Outer, cooler body of the tongue.
                flames
                    .moveTo(baseX - width, baseY)
                    .quadraticCurveTo(baseX - width * 0.4 + wobble * 0.5, baseY - tongueHeight * 0.55, tipX, tipY)
                    .quadraticCurveTo(
                        baseX + width * 0.4 + wobble * 0.5,
                        baseY - tongueHeight * 0.55,
                        baseX + width,
                        baseY,
                    )
                    .closePath()
                    .fill({ color: hot, alpha: alpha * 0.8 });

                // Hot inner sliver, shorter and narrower — the bit that sells it as fire and not orange paint.
                const innerW = width * 0.42;
                const innerH = tongueHeight * 0.62;
                flames
                    .moveTo(baseX - innerW, baseY)
                    .quadraticCurveTo(baseX + wobble * 0.4, baseY - innerH * 0.6, baseX + wobble * 0.6, baseY - innerH)
                    .quadraticCurveTo(baseX + innerW * 0.6, baseY - innerH * 0.5, baseX + innerW, baseY)
                    .closePath()
                    .fill({ color: isLastLap ? FLAME_ORANGE : FLAME_YELLOW, alpha: alpha * 0.85 });
            }

            // 3. Embers drifting up out of the flames. Each rides its own looping 0..1 ramp, so they leave the
            //    cell at different times and the wall keeps shedding sparks instead of pulsing them in unison.
            if (!isLastLap || life > 0.5) {
                for (let i = 0; i < EMBERS; i++) {
                    const emberSeed = FireWallLayer.seed(key, i + 12);
                    const t = (this.time * (0.55 + emberSeed * 0.5) + emberSeed) % 1;
                    const driftX = Math.sin(this.time * 2.1 + emberSeed * 9.4) * localCellSize * 0.16;
                    const ex = pos.x + (emberSeed - 0.5) * localCellSize * 0.6 + driftX * t;
                    const ey = pos.y + half * 0.3 - t * (height + half * 0.5);
                    const fade = (1 - t) * alpha * 0.9;
                    flames
                        .circle(ex, ey, localCellSize * 0.035 * (1 - t * 0.6) * life)
                        .fill({ color: t < 0.45 ? FLAME_CORE : FLAME_YELLOW, alpha: fade });
                }
            }

            // 4. A charred base line so the cell still reads as "on fire" even at the bottom of the ignite
            //    animation, before any tongue is tall enough to be visible.
            flames
                .rect(pos.x - half * 0.78, pos.y + half * 0.3, half * 1.56, localCellSize * 0.06)
                .fill({ color: EMBER_RED, alpha: alpha * 0.55 });
        }
    }
    public destroy(): void {
        this.visuals.clear();
        this.container.destroy({ children: true });
    }
}
