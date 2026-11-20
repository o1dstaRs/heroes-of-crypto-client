import type { FlagOverlayAttach } from "./FlagOverlayLayout";
import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";

import type { IAtlasAnimationMeta } from "../../generated/animation_atlases";

type Anchor = Readonly<{ x: number; y: number }>;

/** One painted flag cue: a single sprite-sequence atlas whose cels carry their own appearance and fade. */
export type AtlasFlagEffect = Readonly<{
    /** A static `images.vfx_*` reference, so the asset pipeline sees every atlas. */
    url: string;
    /** Absent only when the generated atlas set omits the effect; the cue then never spawns. */
    meta: IAtlasAnimationMeta | undefined;
    /** Exact lifetime in authored milliseconds; the per-cel durations must add up to it. */
    durationMs: number;
    /** Maps real milliseconds since spawn onto the authored timeline. */
    elapsedMs: (realElapsedMs: number) => number;
    /** Extra sprite opacity on top of the painted alpha, if the art needs an engine fade. */
    alphaAt?: (ageMs: number) => number;
}>;

const atlasLeases = new Map<string, number>();

/** The authored cel shown at `elapsedMs`, or undefined once the lifetime is over. */
export function atlasFlagFrameAt(effect: AtlasFlagEffect, elapsedMs: number): number | undefined {
    const { meta } = effect;
    if (!meta || elapsedMs >= effect.durationMs - 1e-7) return undefined;
    let end = 0;
    for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
        end += duration;
        if (Math.max(0, elapsedMs) < end) return frame;
    }
    return undefined;
}

/**
 * Fixed-size painted cue following one unit's count flag. Simultaneous notifications for the same unit
 * coalesce into one activation, and the atlas is shared by every layer that plays the same effect.
 */
export class AtlasFlagPops {
    private frames?: Texture[];
    private load?: Promise<Texture[] | undefined>;
    private leaseHeld = false;
    private generation = 0;
    private readonly pendingUnits = new Set<string>();
    private readonly pops: {
        unitId: string;
        container: Container;
        sprite: Sprite;
        startedAtMs: number;
        follow?: () => Anchor | undefined;
        offsetY: number;
    }[] = [];
    public constructor(
        private readonly effect: AtlasFlagEffect,
        private readonly attach: FlagOverlayAttach,
        private readonly now: () => number = () => performance.now(),
    ) {}
    public get active(): boolean {
        return this.pops.length > 0;
    }
    private loadFrames(): Promise<Texture[] | undefined> {
        const { url, meta } = this.effect;
        if (!meta || !url) return Promise.resolve(undefined);
        if (this.frames) return Promise.resolve(this.frames);
        if (this.load) return this.load;
        if (!this.leaseHeld) {
            this.leaseHeld = true;
            atlasLeases.set(url, (atlasLeases.get(url) ?? 0) + 1);
        }
        const generation = this.generation;
        this.load = Assets.load<Texture>(url).then(
            (atlas) => {
                if (generation !== this.generation) return undefined;
                this.frames = Array.from(
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
                return this.frames;
            },
            () => {
                if (generation === this.generation) {
                    this.load = undefined;
                    this.release();
                }
                return undefined;
            },
        );
        return this.load;
    }
    public async spawn(
        unitId: string,
        anchor: Anchor,
        cellSize: number,
        follow?: () => Anchor | undefined,
    ): Promise<void> {
        if (this.pendingUnits.has(unitId) || this.pops.some((pop) => pop.unitId === unitId)) return;
        this.pendingUnits.add(unitId);
        const generation = this.generation;
        try {
            const frames = await this.loadFrames();
            if (!frames || generation !== this.generation) return;
            const position = follow ? follow() : anchor;
            if (!position) return;
            const container = new Container();
            const sprite = new Sprite(frames[0]);
            sprite.anchor.set(0.5, 1);
            sprite.width = sprite.height = cellSize * 1.45 * 0.9;
            container.addChild(sprite);
            const offsetY = cellSize * 0.07;
            container.position.set(position.x, position.y + offsetY);
            container.scale.set(1, -1);
            this.attach(container, 5520, follow ?? (() => anchor));
            this.pops.push({ unitId, container, sprite, startedAtMs: this.now(), follow, offsetY });
            this.update(0);
        } finally {
            if (generation === this.generation) this.pendingUnits.delete(unitId);
        }
    }
    public update(_dtSeconds: number): void {
        // Scene steps are fixed and capped under load. A UI effect with an exact lifetime must use real time.
        const now = this.now();
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const pop = this.pops[i];
            const ageMs = this.effect.elapsedMs(now - pop.startedAtMs);
            const frame = atlasFlagFrameAt(this.effect, ageMs);
            const position = pop.follow?.();
            if (frame === undefined || (pop.follow && !position)) {
                pop.container.destroy({ children: true });
                this.pops.splice(i, 1);
                continue;
            }
            pop.sprite.texture = this.frames![frame];
            if (this.effect.alphaAt) pop.sprite.alpha = this.effect.alphaAt(ageMs);
            if (position) pop.container.position.set(position.x, position.y + pop.offsetY);
            // Counter both the y-up world and the board camera's unequal axes.
            const transform = pop.container.parent?.getGlobalTransform();
            if (transform) {
                const xScale = Math.hypot(transform.a, transform.b);
                const yScale = Math.hypot(transform.c, transform.d);
                pop.container.scale.set(1, -xScale / Math.max(0.001, yScale));
            }
        }
    }
    private release(): void {
        if (!this.leaseHeld) return;
        this.leaseHeld = false;
        const { url } = this.effect;
        const leases = (atlasLeases.get(url) ?? 1) - 1;
        atlasLeases.set(url, leases);
        queueMicrotask(() => {
            if (atlasLeases.get(url) === 0) void Assets.unload(url).catch(() => undefined);
        });
    }
    public clear(): void {
        this.generation++;
        this.pendingUnits.clear();
        for (const pop of this.pops) pop.container.destroy({ children: true });
        this.pops.length = 0;
        for (const frame of this.frames ?? []) frame.destroy();
        this.frames = undefined;
        this.load = undefined;
        this.release();
    }
}
