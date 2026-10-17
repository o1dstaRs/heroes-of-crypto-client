import type { SpellAtmosphereEmitter } from "./SpellAtmosphere";
import { Assets, Container, Rectangle, MeshPlane, Texture, Graphics } from "pixi.js";
import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../generated/image_imports";
import { whirlpoolEdgeScale } from "./WhirlpoolWaterEdge";

export const WHIRLPOOL_LIFE_MS = 2600;
const APPEAR_MS = 180;
const DRAIN_MS = 400;
const MESH_VERTICES = 17;
const META = animationAtlases["Vfx Whirlpool"].swirl;

export type WhirlpoolFootprint = Readonly<{
    center: Readonly<{ x: number; y: number }>;
    width: number;
    height: number;
}>;

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Actual painted sprite cels contain both rotation and inward water transport. No rigid sprite spin. */
export class WhirlpoolSprites {
    private frames?: Texture[];
    private loading?: Promise<void>;
    private generation = 0;
    private pending = 0;
    private casts: {
        container: Container;
        sprite: MeshPlane;
        details: Graphics;
        footprint: WhirlpoolFootprint;
        startedAt: number;
    }[] = [];
    public constructor(
        private readonly attach: (container: Container, z: number) => void,
        private readonly now: () => number = () => performance.now(),
        private readonly emitAtmosphere?: SpellAtmosphereEmitter,
    ) {}
    public get active(): boolean {
        return this.pending > 0 || this.casts.length > 0;
    }
    public preload(): Promise<void> {
        if (this.frames) return Promise.resolve();
        if (this.loading) return this.loading;
        const generation = this.generation;
        this.loading = Assets.load<Texture>(images.vfx_whirlpool_swirl_atlas)
            .then((atlas) => {
                if (generation !== this.generation) return;
                this.frames = Array.from(
                    { length: META.frameCount },
                    (_, i) =>
                        new Texture({
                            source: atlas.source,
                            frame: new Rectangle(
                                (i % META.layout.cols) * META.frameWidth,
                                Math.floor(i / META.layout.cols) * META.frameHeight,
                                META.frameWidth,
                                META.frameHeight,
                            ),
                        }),
                );
            })
            .catch((error) => {
                if (generation !== this.generation) return;
                this.loading = undefined;
                console.error("Whirlpool sprite atlas failed to load", error);
            });
        return this.loading;
    }
    public async spawn(footprint: WhirlpoolFootprint): Promise<void> {
        const { center, width, height } = footprint;
        if (![center.x, center.y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
        const captured = { center: { ...center }, width, height };
        const generation = this.generation;
        this.pending++;
        await this.preload();
        if (generation !== this.generation) return;
        this.pending--;
        if (!this.frames) return;
        const container = new Container();
        container.position.set(captured.center.x, captured.center.y);
        container.scale.y = -1;
        const sprite = new MeshPlane({ texture: this.frames[0], verticesX: MESH_VERTICES, verticesY: MESH_VERTICES });
        sprite.autoResize = false;
        const details = new Graphics();
        container.addChild(sprite, details);
        // On the floor, above board marks but below every creature and its damage numbers.
        this.attach(container, 80);
        this.casts.push({ container, sprite, details, footprint: captured, startedAt: this.now() });
        this.update();
    }
    public update(): void {
        const now = this.now();
        for (let i = this.casts.length - 1; i >= 0; i--) {
            const cast = this.casts[i];
            const age = Math.max(0, now - cast.startedAt);
            if (age >= WHIRLPOOL_LIFE_MS) {
                cast.sprite.geometry.destroy();
                cast.container.destroy({ children: true });
                this.casts.splice(i, 1);
                continue;
            }
            const appear = smooth(Math.min(1, age / APPEAR_MS));
            const drain = smooth(Math.max(0, (age - (WHIRLPOOL_LIFE_MS - DRAIN_MS)) / DRAIN_MS));
            const size = (0.65 + 0.35 * appear) * (1 - 0.75 * drain);
            cast.sprite.texture = this.frames![Math.floor((age * META.fps) / 1000) % META.frameCount];
            const buffer = cast.sprite.geometry.getAttribute("aPosition").buffer;
            for (let vertex = 0; vertex < MESH_VERTICES * MESH_VERTICES; vertex++) {
                const x = (vertex % MESH_VERTICES) / (MESH_VERTICES - 1) - 0.5;
                const y = Math.floor(vertex / MESH_VERTICES) / (MESH_VERTICES - 1) - 0.5;
                const wave = whirlpoolEdgeScale(Math.atan2(y, x), age, Math.hypot(x, y) * 2);
                buffer.data[vertex * 2] = x * META.frameWidth * wave;
                buffer.data[vertex * 2 + 1] = y * META.frameHeight * wave;
            }
            buffer.update();
            cast.sprite.scale.set(
                (cast.footprint.width * size) / META.frameWidth,
                (cast.footprint.height * size) / META.frameHeight,
            );
            cast.container.alpha = appear * (1 - drain);
            this.emitAtmosphere?.({
                x: cast.footprint.center.x,
                y: cast.footprint.center.y,
                width: cast.footprint.width * 0.55,
                height: cast.footprint.height * 0.55,
                light: cast.container.alpha * 0.12,
                water: cast.container.alpha,
                cool: 1,
            });
            // Broken foam filaments advect inward; small specular glints travel at different speeds.
            const detail = cast.details;
            detail.clear();
            const width = cast.footprint.width * size,
                height = cast.footprint.height * size;
            for (let k = 0; k < 28; k++) {
                const phase = (age / (1300 + (k % 5) * 110) + k * 0.137) % 1;
                const radius = 0.46 - phase * 0.34;
                const angle = k * 2.39996 + age * 0.0018 + phase * 1.7;
                const alpha = Math.sin(phase * Math.PI) * (k % 4 === 0 ? 0.46 : 0.23);
                for (let j = 0; j < 5; j++) {
                    const a = angle + j * 0.035,
                        r = radius - j * 0.002;
                    const x = Math.cos(a) * width * r,
                        y = Math.sin(a) * height * r;
                    if (j === 0) detail.moveTo(x, y);
                    else detail.lineTo(x, y);
                }
                detail.stroke({ width: Math.max(0.4, width * 0.003), color: 0xb8e2e7, alpha, cap: "round" });
                if (k % 4 === 0)
                    detail
                        .ellipse(
                            Math.cos(angle) * width * radius,
                            Math.sin(angle) * height * radius,
                            width * 0.006,
                            height * 0.004,
                        )
                        .fill({ color: 0xe0f8f5, alpha });
            }
        }
    }
    public clear(): void {
        this.generation++;
        this.pending = 0;
        for (const cast of this.casts) {
            cast.sprite.geometry.destroy();
            cast.container.destroy({ children: true });
        }
        this.casts = [];
        for (const frame of this.frames ?? []) frame.destroy();
        this.frames = undefined;
        this.loading = undefined;
        // The atlas source remains owned by the shared Assets cache.
    }
}
