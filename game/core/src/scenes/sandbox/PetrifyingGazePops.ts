import { OVERHEAD_EFFECT_DURATION_MS, overheadEffectElapsedMs } from "../../settings/statusEffectTiming";
import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";

type Anchor = Readonly<{ x: number; y: number }>;
export const PETRIFYING_GAZE_DURATION_MS = OVERHEAD_EFFECT_DURATION_MS;
const MAX_POPS = 24;
const ART = animationAtlases["Vfx Petrifying Gaze"].pop;
const FRAME_DURATIONS = ART.frameDurationsMs ?? Array<number>(ART.frameCount).fill(1000 / ART.frameCount);

const AUTHORED_DURATION_MS = FRAME_DURATIONS.reduce((sum, ms) => sum + ms, 0);

type Pop = {
    container: Container;
    sprite: Sprite;
    frames: readonly Texture[];
    started: number;
    follow: () => Anchor | undefined;
    offset: number;
};

/** Painted serpent/head cels; only opacity is procedural. Skull scale and anchor stay fixed. */
export class PetrifyingGazePops {
    private readonly pops = new Map<string, Pop>();
    private readonly pending = new Set<string>();
    private readonly frameViews = new Map<Texture, Texture[]>();
    private generation = 0;
    public constructor(
        private readonly attach: (container: Container, zIndex: number) => void,
        private readonly now: () => number = () => performance.now(),
        private readonly load: () => Promise<Texture> = () =>
            Assets.load<Texture>(images.vfx_petrifying_gaze_pop_atlas),
    ) {}
    public get active(): boolean {
        return this.pops.size > 0;
    }
    private framesFor(atlas: Texture): Texture[] {
        const cached = this.frameViews.get(atlas);
        if (cached) return cached;
        // Derive UVs from the loaded tier, so full and quarter atlases share authored timing.
        const width = atlas.width / ART.layout.cols;
        const height = atlas.height / ART.layout.rows;
        const frames = Array.from(
            { length: ART.frameCount },
            (_, i) =>
                new Texture({
                    source: atlas.source,
                    frame: new Rectangle(
                        (i % ART.layout.cols) * width,
                        Math.floor(i / ART.layout.cols) * height,
                        width,
                        height,
                    ),
                }),
        );
        this.frameViews.set(atlas, frames);
        return frames;
    }
    public async spawn(id: string, cell: number, follow: () => Anchor | undefined): Promise<void> {
        if (this.pops.has(id) || this.pending.has(id) || this.pops.size + this.pending.size >= MAX_POPS) return;
        const generation = this.generation;
        const requested = this.now();
        this.pending.add(id);
        try {
            const texture = await this.load().catch(() => undefined);
            if (!texture) return;
            if (generation !== this.generation || this.now() - requested >= PETRIFYING_GAZE_DURATION_MS) return;
            const position = follow();
            if (!position) return;
            const frames = this.framesFor(texture);
            const container = new Container();
            const sprite = new Sprite(frames[0]);
            sprite.anchor.set(0.5, 0.86);
            sprite.width = sprite.height = cell * 1.45;
            container.addChild(sprite);
            container.scale.set(1, -1);
            const offset = cell * 0.07;
            container.position.set(position.x, position.y + offset);
            this.attach(container, 5520);
            this.pops.set(id, { container, sprite, frames, started: this.now(), follow, offset });
            this.update();
        } finally {
            if (generation === this.generation) this.pending.delete(id);
        }
    }
    public update(): void {
        const now = this.now();
        for (const [id, pop] of this.pops) {
            const elapsed = Math.max(0, now - pop.started);
            const position = pop.follow();
            if (elapsed >= PETRIFYING_GAZE_DURATION_MS || !position) {
                this.remove(id, pop);
                continue;
            }
            let frame = 0;
            let remaining = overheadEffectElapsedMs(elapsed, AUTHORED_DURATION_MS);
            while (frame < pop.frames.length - 1 && remaining >= FRAME_DURATIONS[frame]) {
                remaining -= FRAME_DURATIONS[frame++];
            }
            pop.sprite.texture = pop.frames[frame];
            pop.container.alpha = Math.min(
                1,
                elapsed / (PETRIFYING_GAZE_DURATION_MS * 0.09),
                (PETRIFYING_GAZE_DURATION_MS - elapsed) / (PETRIFYING_GAZE_DURATION_MS * 0.18),
            );
            pop.container.position.set(position.x, position.y + pop.offset);
            const transform = pop.container.parent?.getGlobalTransform();
            if (transform) {
                const x = Math.hypot(transform.a, transform.b),
                    y = Math.hypot(transform.c, transform.d);
                pop.container.scale.set(1, -x / Math.max(0.001, y));
            }
        }
    }
    private remove(id: string, pop: Pop): void {
        pop.container.destroy({ children: true });
        this.pops.delete(id);
    }
    public finish(id: string): void {
        const pop = this.pops.get(id);
        if (pop) this.remove(id, pop);
    }
    public clear(): void {
        this.generation++;
        this.pending.clear();
        for (const [id, pop] of this.pops) this.remove(id, pop);
        // These are local frame views; Assets owns their shared atlas source.
        for (const frames of this.frameViews.values()) for (const frame of frames) frame.destroy(false);
        this.frameViews.clear();
    }
}
