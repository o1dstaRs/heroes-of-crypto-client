import { Container, Graphics } from "pixi.js";

import type { HoCMath } from "@heroesofcrypto/common";

/**
 * Vines laid down by Vine Throw (Trent's own ability).
 *
 * Driven straight off the authoritative `FightProperties.vines` store rather than off the
 * vine_placed/vine_expired events — the same choice SmokeCloudLayer makes, and for the same reason: that
 * store rides the fight snapshot, so the ranked client already has it without replaying anything, and
 * sandbox and ranked share one code path.
 *
 * The visual problem here is the opposite of the smoke bank next door. Smoke is volumetric, so that layer
 * draws per-cell blobs and tears their outlines apart with an fBM shader. A vine is LINEAR and continuous:
 * drawing each cell independently is exactly what makes it read as "squiggles on tiles" instead of as one
 * creeper thrown across the board. So this layer:
 *
 *   1. re-links the loose cells into CHAINS by adjacency, then runs a Catmull-Rom spline through their
 *      centres, so one throw is one unbroken plant that crosses cell borders without a seam;
 *   2. GROWS along that chain — each cell carries its own presence, and the throw order in the store is
 *      the order the vine creeps outward from the caster, so it snakes toward the victim rather than
 *      popping in everywhere at once;
 *   3. tapers from a thick woody base to a whip-thin tip, and layers dark bark, mid bark, a rim
 *      highlight and a pulsing ember core — the glowing cracks are Trent's own art language;
 *   4. dresses the length with thorns and leaves that flutter on the shared wind, and withers to a dry
 *      yellow-brown on its last lap so the player can read "this is about to let go" off the board.
 *
 * No shader: the smoke layer needs one because a cloud has no silhouette worth preserving. A vine's
 * silhouette IS the effect, and warping it would only fuzz the cell boundaries that carry the movement rule.
 */

/** One vined cell as the engine reports it: board cell + laps of life left. */
export interface IVineCell {
    x: number;
    y: number;
    l: number;
}

/** Resolve a board cell to its world centre; returns undefined for a cell that is off-grid. */
export type ToWorld = (cell: HoCMath.XY) => (HoCMath.XY & { cellSize?: number; cellPoints?: number[] }) | undefined;

/** Seconds a vine takes to creep in when thrown / wither out once the engine drops it. */
const CREEP_SECONDS = 0.42;
const WITHER_SECONDS = 0.5;
/** Per-cell head start along the throw, so the vine creeps outward instead of swelling all at once. */
const CREEP_STAGGER_SECONDS = 0.05;

/** Spline samples per cell-to-cell segment. Enough to read as a curve, cheap at these lengths. */
const SAMPLES_PER_SEGMENT = 7;

/** Interwoven strands in the body. One stroke reads as a cable; three read as plaited wood. */
const STRANDS = 3;

/** Mushroom cap tone — the signature detail on Trent's own art. */
const CAP = 0x5e2038;
const CAP_STEM = 0xbdb08f;

/**
 * Bark browns with a red ember running through them — Trent's own art language, not a green tube. A green
 * body reads as a garden hose; the creature is charred wood with glowing cracks, and the vine is a piece
 * of it. Moss is the only green, and only in small patches.
 */
const BARK_DARK = 0x140d07;
const BARK_MID = 0x3a2716;
const BARK_RIM = 0x6b4d2c;
const MOSS = 0x4a6b2a;
const EMBER_GLOW = 0x8f1f10;
const EMBER_CORE = 0xff4a22;
const DRY_DARK = 0x1a1409;
const DRY_MID = 0x4a3a1c;
const DRY_RIM = 0x8a7340;

interface ITrackedVine {
    cell: HoCMath.XY;
    x: number;
    y: number;
    cellSize: number;
    /** Base grid size used when the cached world projection was resolved. */
    projectionCellSize: number;
    cellPoints?: number[];
    /** Stable per-cell seed so a vine's wobble and thorns never flicker between frames. */
    seed: number;
    lapsRemaining: number;
    /** 0..1 creep-in, then back to 0 on the way out. */
    presence: number;
    /** The engine still lists this cell; false starts the wither. */
    alive: boolean;
    /** Position in the store's iteration order — the throw order, so growth sweeps outward. */
    order: number;
    /**
     * Seconds this cell waits before it starts to creep, so the vine snakes outward from the caster.
     * Assigned once from the cell's rank WITHIN ITS OWN THROW — a global index would keep growing across
     * casts and a later throw would sit invisible behind an ever-longer delay.
     */
    delay: number;
    /** Time the cell was first reported, so the creep is measured from its own arrival. */
    firstSeen: number;
}

