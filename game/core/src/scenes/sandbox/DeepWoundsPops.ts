import { FLOATING_RESULT_DURATION_MS, statusEffectAppearanceElapsedMs } from "../../settings/statusEffectTiming";
import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";
import type { DeepWoundsVisualLevel } from "./deepWoundsApplications";

type Anchor = Readonly<{ x: number; y: number }>;
const metas = animationAtlases["Vfx Deep Wounds Level"];
const urls = {
    1: images.vfx_deep_wounds_level_1_atlas,
    2: images.vfx_deep_wounds_level_2_atlas,
    3: images.vfx_deep_wounds_level_3_atlas,
} as const;
const leases = new Map<DeepWoundsVisualLevel, number>();

/** The authored cels include appearance and fade inside a one-second lifetime. */
export function deepWoundsFrameAt(level: DeepWoundsVisualLevel, elapsedMs: number): number | undefined {
    if (elapsedMs >= 1000 - 1e-7) return undefined;
    const meta = metas[String(level)];
    let end = 0;
    for (let frame = 0; frame < meta.frameCount; frame++) {
        end += meta.frameDurationsMs?.[frame] ?? meta.frameDurationSec * 1000;
        if (Math.max(0, elapsedMs) < end) return frame;
    }
    return undefined;
}

/** Painted cuts follow the struck figure on the damage clock. */
export class DeepWoundsPops {
    private readonly frames = new Map<DeepWoundsVisualLevel, Texture[]>();
    private readonly loads = new Map<DeepWoundsVisualLevel, Promise<Texture[] | undefined>>();
    private readonly heldLeases = new Set<DeepWoundsVisualLevel>();
    private readonly pendingUnits = new Map<string, symbol>();
    private generation = 0;
    private readonly pops: {
        unitId: string;
        level: DeepWoundsVisualLevel;
        container: Container;
        sprite: Sprite;
        startedAtMs: number;
        follow?: () => Anchor | undefined;
    }[] = [];
    public constructor(
        private readonly attach: (container: Container, zIndex: number) => void,
        private readonly now: () => number = () => performance.now(),
    ) {}
    public get active(): boolean {
        return this.pops.length > 0;
    }
    public preload(): void {
        for (const level of [1, 2, 3] as const) void this.loadFrames(level);
    }
    private loadFrames(level: DeepWoundsVisualLevel): Promise<Texture[] | undefined> {
        const frames = this.frames.get(level);
        if (frames) return Promise.resolve(frames);
        const pending = this.loads.get(level);
        if (pending) return pending;
        this.heldLeases.add(level);
        leases.set(level, (leases.get(level) ?? 0) + 1);
        const generation = this.generation;
        const meta = metas[String(level)];
        const load = Assets.load<Texture>(urls[level]).then(
            (atlas) => {
                if (generation !== this.generation) return undefined;
                const cels = Array.from(
                    { length: meta.frameCount },
                    (_, frame) =>
                        new Texture({
                            source: atlas.source,
                            frame: new Rectangle(
                                (frame % meta.layout.cols) * meta.frameWidth,
                                Math.floor(frame / meta.layout.cols) * meta.frameHeight,
                                meta.frameWidth,
                                meta.frameHeight,
                            ),
                        }),
                );
                this.frames.set(level, cels);
                return cels;
            },
            () => {
                if (generation === this.generation) {
                    this.loads.delete(level);
                    this.release(level);
                }
                return undefined;
            },
        );
        this.loads.set(level, load);
        return load;
    }
    public async spawn(
        unitId: string,
        level: DeepWoundsVisualLevel,
        anchor: Anchor,
        cellSize: number,
        follow?: () => Anchor | undefined,
    ): Promise<void> {
        const startedAtMs = this.now();
        const pending = Symbol();
        this.pendingUnits.set(unitId, pending);
        const previous = this.pops.findIndex((pop) => pop.unitId === unitId);
        if (previous >= 0) {
            this.pops[previous].container.destroy({ children: true });
            this.pops.splice(previous, 1);
        }
        const generation = this.generation;
        try {
            // Warm art attaches on the impact frame. A cold decode joins the same clock at its current cel.
            const frames = this.frames.get(level) ?? (await this.loadFrames(level));
            if (!frames || generation !== this.generation || this.pendingUnits.get(unitId) !== pending) return;
            if (this.now() - startedAtMs >= FLOATING_RESULT_DURATION_MS) return;
            const position = follow ? follow() : anchor;
            if (!position) return;
            const container = new Container();
            const sprite = new Sprite(frames[0]);
            sprite.anchor.set(0.5);
            sprite.width = sprite.height = cellSize * 1.45 * 0.9;
            container.addChild(sprite);
            container.position.set(position.x, position.y);
            container.scale.set(1, -1);
            this.attach(container, 5519);
            this.pops.push({ unitId, level, container, sprite, startedAtMs, follow });
            this.update(0);
        } finally {
            if (this.pendingUnits.get(unitId) === pending) this.pendingUnits.delete(unitId);
        }
    }
    public update(_dtSeconds: number): void {
        const now = this.now();
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const pop = this.pops[i];
            const elapsed = ((now - pop.startedAtMs) / FLOATING_RESULT_DURATION_MS) * 1000;
            const frame = deepWoundsFrameAt(pop.level, statusEffectAppearanceElapsedMs(elapsed));
            const position = pop.follow?.();
            if (frame === undefined || (pop.follow && !position)) {
                pop.container.destroy({ children: true });
                this.pops.splice(i, 1);
                continue;
            }
            pop.sprite.texture = this.frames.get(pop.level)![frame];
            if (position) pop.container.position.set(position.x, position.y);
            const transform = pop.container.parent?.getGlobalTransform();
            if (transform) {
                const xScale = Math.hypot(transform.a, transform.b);
                const yScale = Math.hypot(transform.c, transform.d);
                pop.container.scale.set(1, -xScale / Math.max(0.001, yScale));
            }
        }
    }
    private release(level: DeepWoundsVisualLevel): void {
        if (!this.heldLeases.delete(level)) return;
        leases.set(level, (leases.get(level) ?? 1) - 1);
        queueMicrotask(() => {
            if (leases.get(level) === 0) void Assets.unload(urls[level]).catch(() => undefined);
        });
    }
    public clear(): void {
        this.generation++;
        this.pendingUnits.clear();
        for (const pop of this.pops) pop.container.destroy({ children: true });
        this.pops.length = 0;
        for (const frames of this.frames.values()) for (const frame of frames) frame.destroy();
        this.frames.clear();
        this.loads.clear();
        for (const level of this.heldLeases) this.release(level);
    }
}
