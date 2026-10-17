import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";
import type { OgreSpellFlagKind } from "../ogreSpellFlagEffects";

type Anchor = Readonly<{ x: number; y: number }>;
export const COMMON_FLAG_POP_KINDS = [
    "lucky",
    "miss",
    "resist",
    "heal",
    "absorb",
    "enchanted_skin",
    "made_of_fire",
] as const;
export type CommonFlagPopKind = (typeof COMMON_FLAG_POP_KINDS)[number];
export type FlagPopKind =
    | CommonFlagPopKind
    | OgreSpellFlagKind
    | "paralysis"
    | "empower"
    | "dulling_defense"
    | "absolving_arrow"
    | "unicorn_retaliation"
    | "unicorn_blindness";
const definitions = {
    paralysis: { url: images.vfx_paralysis_pop_atlas, meta: animationAtlases["Vfx Paralysis"].pop },
    unicorn_retaliation: {
        url: images.vfx_unicorn_one_in_the_field_pop_atlas,
        meta: animationAtlases["Vfx Unicorn One In The Field"].pop,
    },
    unicorn_blindness: {
        url: images.vfx_unicorn_blindness_pop_atlas,
        meta: animationAtlases["Vfx Unicorn Blindness"].pop,
    },
    absolving_arrow: { url: images.vfx_absolving_arrow_pop_atlas, meta: animationAtlases["Vfx Absolving Arrow"].pop },
    dulling_defense: {
        url: images.vfx_dulling_defense_pop_atlas,
        meta: animationAtlases["Vfx Dulling Defense"].pop,
    },
    empower: { url: images.vfx_empower_pop_atlas, meta: animationAtlases["Vfx Empower"].pop },
    made_of_fire: { url: images.vfx_made_of_fire_pop_atlas, meta: animationAtlases["Vfx Made Of Fire"].pop },
    enchanted_skin: { url: images.vfx_enchanted_skin_pop_atlas, meta: animationAtlases["Vfx Enchanted Skin"].pop },
    lucky: { url: images.vfx_common_lucky_pop_atlas, meta: animationAtlases["Vfx Common Lucky"].pop },
    miss: { url: images.vfx_common_miss_pop_atlas, meta: animationAtlases["Vfx Common Miss"].pop },
    resist: { url: images.vfx_common_resist_pop_atlas, meta: animationAtlases["Vfx Common Resist"].pop },
    heal: { url: images.vfx_common_heal_pop_atlas, meta: animationAtlases["Vfx Common Heal"].pop },
    absorb: { url: images.vfx_common_absorb_pop_atlas, meta: animationAtlases["Vfx Common Absorb"].pop },
    ogre_riot: { url: images.vfx_ogre_riot_pop_atlas, meta: animationAtlases["Vfx Ogre Riot"].pop },
    ogre_magic_mirror: {
        url: images.vfx_ogre_magic_mirror_pop_atlas,
        meta: animationAtlases["Vfx Ogre Magic Mirror"].pop,
    },
};
const atlasLeases = new Map<FlagPopKind, number>();

/** Atlas effects have an exact one-second lifetime. */
export function commonFlagFrameAt(kind: FlagPopKind, elapsedMs: number): number | undefined {
    if (elapsedMs >= 1000 - 1e-7) return undefined;
    let end = 0;
    for (const [frame, duration] of definitions[kind].meta.frameDurationsMs!.entries()) {
        end += duration;
        if (Math.max(0, elapsedMs) < end) return frame;
    }
    return undefined;
}

/** Painted common combat results above the flag; repeated events share one activation per kind. */
export class CommonFlagPops {
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
        private readonly kind: FlagPopKind,
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
            atlasLeases.set(this.kind, (atlasLeases.get(this.kind) ?? 0) + 1);
        }
        const generation = this.generation;
        const { url: atlasUrl, meta } = definitions[this.kind];
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
            const size = cellSize * 1.45 * 0.9;
            sprite.width = sprite.height = size;
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
        // Scene steps are fixed and capped under load. A one-second UI effect must use real elapsed time.
        const now = this.now();
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const pop = this.pops[i];
            const ageMs = Math.max(0, now - pop.startedAtMs);
            const frame = commonFlagFrameAt(this.kind, ageMs);
            const position = pop.follow?.();
            if (frame === undefined || (pop.follow && !position)) {
                pop.container.destroy({ children: true });
                this.pops.splice(i, 1);
                continue;
            }
            pop.sprite.texture = this.frames![frame];
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
            atlasLeases.set(this.kind, (atlasLeases.get(this.kind) ?? 1) - 1);
            queueMicrotask(() => {
                if (atlasLeases.get(this.kind) === 0)
                    void Assets.unload(definitions[this.kind].url).catch(() => undefined);
            });
        }
    }
}
