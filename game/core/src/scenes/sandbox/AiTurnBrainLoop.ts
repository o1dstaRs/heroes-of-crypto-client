import { overheadEffectElapsedMs, OVERHEAD_EFFECT_DURATION_MS } from "../../settings/statusEffectTiming";
import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";

type Anchor = Readonly<{ x: number; y: number }>;
export type AiBrainTarget = Readonly<{
    unitId: string;
    cellSize: number;
    follow: () => Anchor | undefined;
}>;

const atlasUrl = images.vfx_ai_turn_brain_loop_atlas;
let atlasLeases = 0;

/** The painted pulse loops for the entire activation, independently of scene pauses or AI polling. */
export function aiTurnBrainFrameAt(elapsedMs: number): number {
    const durations = animationAtlases["Vfx Ai Turn Brain"].loop.frameDurationsMs!;
    const total = durations.reduce((sum, ms) => sum + ms, 0);
    const time = overheadEffectElapsedMs(Math.max(0, elapsedMs) % OVERHEAD_EFFECT_DURATION_MS, total);
    let end = 0;
    for (const [frame, duration] of durations.entries()) {
        end += duration;
        if (time < end) return frame;
    }
    return 0;
}

/** One fixed-size sprite follows the active AI unit's flag; all tissue/glint motion is in the atlas. */
export class AiTurnBrainLoop {
    private frames?: Texture[];
    private load?: Promise<Texture[] | undefined>;
    private leaseHeld = false;
    private generation = 0;
    private request = 0;
    private target?: AiBrainTarget;
    private container?: Container;
    private sprite?: Sprite;
    private startedAtMs = 0;
    public constructor(
        private readonly attach: (container: Container, zIndex: number) => void,
        private readonly now: () => number = () => performance.now(),
    ) {}
    public get active(): boolean {
        return !!this.container;
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
                const meta = animationAtlases["Vfx Ai Turn Brain"].loop;
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
    public async setTarget(target?: AiBrainTarget): Promise<void> {
        const sameUnit = this.target?.unitId === target?.unitId;
        this.target = target;
        if (sameUnit && (this.container || !target)) return;
        // Repeated scene ticks share the pending load without invalidating its activation.
        if (sameUnit && this.load && !this.frames) return;
        const request = ++this.request;
        this.removeSprite();
        if (!target) return;
        const frames = await this.loadFrames();
        if (!frames || request !== this.request || this.target?.unitId !== target.unitId) return;
        const position = this.target.follow();
        if (!position) return;
        const container = new Container();
        const sprite = new Sprite(frames[0]);
        // Anchor near the painted brain's lower edge rather than the transparent cel margin.
        sprite.anchor.set(0.5, 0.82);
        sprite.width = sprite.height = target.cellSize * 1.45 * 0.9 * 0.83;
        container.addChild(sprite);
        container.scale.set(1, -1);
        this.container = container;
        this.sprite = sprite;
        this.startedAtMs = this.now();
        this.attach(container, 5520);
        this.update();
    }
    public update(): void {
        const container = this.container;
        if (!container || !this.target || !this.sprite) return;
        const position = this.target.follow();
        if (!position) {
            void this.setTarget();
            return;
        }
        this.sprite.texture = this.frames![aiTurnBrainFrameAt(this.now() - this.startedAtMs)];
        container.position.set(position.x, position.y + this.target.cellSize * 0.07);
        const transform = container.parent?.getGlobalTransform();
        if (transform) {
            const xScale = Math.hypot(transform.a, transform.b);
            const yScale = Math.hypot(transform.c, transform.d);
            container.scale.set(1, -xScale / Math.max(0.001, yScale));
        }
    }
    private removeSprite(): void {
        this.container?.destroy({ children: true });
        this.container = undefined;
        this.sprite = undefined;
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
        this.request++;
        this.target = undefined;
        this.removeSprite();
        for (const frame of this.frames ?? []) frame.destroy();
        this.frames = undefined;
        this.load = undefined;
        this.release();
    }
}
