import type { SpellAtmosphereEmitter } from "./SpellAtmosphere";
import { emitFireAtmosphere } from "./FireSpellAtmosphere";
import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../generated/image_imports";
import { FIRE_SPELL_PLAYBACK_SPEED, METEOR_FLIGHT_SCALE } from "../../settings/fireSpellTiming";
import type { WhirlpoolFootprint } from "./WhirlpoolSprites";

type Footprint = WhirlpoolFootprint;
type Kind = "ring" | "meteor";
const SOURCES = {
    ring: { url: images.vfx_ring_fire_burst_atlas, meta: animationAtlases["Vfx Ring Fire"].burst },
    meteor: { url: images.vfx_meteor_shower_impact_atlas, meta: animationAtlases["Vfx Meteor Shower"].impact },
};
export const FIRE_RING_LIFE_MS = 1400;
export const METEOR_FALL_MS = 640;
export const METEOR_IMPACT_MS = 630;
type Cast = {
    kind: Kind;
    container: Container;
    sprite: Sprite;
    footprint: Footprint;
    target: Footprint;
    startedAt: number;
    delay: number;
};
const valid = (f: Footprint): boolean =>
    [f.center.x, f.center.y, f.width, f.height].every(Number.isFinite) && f.width > 0 && f.height > 0;
const copy = (f: Footprint): Footprint => ({ ...f, center: { ...f.center } });

/** One randomized impact inside each aimed cell, plus three extra staggered impacts. */
export function meteorImpactPlan(cells: readonly Footprint[], random: () => number = Math.random) {
    const shuffled = cells.filter(valid).map(copy);
    const unitRandom = () => Math.max(0, Math.min(0.999999, random()));
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(unitRandom() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const count = shuffled.length ? shuffled.length + Math.min(3, shuffled.length) : 0;
    return Array.from({ length: count }, (_, i) => {
        const cell = shuffled[i % shuffled.length];
        return {
            footprint: {
                center: {
                    x: cell.center.x + (unitRandom() - 0.5) * cell.width * 0.24,
                    y: cell.center.y + (unitRandom() - 0.5) * cell.height * 0.24,
                },
                width: cell.width,
                height: cell.height,
            },
            delay: i * 95 + unitRandom() * 55,
        };
    });
}

/** Painted cels; flight is translated in world coordinates, impacts stay on the projected floor. */
export class SpellFireSprites {
    private frames: Partial<Record<Kind, Texture[]>> = {};
    private loading: Partial<Record<Kind, Promise<void>>> = {};
    private casts: Cast[] = [];
    private pending = 0;
    private generation = 0;
    public constructor(
        private readonly attach: (container: Container, z: number) => void,
        private readonly now: () => number = () => performance.now(),
        private readonly emitAtmosphere?: SpellAtmosphereEmitter,
    ) {}
    public get active(): boolean {
        return this.pending > 0 || this.casts.length > 0;
    }
    private preload(kind: Kind): Promise<void> {
        if (this.frames[kind]) return Promise.resolve();
        if (this.loading[kind]) return this.loading[kind]!;
        const generation = this.generation;
        const { url, meta } = SOURCES[kind];
        return (this.loading[kind] = Assets.load<Texture>(url)
            .then((atlas) => {
                if (generation !== this.generation) return;
                this.frames[kind] = Array.from(
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
            })
            .catch((error) => {
                if (generation !== this.generation) return;
                this.loading[kind] = undefined;
                console.error("Fire spell atlas failed to load", kind, error);
            }));
    }
    public async ring(target: Footprint, area: Footprint): Promise<void> {
        if (!valid(target) || !valid(area)) return;
        await this.spawn("ring", [{ footprint: copy(area), target: copy(target), delay: 0 }]);
    }
    public async meteors(cells: readonly Footprint[]): Promise<void> {
        await this.spawn(
            "meteor",
            meteorImpactPlan(cells).map((impact) => ({ ...impact, target: impact.footprint })),
        );
    }
    private async spawn(kind: Kind, plans: Pick<Cast, "footprint" | "target" | "delay">[]): Promise<void> {
        if (!plans.length) return;
        const generation = this.generation;
        this.pending++;
        await this.preload(kind);
        if (generation !== this.generation) return;
        this.pending--;
        const frames = this.frames[kind];
        if (!frames) return;
        const startedAt = this.now();
        for (const plan of plans) {
            const container = new Container();
            container.scale.y = -1;
            const sprite = new Sprite(frames[0]);
            sprite.anchor.set(0.5);
            container.addChild(sprite);
            this.attach(container, 5520);
            this.casts.push({ ...plan, kind, container, sprite, startedAt });
        }
        this.update();
    }
    public update(): void {
        const now = this.now();
        for (let i = this.casts.length - 1; i >= 0; i--) {
            const cast = this.casts[i];
            const age = (now - cast.startedAt) * FIRE_SPELL_PLAYBACK_SPEED - cast.delay;
            const life = cast.kind === "ring" ? FIRE_RING_LIFE_MS : METEOR_FALL_MS + METEOR_IMPACT_MS;
            if (age >= life) {
                cast.container.destroy({ children: true });
                this.casts.splice(i, 1);
                continue;
            }
            cast.container.visible = age >= 0;
            if (age < 0) continue;
            const { sprite, container, footprint: area, target } = cast;
            emitFireAtmosphere(this.emitAtmosphere, cast.kind, age, target, area);
            if (cast.kind === "ring") {
                // Hold the growing orb inside the target footprint, then burst into the surrounding cells.
                const frame = Math.min(11, Math.floor(age / (FIRE_RING_LIFE_MS / 12)));
                sprite.texture = this.frames.ring![frame];
                const expansion = Math.max(0, Math.min(1, (age - 310) / 240));
                const orbSize = Math.min(target.width, target.height) * 1.55;
                sprite.width = orbSize + (area.width / 0.94 - orbSize) * expansion;
                sprite.height = orbSize + (area.height / 0.87 - orbSize) * expansion;
                container.position.set(
                    target.center.x + (area.center.x - target.center.x) * expansion,
                    target.center.y + (area.center.y - target.center.y) * expansion,
                );
                container.alpha = Math.min(1, age / 70, (life - age) / 260);
            } else if (age < METEOR_FALL_MS) {
                const t = age / METEOR_FALL_MS;
                const remaining = 1 - t * t;
                sprite.texture = this.frames.meteor![Math.min(4, Math.floor(t * 5))];
                // The rock head is lower-left in the authored flight cels; anchor the head, not the tail.
                sprite.anchor.set(0.24, 0.72);
                sprite.width = area.width * 1.45 * METEOR_FLIGHT_SCALE;
                sprite.height = area.width * 1.45 * METEOR_FLIGHT_SCALE;
                container.position.set(
                    area.center.x + remaining * area.width * 2.2,
                    area.center.y + remaining * area.height * 4.2,
                );
                container.alpha = Math.min(1, age / 90);
            } else {
                const impactAge = age - METEOR_FALL_MS;
                sprite.texture = this.frames.meteor![5 + Math.min(6, Math.floor(impactAge / 90))];
                sprite.anchor.set(0.5);
                sprite.width = area.width * 0.82;
                sprite.height = area.height * 0.96;
                container.position.set(area.center.x, area.center.y);
                container.alpha = Math.min(1, (life - age) / 220);
            }
        }
    }
    public clear(): void {
        this.generation++;
        this.pending = 0;
        for (const cast of this.casts) cast.container.destroy({ children: true });
        this.casts = [];
        for (const frames of Object.values(this.frames)) for (const frame of frames) frame.destroy();
        this.frames = {};
        this.loading = {};
    }
}
