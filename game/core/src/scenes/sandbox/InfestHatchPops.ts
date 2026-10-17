import { Assets, Rectangle, Sprite, Texture } from "pixi.js";
import { images } from "../../imageAssets";
import { animationAtlases } from "../../generated/animation_atlases";
import type { RenderableUnit } from "../RenderableUnit";

const hatchAssets = {
    spider: { url: images.vfx_arachna_infest_spider_hatch_atlas, unit: "Vfx Arachna Infest Spider" },
    queen: { url: images.vfx_arachna_infest_queen_hatch_atlas, unit: "Vfx Arachna Infest Queen" },
} as const;
type HatchKind = keyof typeof hatchAssets;
export const INFEST_HATCH_SPEED = 1.35;
export const INFEST_HATCH_DURATION_MS = 2250 / INFEST_HATCH_SPEED;
// Cels have 128px transparent padding around the 768px idle coordinate system.
// Padding protects unfolding legs; it must not shrink the figure to fit the atlas cell.
const INFEST_REFERENCE_CANVAS = 768;
// Complete connected poses: top/front opening, crawl out, plant rear feet, settle.
// The final three cels use the canonical figure; hand off without any reveal mask or crossfade.
const INFEST_BODY_HANDOFF_FRAME = 13;
export function isInfestHatchSummon(event: { sourceAbility?: string; unitName: string; merged: boolean }): boolean {
    return (
        event.sourceAbility === "Infest" &&
        !event.merged &&
        (event.unitName === "Arachna Spider" || event.unitName === "Arachna Queen")
    );
}
const leases: Record<HatchKind, number> = { spider: 0, queen: 0 };
export function infestHatchFrame(ageMs: number): number | undefined {
    return ageMs >= INFEST_HATCH_DURATION_MS ? undefined : Math.floor((Math.max(0, ageMs) * INFEST_HATCH_SPEED) / 150);
}
/** Holds only the visual body; the authoritative summoned unit keeps its real id, stats and cells. */
export class InfestHatchPops {
    private frames = new Map<HatchKind, Texture[]>();
    private loads = new Map<HatchKind, Promise<Texture[] | undefined>>();
    private generation = 0;
    private leased = new Set<HatchKind>();
    private pops: {
        id: string;
        kind: HatchKind;
        resolve: () => RenderableUnit | undefined;
        corpseFinished: () => boolean;
        queuedAt: number;
        started?: number;
        sprite?: Sprite;
        registration?: { x: number; y: number; scaleX: number; scaleY: number };
        initialPosition: { x: number; y: number };
    }[] = [];
    public constructor(
        private readonly attach: (sprite: Sprite, z: number) => void,
        private readonly now: () => number = () => performance.now(),
    ) {}
    public get active(): boolean {
        return this.pops.length > 0;
    }
    private loadFrames(kind: HatchKind): Promise<Texture[] | undefined> {
        const frames = this.frames.get(kind),
            pending = this.loads.get(kind);
        if (frames) return Promise.resolve(frames);
        if (pending) return pending;
        const generation = this.generation;
        if (!this.leased.has(kind)) {
            this.leased.add(kind);
            leases[kind]++;
        }
        const load = Assets.load<Texture>(hatchAssets[kind].url).then(
            (atlas) => {
                if (generation !== this.generation) return undefined;
                const meta = animationAtlases[hatchAssets[kind].unit].hatch;
                const frames = Array.from(
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
                this.frames.set(kind, frames);
                return frames;
            },
            () => {
                if (generation === this.generation) this.clear();
                return undefined;
            },
        );
        this.loads.set(kind, load);
        return load;
    }
    public spawn(id: string, resolve: () => RenderableUnit | undefined, corpseFinished: () => boolean): void {
        if (this.pops.some((p) => p.id === id)) return;
        const unit = resolve();
        if (!unit || unit.isDead()) return;
        unit.setVisualVisible(false);
        const kind: HatchKind = unit.getName() === "Arachna Queen" ? "queen" : "spider";
        this.pops.push({
            id,
            kind,
            resolve,
            corpseFinished,
            queuedAt: this.now(),
            initialPosition: { ...unit.getPosition() },
        });
        void this.loadFrames(kind);
    }
    public update(_dt: number): void {
        const now = this.now();
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const p = this.pops[i],
                unit = p.resolve();
            const moved =
                unit &&
                Math.hypot(unit.getPosition().x - p.initialPosition.x, unit.getPosition().y - p.initialPosition.y) > 1;
            // Do not leave a newly selected/moving body hidden while the visual catch-up plays.
            if (!unit || unit.isDead() || moved || now - p.queuedAt > 12000) {
                if (unit) {
                    if (!unit.isDead()) unit.setVisualVisible(true);
                }
                p.sprite?.destroy();
                this.pops.splice(i, 1);
                continue;
            }
            unit.setVisualVisible(false);
            const frames = this.frames.get(p.kind);
            if (!frames) continue;
            if (p.started === undefined) {
                // Custom death cels finish first; generic shatter gets a short corpse beat.
                if (now - p.queuedAt < 550 || (!p.corpseFinished() && now - p.queuedAt < 6000)) continue;
                p.started = now;
                p.sprite = new Sprite(frames[0]);
                p.sprite.anchor.set(0.5);
                this.attach(p.sprite, 4100);
            }
            const frame = infestHatchFrame(now - p.started);
            if (frame === undefined) {
                unit.setVisualVisible(true);
                p.sprite?.destroy();
                this.pops.splice(i, 1);
                continue;
            }
            if (frame >= INFEST_BODY_HANDOFF_FRAME) {
                unit.setVisualVisible(true);
                p.sprite?.destroy();
                p.sprite = undefined;
                continue;
            }
            // Register once. The hidden unit can still update its idle texture/anchor or be
            // rehydrated; those changes must not reposition or resize the authored hatch cels.
            if (!p.registration) {
                const info = unit.getShatterInfo();
                if (!info) continue;
                p.registration = {
                    x: info.x,
                    y: info.y,
                    scaleX: (info.scaleX * info.texture.width) / INFEST_REFERENCE_CANVAS,
                    scaleY: (info.scaleY * info.texture.height) / INFEST_REFERENCE_CANVAS,
                };
            }
            if (!p.sprite) continue;
            const registration = p.registration;
            p.sprite.texture = frames[frame];
            p.sprite.position.set(registration.x, registration.y);
            p.sprite.scale.set(registration.scaleX, registration.scaleY);
            p.sprite.alpha = Math.min(1, ((now - p.started) * INFEST_HATCH_SPEED) / 120);
        }
    }
    public clear(): void {
        this.generation++;
        for (const p of this.pops) {
            const unit = p.resolve();
            if (unit) {
                if (!unit.isDead()) unit.setVisualVisible(true);
            }
            p.sprite?.destroy();
        }
        this.pops.length = 0;
        for (const frames of this.frames.values()) for (const frame of frames) frame.destroy();
        this.frames.clear();
        this.loads.clear();
        for (const kind of this.leased) {
            leases[kind]--;
            queueMicrotask(() => {
                if (leases[kind] === 0) void Assets.unload(hatchAssets[kind].url).catch(() => undefined);
            });
        }
        this.leased.clear();
    }
}
