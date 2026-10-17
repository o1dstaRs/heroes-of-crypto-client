import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";

export type BattleRoarDurationMs = 1000 | 1500;
type Anchor = Readonly<{ x: number; y: number }>;
const atlasUrl = images.vfx_battle_roar_short_atlas;
let atlasLeases = 0;

/** Fade inside the requested lifetime, without adding a tail or moving/scaling the flag artwork. */
export function battleRoarOpacityAt(elapsedMs: number, durationMs: BattleRoarDurationMs): number {
    const smooth = (value: number) => {
        const t = Math.max(0, Math.min(1, value));
        return t * t * (3 - 2 * t);
    };
    return smooth(elapsedMs / (durationMs * 0.12)) * smooth((durationMs - elapsedMs) / (durationMs * 0.22));
}

export function battleRoarFrameAt(elapsedMs: number, durationMs: BattleRoarDurationMs): number | undefined {
    const meta = animationAtlases["Vfx Battle Roar"][durationMs === 1000 ? "short" : "long"];
    if (elapsedMs >= durationMs - 1e-7) return undefined;
    let end = 0;
    for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
        end += duration;
        if (Math.max(0, elapsedMs) < end) return frame;
    }
    return undefined;
}

/** Complete painted head/wave cels. Playback never scales, drifts or deforms the artwork. */
export class BattleRoarPops {
    private frames?: Texture[];
    private load?: Promise<Texture[] | undefined>;
    private leaseHeld = false;
    private generation = 0;
    private pops: {
        container: Container;
        sprite: Sprite;
        startedAtMs: number;
        durationMs: BattleRoarDurationMs;
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
                const meta = animationAtlases["Vfx Battle Roar"].short;
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
        anchor: Anchor,
        cellSize: number,
        durationMs: BattleRoarDurationMs = 1000,
        follow?: () => Anchor | undefined,
        stackIndex = 0,
    ): Promise<void> {
        const generation = this.generation;
        const frames = await this.loadFrames();
        if (!frames || generation !== this.generation) return;
        const container = new Container();
        const sprite = new Sprite(frames[0]);
        sprite.anchor.set(0.5, 1);
        sprite.width = sprite.height = cellSize * 1.45 * 0.9;
        container.addChild(sprite);
        const offsetY = cellSize * (0.07 + stackIndex * 1.45);
        const position = follow?.() ?? anchor;
        container.position.set(position.x, position.y + offsetY);
        container.scale.set(1, -1);
        this.attach(container, 5520);
        this.pops.push({ container, sprite, startedAtMs: this.now(), durationMs, follow, offsetY });
        this.update(0);
    }
    public update(_dtSeconds: number): void {
        // Scene steps are fixed and capped under load. A one-second UI effect must use real elapsed time.
        const now = this.now();
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const pop = this.pops[i];
            const ageMs = Math.max(0, now - pop.startedAtMs);
            const frame = battleRoarFrameAt(ageMs, pop.durationMs);
            if (frame === undefined) {
                pop.container.destroy({ children: true });
                this.pops.splice(i, 1);
                continue;
            }
            pop.container.alpha = battleRoarOpacityAt(ageMs, pop.durationMs);
            pop.sprite.texture = this.frames![frame];
            const position = pop.follow?.();
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
