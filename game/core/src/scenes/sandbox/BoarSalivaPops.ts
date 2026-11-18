import type { FlagOverlayAttach } from "./FlagOverlayLayout";
import { statusEffectElapsedMs } from "../../settings/statusEffectTiming";
import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";

type Anchor = Readonly<{ x: number; y: number }>;
const atlasUrl = images.vfx_boar_saliva_short_atlas;
let atlasLeases = 0;

/** Appearance, falling droplets and disappearance are authored inside the one-second sprite sequence. */
export function boarSalivaFrameAt(elapsedMs: number): number | undefined {
    if (elapsedMs >= 1000 - 1e-7) return undefined;
    const meta = animationAtlases["Vfx Boar Saliva"].short;
    let end = 0;
    for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
        end += duration;
        if (Math.max(0, elapsedMs) < end) return frame;
    }
    return undefined;
}

/** Fixed-size painted saliva cue following the recipient's count flag. */
export class BoarSalivaPops {
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
        private readonly attach: FlagOverlayAttach,
        private readonly now: () => number = () => performance.now(),
    ) {}
    public get active(): boolean {
        return this.pops.length > 0;
    }
    private loadFrames(): Promise<Texture[] | undefined> {
        if (this.frames) return Promise.resolve(this.frames);
        if (this.load) return this.load;
        if (!this.leaseHeld) {
            this.leaseHeld = true;
            atlasLeases++;
        }
        const generation = this.generation;
        this.load = Assets.load<Texture>(atlasUrl).then(
            (atlas) => {
                if (generation !== this.generation) return undefined;
                const meta = animationAtlases["Vfx Boar Saliva"].short;
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
        const now = this.now();
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const pop = this.pops[i];
            const frame = boarSalivaFrameAt(statusEffectElapsedMs(Math.max(0, now - pop.startedAtMs)));
            const position = pop.follow?.();
            if (frame === undefined || (pop.follow && !position)) {
                pop.container.destroy({ children: true });
                this.pops.splice(i, 1);
                continue;
            }
            pop.sprite.texture = this.frames![frame];
            if (position) pop.container.position.set(position.x, position.y + pop.offsetY);
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
        atlasLeases--;
        queueMicrotask(() => {
            if (atlasLeases === 0) void Assets.unload(atlasUrl).catch(() => undefined);
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
