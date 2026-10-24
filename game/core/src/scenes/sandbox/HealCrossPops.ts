import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { images } from "../../imageAssets";
import { OVERHEAD_EFFECT_DURATION_MS, overheadEffectElapsedMs } from "../../settings/statusEffectTiming";

type Anchor = Readonly<{ x: number; y: number }>;
export const HEAL_CROSS_MAX_POPS = 24;
const FRAME_DURATIONS_MS = [40, 50, 60, 70, 70, 70, 80, 80, 80, 70, 60, 60, 60, 60, 50, 40];

/** Keep the painted anticipation, readable crest and dispersal within the common overhead clock. */
export function healCrossFrameAt(elapsedMs: number): number | undefined {
    if (elapsedMs >= OVERHEAD_EFFECT_DURATION_MS) return undefined;
    const authored = overheadEffectElapsedMs(elapsedMs, 1000);
    let end = 0;
    for (const [index, duration] of FRAME_DURATIONS_MS.entries()) {
        end += duration;
        if (authored < end) return index;
    }
    return undefined;
}

/** Single Heal's painted cels. Own frame views, but never destroy Pixi's shared atlas source. */
export class HealCrossPops {
    private generation = 0;
    private atlas?: Texture;
    private frames: Texture[] = [];
    private readonly pending = new Set<string>();
    private readonly pops = new Map<
        string,
        {
            container: Container;
            sprite: Sprite;
            started: number;
            follow: () => Anchor | undefined;
            offset: number;
        }
    >();
    public constructor(
        private readonly attach: (container: Container, z: number) => void,
        private readonly now = () => performance.now(),
        private readonly load: () => Promise<Texture> = () =>
            Assets.load<Texture>(images.vfx_single_heal_pop_atlas_half),
    ) {}
    public get active(): boolean {
        return this.pops.size > 0;
    }
    private frameViews(atlas: Texture): Texture[] {
        if (this.atlas === atlas) return this.frames;
        for (const frame of this.frames) frame.destroy();
        this.atlas = atlas;
        const width = atlas.width / 4,
            height = atlas.height / 4;
        this.frames = Array.from(
            { length: FRAME_DURATIONS_MS.length },
            (_, index) =>
                new Texture({
                    source: atlas.source,
                    frame: new Rectangle((index % 4) * width, Math.floor(index / 4) * height, width, height),
                }),
        );
        return this.frames;
    }
    public async spawn(id: string, cell: number, follow: () => Anchor | undefined): Promise<void> {
        if (this.pending.has(id) || this.pops.has(id) || this.pending.size + this.pops.size >= HEAL_CROSS_MAX_POPS)
            return;
        const generation = this.generation,
            started = this.now();
        this.pending.add(id);
        try {
            const texture = await this.load().catch(() => undefined);
            if (!texture || generation !== this.generation || this.now() - started >= OVERHEAD_EFFECT_DURATION_MS)
                return;
            const pos = follow();
            if (!pos) return;
            const container = new Container(),
                sprite = new Sprite(this.frameViews(texture)[0]);
            sprite.label = "heal-painted-cross";
            sprite.eventMode = "none";
            sprite.anchor.set(0.5, 1);
            sprite.width = sprite.height = cell * 1.305;
            container.addChild(sprite);
            container.scale.set(1, -1);
            this.pops.set(id, { container, sprite, started, follow, offset: cell * 0.07 });
            this.attach(container, 5520);
            this.update();
        } finally {
            if (generation === this.generation) this.pending.delete(id);
        }
    }
    public update(): void {
        const now = this.now();
        for (const [id, pop] of this.pops) {
            const age = Math.max(0, now - pop.started),
                frame = healCrossFrameAt(age),
                pos = pop.follow();
            if (!pos || frame === undefined) {
                pop.container.destroy({ children: true });
                this.pops.delete(id);
                continue;
            }
            pop.sprite.texture = this.frames[frame];
            // Only soften the first sparks and final flecks; the material motion is painted into the cels.
            const phase = age / OVERHEAD_EFFECT_DURATION_MS;
            pop.sprite.alpha = Math.min(1, phase / 0.06, (1 - phase) / 0.1);
            pop.container.position.set(pos.x, pos.y + pop.offset);
            const m = pop.container.parent?.getGlobalTransform();
            if (m) pop.container.scale.set(1, -Math.hypot(m.a, m.b) / Math.max(0.001, Math.hypot(m.c, m.d)));
        }
    }
    public clear(): void {
        this.generation++;
        this.pending.clear();
        for (const pop of this.pops.values()) pop.container.destroy({ children: true });
        this.pops.clear();
        for (const frame of this.frames) frame.destroy();
        this.frames = [];
        this.atlas = undefined;
    }
}