interface ISamplePoint {
    x: number;
    y: number;
    /** 0..1 along the whole chain, used for taper. */
    t: number;
    /** Interpolated presence of the cells this sample sits between. */
    presence: number;
    /** True once the chain has withered past this point on its last lap. */
    dry: boolean;
}

const hash = (a: number, b: number): number => {
    const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return x - Math.floor(x);
};

export class VineLayer {
    private readonly container = new Container();
    private readonly graphics = new Graphics();
    private time = 0;
    /**
     * Breeze shared by every vine so the whole board stirs as one air mass rather than each cell inventing
     * its own gust. Two incommensurable sines, so it never settles into a visible loop. Much gentler than
     * the smoke layer's wind — this is woody, it bends, it does not billow.
     */
    private windX = 1;
    private windY = 0;
    private readonly vines = new Map<number, ITrackedVine>();
    /** Connectivity changes only when cells arrive, expire, or their authoritative throw order changes. */
    private chains: ITrackedVine[][] = [];
    private topologyDirty = true;
    /** Avoid repeatedly invalidating an already-empty Pixi Graphics buffer. */
    private hasGeometry = false;
    /** Reused while drawing each chain to avoid short-lived sample and strand arrays every frame. */
    private readonly sampleScratch: ISamplePoint[] = [];
    private readonly grownScratch: ISamplePoint[] = [];
    private readonly wovenScratch: [ISamplePoint[], ISamplePoint[], ISamplePoint[], ISamplePoint[]] = [[], [], [], []];
    public constructor() {
        this.container.addChild(this.graphics);
    }
    public getContainer(): Container {
        return this.container;
    }
    private static key(cell: { x: number; y: number }): number {
        return (cell.x << 8) | (cell.y & 0xff);
    }
    /**
     * Reconcile against the authoritative cell list and advance the animation.
     *
     * `cells` is the engine's truth for THIS frame, in throw order. Anything it stops listing withers
     * rather than vanishing on the spot.
     */
    public update(dt: number, cells: readonly IVineCell[], cellSize: number, toWorld: ToWorld): void {
        // Vines are uncommon. Leave the idle layer completely dormant until one exists or is withering.
        if (!cells.length && !this.vines.size) return;
        this.time += dt;
        const windAngle = Math.sin(this.time * 0.037) * 0.8 + Math.sin(this.time * 0.017 + 1.7) * 0.45;
        const windSpeed = 0.55 + 0.25 * Math.sin(this.time * 0.09 + 0.4);
        this.windX = Math.cos(windAngle) * windSpeed;
        this.windY = Math.sin(windAngle) * windSpeed * 0.55;

        for (const vine of this.vines.values()) {
            vine.alive = false;
        }
        // Cells of one throw all arrive in the same frame, so rank within THIS frame's new arrivals is the
        // vine's own base-to-tip order — that is what the creep is staggered by.
        let arrivalsThisFrame = 0;
        for (let index = 0; index < cells.length; index++) {
            const c = cells[index];
            const key = VineLayer.key(c);
            const existing = this.vines.get(key);
            if (existing) {
                existing.alive = true;
                existing.lapsRemaining = c.l;
                if (existing.projectionCellSize !== cellSize) {
                    const world = toWorld(c);
                    if (world) {
                        existing.x = world.x;
                        existing.y = world.y;
                        existing.cellSize = world.cellSize ?? cellSize;
                        existing.cellPoints = world.cellPoints;
                        existing.projectionCellSize = cellSize;
                    }
                }
                if (existing.order !== index) {
                    existing.order = index;
                    this.topologyDirty = true;
                }
                continue;
            }
            const world = toWorld(c);
            if (!world) {
                continue;
            }
            this.vines.set(key, {
                cell: { x: c.x, y: c.y },
                x: world.x,
                y: world.y,
                cellSize: world.cellSize ?? cellSize,
                projectionCellSize: cellSize,
                cellPoints: world.cellPoints,
                // Mixing both axes keeps neighbouring cells from sharing a shape.
                seed: Math.abs(hash(c.x * 1.7, c.y * 2.3)) * 1000,
                lapsRemaining: c.l,
                presence: 0,
                alive: true,
                order: index,
                delay: arrivalsThisFrame++ * CREEP_STAGGER_SECONDS,
                firstSeen: this.time,
            });
            this.topologyDirty = true;
        }

        for (const [key, vine] of this.vines) {
            if (vine.alive) {
                const elapsed = this.time - vine.firstSeen - vine.delay;
                vine.presence = Math.max(0, Math.min(1, elapsed / CREEP_SECONDS));
            } else {
                vine.presence -= dt / WITHER_SECONDS;
                if (vine.presence <= 0) {
                    this.vines.delete(key);
                    this.topologyDirty = true;
                }
            }
        }

        if (this.topologyDirty) {
            this.chains = this.buildChains();
            this.topologyDirty = false;
        }

        this.draw(cellSize);
    }
    /**
     * Re-link the loose cells into chains of 8-adjacent neighbours.
     *
     * The store is a flat set of cells, so connectivity has to be recovered here. Walk from an endpoint
     * (a cell with at most one neighbour) and prefer the lowest throw order, so a chain runs base-to-tip.
     * Two throws that cross share a cell and will be walked as one chain — acceptable: they overlap on the
     * board too, and a single continuous plant reads better than an arbitrary seam.
     */
    private buildChains(): ITrackedVine[][] {
        const byKey = this.vines;
        const neighbours = new Map<number, number[]>();
        for (const [key, vine] of byKey) {
            const found: number[] = [];
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (!dx && !dy) {
                        continue;
                    }
                    const nKey = VineLayer.key({ x: vine.cell.x + dx, y: vine.cell.y + dy });
                    if (byKey.has(nKey)) {
                        found.push(nKey);
                    }
                }
            }
            neighbours.set(key, found);
        }

        const visited = new Set<number>();
        const chains: ITrackedVine[][] = [];
        // Endpoints first (so a chain is walked end-to-end), then anything left in a loop.
        const starts = [...byKey.keys()].sort((a, b) => {
            const da = (neighbours.get(a) ?? []).length;
            const db = (neighbours.get(b) ?? []).length;
            if (da !== db) {
                return da - db;
            }
            return (byKey.get(a)?.order ?? 0) - (byKey.get(b)?.order ?? 0);
        });

        for (const start of starts) {
            if (visited.has(start)) {
                continue;
            }
            const chain: ITrackedVine[] = [];
            let current: number | undefined = start;
            while (current !== undefined && !visited.has(current)) {
                visited.add(current);
                const vine = byKey.get(current);
                if (!vine) {
                    break;
                }
                chain.push(vine);
                // Step to the unvisited neighbour closest in throw order — that is the vine's own direction.
                let next: number | undefined;
                let bestOrder = Number.POSITIVE_INFINITY;
                for (const candidate of neighbours.get(current) ?? []) {
                    if (visited.has(candidate)) {
                        continue;
                    }
                    const order = byKey.get(candidate)?.order ?? Number.POSITIVE_INFINITY;
                    if (order < bestOrder) {
                        bestOrder = order;
                        next = candidate;
                    }
                }
                current = next;
            }
            if (chain.length) {
                chains.push(chain);
            }
        }
        return chains;
    }
    /** Catmull-Rom through the chain's cell centres, with a stable perpendicular wobble. */
    /**
     * Outline every vined cell, for as long as the vine is on the ground.
     *
     * The plant itself is a curve that crosses cell borders, which is what makes it read as one creeper —
     * but it is also exactly what makes the RULE unreadable: a non-flyer pays an extra step per vined CELL,
     * and a spline gives the player no way to tell which tiles those are. So the footprint is stated
     * outright, and kept up the whole time the vine lives rather than only during the cast.
     *
     * Drawn to stay quiet under the plant: corner brackets rather than a full box (a closed rectangle on
     * every cell reads as UI chrome and fights the organic body), a faint wash inside, and a slow breathing
     * pulse so it registers as live terrain without pulling the eye off the fight. It creeps in with the
     * cell's own presence and withers with it, and turns the same dry yellow-brown on the last lap, so the
     * "about to let go" tell the body already carries is on the footprint too.
     */
    private drawCellFootprint(g: Graphics, cellSize: number): void {
        // One shared breath for the whole layer, so the vined area pulses as a single patch of terrain.
        const breath = 0.85 + 0.15 * Math.sin(this.time * 1.8);

        for (const vine of this.vines.values()) {
            if (vine.presence <= 0.02) {
                continue;
            }
            const dry = vine.alive && vine.lapsRemaining <= 1;
            const rim = dry ? DRY_RIM : BARK_RIM;
            const wash = dry ? DRY_MID : MOSS;
            const alpha = vine.presence * breath;
            const localCellSize = vine.cellSize || cellSize;

            const footprint = vine.cellPoints;
            if (footprint?.length) {
                g.poly(footprint).fill({ color: wash, alpha: 0.1 * alpha });
                g.poly(footprint).stroke({
                    color: rim,
                    width: Math.max(1, localCellSize * 0.028),
                    alpha: 0.5 * alpha,
                });
            } else {
                const reach = localCellSize * 0.38;
                g.rect(vine.x - reach, vine.y - reach, reach * 2, reach * 2)
                    .fill({ color: wash, alpha: 0.1 * alpha })
                    .stroke({ color: rim, width: Math.max(1, localCellSize * 0.028), alpha: 0.5 * alpha });
            }
        }
    }
    private writeSample(
        samples: ISamplePoint[],
        index: number,
        x: number,
        y: number,
        t: number,
        presence: number,
        dry: boolean,
    ): void {
        const sample = samples[index] ?? (samples[index] = { x, y, t, presence, dry });
        sample.x = x;
        sample.y = y;
        sample.t = t;
        sample.presence = presence;
        sample.dry = dry;
    }
    private sampleChain(chain: ITrackedVine[], cellSize: number, samples: ISamplePoint[]): ISamplePoint[] {
        if (chain.length === 1) {
            const vine = chain[0];
            this.writeSample(samples, 0, vine.x, vine.y, 0, vine.presence, vine.lapsRemaining <= 1);
            samples.length = 1;
            return samples;
        }
        const segments = chain.length - 1;
        let sampleCount = 0;
        for (let s = 0; s < segments; s++) {
            const p0 = chain[Math.max(0, s - 1)];
            const p1 = chain[s];
            const p2 = chain[s + 1];
            const p3 = chain[Math.min(chain.length - 1, s + 2)];
            const from = chain[s];
            const to = chain[Math.min(chain.length - 1, s + 1)];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            for (let k = 0; k < SAMPLES_PER_SEGMENT; k++) {
                const u = k / SAMPLES_PER_SEGMENT;
                const u2 = u * u;
                const u3 = u2 * u;
                // Standard Catmull-Rom basis (tension 0.5).
                const x =
                    0.5 *
                    (2 * p1.x +
                        (-p0.x + p2.x) * u +
                        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
                        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3);
                const y =
                    0.5 *
                    (2 * p1.y +
                        (-p0.y + p2.y) * u +
                        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
                        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);

                // Perpendicular wobble, so the vine meanders through the cells instead of running dead
                // centre. Seeded per anchor pair, so it is fixed for the life of the vine.
                const wobbleSeed = hash(from.seed + s, to.seed + k);
                const wobble = Math.sin(u * Math.PI) * (wobbleSeed - 0.5) * cellSize * 0.3;
                // Gentle sway on the shared breeze, strongest mid-segment and toward the tip.
                const tGlobal = (s + u) / segments;
                const sway =
                    Math.sin(this.time * 0.9 + from.seed * 0.01 + tGlobal * 2.4) * cellSize * 0.035 * (0.3 + tGlobal);

                this.writeSample(
                    samples,
                    sampleCount++,
                    x + nx * wobble + this.windX * sway,
                    y + ny * wobble + this.windY * sway,
                    tGlobal,
                    from.presence + (to.presence - from.presence) * u,
                    (from.lapsRemaining <= 1 && to.lapsRemaining <= 1) || from.lapsRemaining <= 1,
                );
            }
        }
        const last = chain[chain.length - 1];
        this.writeSample(samples, sampleCount++, last.x, last.y, 1, last.presence, last.lapsRemaining <= 1);
        samples.length = sampleCount;
        return samples;
    }
    private draw(cellSize: number): void {
        const g = this.graphics;
        if (!this.vines.size) {
            if (this.hasGeometry) {
                g.clear();
                this.hasGeometry = false;
            }
            return;
        }
        g.clear();
        this.hasGeometry = true;

        // The cell footprint goes down FIRST, under the plant, so the vine still reads as lying on top of
        // the board rather than inside a box.
        this.drawCellFootprint(g, cellSize);

        for (const chain of this.chains) {
            const localCellSize =
                chain.reduce((sum, vine) => sum + (vine.cellSize || cellSize), 0) / Math.max(1, chain.length);
            const samples = this.sampleChain(chain, localCellSize, this.sampleScratch);
            const dry = samples[0]?.dry ?? false;
            const darkColour = dry ? DRY_DARK : BARK_DARK;
            const midColour = dry ? DRY_MID : BARK_MID;
            const rimColour = dry ? DRY_RIM : BARK_RIM;
            const baseWidth = localCellSize * (dry ? 0.16 : 0.21);

            // Only draw as far as the vine has actually grown, so the creep reads as movement along the
            // chain rather than a global fade.
            const grown = this.grownScratch;
            let grownCount = 0;
            for (let i = 0; i < samples.length; i++) {
                const sample = samples[i];
                if (sample.presence > 0.02) {
                    grown[grownCount++] = sample;
                }
            }
            grown.length = grownCount;
            if (grown.length < 2) {
                // A single cell still gets its knot, so a one-cell throw is never invisible.
                const only = samples[0];
                if (only && only.presence > 0.02) {
                    g.circle(only.x, only.y, baseWidth * 0.7 * only.presence).fill({
                        color: midColour,
                        alpha: 0.9 * only.presence,
                    });
                }
                continue;
            }

            // Taper: woody at the base, whip-thin at the tip, and thinner while still creeping in. Knots
            // ride on top of the taper so the vine is not a uniform tube — real wood swells and pinches.
            const chainSeed = chain[0]?.seed ?? 0;
            const widthAt = (p: ISamplePoint): number => {
                const taper = 1 - 0.5 * p.t;
                const knot = 1 + 0.22 * Math.sin(p.t * 11 + chainSeed * 0.02) + 0.1 * Math.sin(p.t * 23);
                return baseWidth * taper * knot * Math.min(1, p.presence * 1.2);
            };

            // 1 — dark bark underneath, wider than the body: an outline that grounds the vine on any floor.
            this.strokePolyline(g, grown, (p) => widthAt(p) * 1.9, darkColour, 0.9);
            // 2 — the BRAID. One stroke reads as a cable; the reference is plaited cordage, so the body is
            // three strands wound around the centreline on their own phases, crossing over one another.
            for (let strand = 0; strand < STRANDS; strand += 1) {
                const phase = (strand * Math.PI * 2) / STRANDS;
                const woven = this.wovenScratch[strand];
                for (let i = 0; i < grown.length; i++) {
                    const pt = grown[i];
                    const prev = grown[Math.max(0, i - 1)];
                    const dx = pt.x - prev.x;
                    const dy = pt.y - prev.y;
                    const len = Math.hypot(dx, dy) || 1;
                    const swing = Math.sin(pt.t * 26 + phase + chainSeed * 0.01) * widthAt(pt) * 0.5;
                    const wovenPoint = woven[i] ?? (woven[i] = { ...pt });
                    wovenPoint.x = pt.x + (-dy / len) * swing;
                    wovenPoint.y = pt.y + (dx / len) * swing;
                    wovenPoint.t = pt.t;
                    wovenPoint.presence = pt.presence;
                    wovenPoint.dry = pt.dry;
                }
                woven.length = grown.length;
                // The middle strand catches the light; the outer two stay in shadow.
                const colour = strand === 1 ? rimColour : midColour;
                this.strokePolyline(g, woven, (pt) => widthAt(pt) * 0.52, colour, strand === 1 ? 0.85 : 1);
            }

            // 3 — ember CRACKS, not a core. A continuous hot line turns the vine into a glowing rope; on
            // Trent the heat shows through in broken patches where the bark has split, and the bark stays
            // the body. Short seeded runs, each with a dim bleed under a thin bright split.
            const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.1);
            this.drawEmberCracks(g, grown, widthAt, pulse, dry);

            // 4 — rim highlight on ONE side only, offset up-left, so the vine reads as round. Kept narrow
            // and dim: a bright pass across the whole body is what flattened this into a pale noodle.
            const highlight = this.wovenScratch[STRANDS];
            for (let i = 0; i < grown.length; i++) {
                const point = grown[i];
                const highlightedPoint = highlight[i] ?? (highlight[i] = { ...point });
                highlightedPoint.x = point.x - baseWidth * 0.3;
                highlightedPoint.y = point.y - baseWidth * 0.34;
                highlightedPoint.t = point.t;
                highlightedPoint.presence = point.presence;
                highlightedPoint.dry = point.dry;
            }
            highlight.length = grown.length;
            this.strokePolyline(g, highlight, (p) => widthAt(p) * 0.2, rimColour, 0.4);

            this.drawThorns(g, grown, widthAt, rimColour, dry);
            this.drawLeaves(g, grown, localCellSize, dry);
        }
    }
    private strokePolyline(
        g: Graphics,
        points: ISamplePoint[],
        width: (p: ISamplePoint) => number,
        color: number,
        alpha: number,
    ): void {
        // Stroke segment by segment so the width can taper along the length — a single stroke() call would
        // force one constant width for the whole run.
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            const w = (width(a) + width(b)) * 0.5;
            if (w <= 0.05) {
                continue;
            }
            g.moveTo(a.x, a.y)
                .lineTo(b.x, b.y)
                .stroke({ color, width: w, alpha: alpha * Math.min(1, b.presence * 1.4), cap: "round" });
        }
    }
    private drawEmberCracks(
        g: Graphics,
        points: ISamplePoint[],
        width: (p: ISamplePoint) => number,
        pulse: number,
        dry: boolean,
    ): void {
        // Walk the length and open a crack every few samples, each 2-3 samples long. Seeded, so a given
        // vine's cracks sit in the same places for its whole life instead of crawling along it.
        let i = 1;
        while (i < points.length - 1) {
            const seed = hash(i * 7.3, points.length * 4.1);
            if (seed < 0.45) {
                i += 1;
                continue;
            }
            const run = 2 + Math.floor(seed * 2);
            const end = Math.min(points.length - 1, i + run);
            // Each crack breathes on its own phase, so the vine glimmers unevenly rather than pulsing as one.
            const local = 0.55 + 0.45 * Math.sin(this.time * 2.1 + seed * 6.3);
            const heat = dry ? 0.18 : 0.5 + 0.4 * local * pulse;
            for (let k = i; k < end; k++) {
                const a = points[k];
                const b = points[k + 1];
                if (!b || a.presence < 0.5) {
                    continue;
                }
                const w = (width(a) + width(b)) * 0.5;
                g.moveTo(a.x, a.y)
                    .lineTo(b.x, b.y)
                    .stroke({ color: EMBER_GLOW, width: w * 0.72, alpha: heat * 0.5 * a.presence, cap: "round" });
                g.moveTo(a.x, a.y)
                    .lineTo(b.x, b.y)
                    .stroke({ color: EMBER_CORE, width: w * 0.22, alpha: heat * a.presence, cap: "round" });
            }
            i = end + 2;
        }
    }
    private drawThorns(
        g: Graphics,
        points: ISamplePoint[],
        width: (p: ISamplePoint) => number,
        color: number,
        dry: boolean,
    ): void {
        // Thorns are what the movement penalty LOOKS like, so they have to read as hooks rather than as
        // matchsticks: two segments with a kink, varied length and rake per thorn, and always pointing back
        // along the vine the way a real barb resists the pull.
        for (let i = 2; i < points.length - 1; i += 2) {
            const p = points[i];
            if (p.presence < 0.55) {
                continue;
            }
            const seed = hash(i * 5.7, points.length * 2.9);
            if (seed < 0.35) {
                continue; // Irregular spacing — evenly spaced barbs look machined.
            }
            const prev = points[i - 1];
            const dx = p.x - prev.x;
            const dy = p.y - prev.y;
            const len = Math.hypot(dx, dy) || 1;
            const tx = dx / len;
            const ty = dy / len;
            const side = seed > 0.66 ? 1 : -1;
            const w = width(p);
            const reach = w * (dry ? 1.1 : 1.5) * (0.7 + 0.6 * seed);
            // Base juts out perpendicular, tip hooks back along the vine.
            const midX = p.x - ty * side * reach - tx * reach * 0.25;
            const midY = p.y + tx * side * reach - ty * reach * 0.25;
            const tipX = midX - ty * side * reach * 0.45 - tx * reach * 0.8;
            const tipY = midY + tx * side * reach * 0.45 - ty * reach * 0.8;
            g.moveTo(p.x, p.y)
                .lineTo(midX, midY)
                .stroke({ color, width: w * 0.42, alpha: (dry ? 0.55 : 0.85) * p.presence, cap: "round" });
            g.moveTo(midX, midY)
                .lineTo(tipX, tipY)
                .stroke({ color, width: w * 0.24, alpha: (dry ? 0.45 : 0.75) * p.presence, cap: "round" });
        }
    }
    private drawLeaves(g: Graphics, points: ISamplePoint[], cellSize: number, dry: boolean): void {
        // A few leaves and moss patches. Sparse on purpose: this is charred wood with things growing on it,
        // not foliage. They break the silhouette so the vine stops reading as a cable.
        for (let i = 3; i < points.length - 1; i += 6) {
            const p = points[i];
            if (p.presence < 0.7) {
                continue;
            }
            const seed = hash(i * 3.1, points.length * 1.3);
            const prev = points[i - 1];
            const along = Math.atan2(p.y - prev.y, p.x - prev.x);
            const flutter = Math.sin(this.time * (1.2 + seed) + i) * 0.35;

            // Moss hugging the bark — a flattened patch along the vine, not a blob.
            g.ellipse(p.x, p.y, cellSize * 0.07 * (0.7 + seed * 0.5), cellSize * 0.035).fill({
                color: dry ? DRY_MID : MOSS,
                alpha: (dry ? 0.35 : 0.6) * p.presence,
            });

            // A mushroom every other node — small, but it is the detail that makes the vine read as a
            // piece of the creature rather than as scenery.
            if (i % 12 === 3) {
                const capR = cellSize * 0.055 * (0.8 + seed * 0.4);
                const lift = cellSize * 0.05;
                g.moveTo(p.x, p.y)
                    .lineTo(p.x, p.y - lift)
                    .stroke({ color: CAP_STEM, width: cellSize * 0.016, alpha: 0.8 * p.presence, cap: "round" });
                g.ellipse(p.x, p.y - lift, capR, capR * 0.62).fill({
                    color: dry ? DRY_RIM : CAP,
                    alpha: (dry ? 0.5 : 0.95) * p.presence,
                });
            }

            if (dry) {
                continue; // A withering vine has dropped its leaves.
            }
            // Two leaves off the same node, angled apart, each on its own flutter.
            for (const side of [1, -1]) {
                const angle = along + side * (0.9 + 0.25 * seed) + flutter * side;
                const r = cellSize * 0.085 * (0.8 + 0.4 * seed);
                const cx = p.x + Math.cos(angle) * r * 1.7;
                const cy = p.y + Math.sin(angle) * r * 1.7;
                // Stem, then the blade — a filled ellipse alone reads as a pebble.
                g.moveTo(p.x, p.y)
                    .lineTo(cx, cy)
                    .stroke({ color: MOSS, width: cellSize * 0.014, alpha: 0.7 * p.presence, cap: "round" });
                g.ellipse(cx, cy, r, r * 0.42).fill({ color: MOSS, alpha: 0.8 * p.presence });
            }
        }
    }
    public destroy(): void {
        this.vines.clear();
        this.container.destroy({ children: true });
    }
}
