import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";

type Anchor = Readonly<{ x: number; y: number }>;
const atlasUrl = images.vfx_angel_resurrection_pop_atlas;
const meta = animationAtlases["Vfx Angel Resurrection"]?.pop;
let atlasLeases = 0;

/** Frame selection for the exact 1.2-second lifetime. */
export function angelResurrectionFrameAt(elapsedMs: number): number | undefined {
    if (!meta || elapsedMs >= 1200 - 1e-7) return undefined;
    let end = 0;
    for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
        end += duration;
        if (Math.max(0, elapsedMs) < end) return frame;
    }
    return undefined;
}

/** Painted resurrection cels, coalescing simultaneous live/replay notifications. */
export class AngelResurrectionPops {
    private frames?: Texture[];
    private load?: Promise<Texture[] | undefined>;
    private leaseHeld = false;
    private generation = 0;
    private readonly pendingUnits = new Set<string>();
    private pops: {
        unitId: string;
        container: Container;
        sprite: Sprite;
        startedAtMs: number;
        follow?: () => Anchor | undefined;
        offsetY: number;
    }[] = [];
    public constructor(
        private readonly attach: (container: Container, zIndex: number) => void,
        private readonly now: () => number = () => performance.now(),
    ) {}
    public get active(): boolean {
        return this.pops.length > 0;
    }
    private loadFrames(): Promise<Texture[] | undefined> {
        if (!meta || !atlasUrl) return Promise.resolve(undefined);
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
                if (generation === this.generation) this.clear();
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
            this.attach(container, 5520);
            this.pops.push({ unitId, container, sprite, startedAtMs: this.now(), follow, offsetY });
            this.update(0);
        } finally {
            if (generation === this.generation) this.pendingUnits.delete(unitId);
        }
    }
    public update(_dtSeconds: number): void {
        // Scene steps are fixed and capped under load. A 1.2-second UI effect must use real elapsed time.
        const now = this.now();
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const pop = this.pops[i];
            const ageMs = Math.max(0, now - pop.startedAtMs);
            const frame = angelResurrectionFrameAt(ageMs);
            const position = pop.follow?.();
            if (frame === undefined || (pop.follow && !position)) {
                pop.container.destroy({ children: true });
                this.pops.splice(i, 1);
                continue;
            }
            pop.sprite.texture = this.frames![frame];
            pop.sprite.alpha = Math.min(1, ageMs / 70, (1200 - ageMs) / 180);
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
    public clear(): void {
        this.generation++;
        this.pendingUnits.clear();
        for (const pop of this.pops) pop.container.destroy({ children: true });
        this.pops.length = 0;
        for (const frame of this.frames ?? []) frame.destroy();
        this.frames = undefined;
        this.load = undefined;
        if (this.leaseHeld) {
            this.leaseHeld = false;
            atlasLeases--;
            queueMicrotask(() => {
                if (atlasLeases === 0) void Assets.unload(atlasUrl).catch(() => undefined);
            });
        }
    }
}
