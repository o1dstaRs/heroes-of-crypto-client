import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../generated/image_imports";

type Point = Readonly<{ x: number; y: number }>;
type Kind = "arc" | "impact";
import { LIGHTNING_LIFE_MS, lightningFrameAt, lightningPath } from "./ThunderbirdLightningTiming";
export {
    LIGHTNING_FRAME_MS,
    LIGHTNING_JUMP_MS,
    LIGHTNING_LEAD_MS,
    LIGHTNING_LIFE_MS,
    lightningFrameAt,
    lightningPath,
} from "./ThunderbirdLightningTiming";

const urls = { arc: images.vfx_thunderbird_chain_arc_atlas, impact: images.vfx_thunderbird_chain_impact_atlas };

/** Reserved painted alternative. Kept for offline comparisons; not connected to gameplay. */
export class ThunderbirdLightningSprites {
    private frames?: Record<Kind, Texture[]>;
    private loading?: Promise<void>;
    private generation = 0;
    private pending = 0;
    private pops: { container: Container; sprite: Sprite; kind: Kind; start: number }[] = [];
    public constructor(
        private readonly attach: (container: Container, z: number) => void,
        private readonly now: () => number = () => performance.now(),
    ) {}
    public get active(): boolean {
        return this.pending > 0 || this.pops.length > 0;
    }
    public preload(): Promise<void> {
        if (this.frames) return Promise.resolve();
        if (this.loading) return this.loading;
        const generation = this.generation;
        this.loading = Promise.all(
            (["arc", "impact"] as const).map(async (kind) => {
                const atlas = await Assets.load<Texture>(urls[kind]);
                return { kind, atlas };
            }),
        )
            .then((loaded) => {
                if (generation !== this.generation) return;
                const frames = {} as Record<Kind, Texture[]>;
                for (const { kind, atlas } of loaded) {
                    const meta = animationAtlases["Vfx Thunderbird Chain"][kind];
                    frames[kind] = Array.from(
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
                }
                this.frames = frames;
            })
            .catch((error) => {
                if (generation === this.generation) this.loading = undefined;
                console.error("Lightning sprite atlas failed to load", error);
            });
        return this.loading;
    }
    public async spawn(targets: readonly Point[], cellSize: number): Promise<void> {
        if (!targets.length || !(cellSize > 0)) return;
        const generation = this.generation;
        const path = lightningPath(
            targets.map((p) => ({ ...p })),
            cellSize,
        );
        this.pending++;
        await this.preload();
        if (generation !== this.generation) return;
        this.pending--;
        if (!this.frames) return;
        const start = this.now();
        for (const [index, segment] of path.entries()) {
            const dx = segment.to.x - segment.from.x,
                dy = segment.to.y - segment.from.y;
            for (const kind of ["arc", "impact"] as const) {
                const container = new Container();
                container.scale.y = -1;
                const sprite = new Sprite(this.frames[kind][0]);
                if (kind === "arc") {
                    // Registered endpoints occupy x=1/12 and x=11/12 of every painted cel.
                    sprite.anchor.set(1 / 12, 0.5);
                    sprite.width = Math.hypot(dx, dy) / (10 / 12);
                    sprite.height = cellSize * (index === 0 ? 0.92 : 0.72);
                    sprite.rotation = Math.atan2(-dy, dx);
                    container.position.set(segment.from.x, segment.from.y);
                } else {
                    sprite.anchor.set(0.5);
                    sprite.width = sprite.height = cellSize * (index === 0 ? 1.2 : 0.85);
                    container.position.set(segment.to.x, segment.to.y);
                }
                container.visible = false;
                container.addChild(sprite);
                this.attach(container, 5510);
                this.pops.push({ container, sprite, kind, start: start + segment.delayMs });
            }
        }
        this.update();
    }
    public update(): void {
        const now = this.now();
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const p = this.pops[i],
                age = now - p.start;
            if (age >= LIGHTNING_LIFE_MS) {
                p.container.destroy({ children: true });
                this.pops.splice(i, 1);
                continue;
            }
            const frame = lightningFrameAt(age);
            p.container.visible = frame !== undefined;
            if (frame !== undefined) p.sprite.texture = this.frames![p.kind][frame];
        }
    }
    public clear(): void {
        this.generation++;
        this.pending = 0;
        for (const p of this.pops) p.container.destroy({ children: true });
        this.pops.length = 0;
        for (const frames of Object.values(this.frames ?? {})) for (const frame of frames) frame.destroy();
        this.frames = undefined;
        this.loading = undefined;
        // Shared atlas sources stay in Pixi's cache, matching the other globally loaded combat textures.
    }
}
