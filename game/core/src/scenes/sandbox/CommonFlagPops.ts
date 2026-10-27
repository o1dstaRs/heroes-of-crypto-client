import type { FlagOverlayAttach } from "./FlagOverlayLayout";
import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";
import type { OgreSpellFlagKind } from "../ogreSpellFlagEffects";
import type { SatyrSpellFlagKind } from "../satyrSpellFlagEffects";
import { overheadEffectElapsedMs, OVERHEAD_EFFECT_DURATION_MS } from "../../settings/statusEffectTiming";

import type { MageSpellFlagKind } from "../mageSpellFlagEffects";
import type { TroglodyteFlagKind } from "../troglodyteFlagEffects";
import { InterpolatedFlagCel } from "./InterpolatedFlagCel";
import type { BlacksmithFlagKind } from "../blacksmithFlagEffects";

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
    | BlacksmithFlagKind
    | CommonFlagPopKind
    | OgreSpellFlagKind
    | SatyrSpellFlagKind
    | MageSpellFlagKind
    | TroglodyteFlagKind
    | "aggr"
    | "stun"
    | "paralysis"
    | "penetrating_bite"
    | "piercing_spear"
    | "backstab"
    | "empower"
    | "dulling_defense"
    | "hamstring"
    | "bitter_experience"
    | "lucky_strike"
    | "shatter_armor"
    | "leather_armor"
    | "small_specie"
    | "wild_regeneration"
    | "wind_flow"
    | "shadow_touch"
    | "absolving_arrow"
    | "unicorn_retaliation"
    | "unicorn_blindness"
    | "multi_attack";
const definitions = {
    blacksmith_double_punch: {
        url: images.vfx_blacksmith_double_punch_pop_atlas,
        meta: animationAtlases["Vfx Blacksmith Double Punch"].pop,
    },
    blacksmith_double_shot: {
        url: images.vfx_blacksmith_double_shot_pop_atlas,
        meta: animationAtlases["Vfx Blacksmith Double Shot"].pop,
    },
    blacksmith_frozen_sword: {
        url: images.vfx_blacksmith_frozen_sword_pop_atlas,
        meta: animationAtlases["Vfx Blacksmith Frozen Sword"].pop,
    },
    blacksmith_frozen_bow: {
        url: images.vfx_blacksmith_frozen_bow_pop_atlas,
        meta: animationAtlases["Vfx Blacksmith Frozen Bow"].pop,
    },

    blacksmith_craft: {
        url: images.vfx_blacksmith_craft_pop_atlas,
        meta: animationAtlases["Vfx Blacksmith Craft"].pop,
    },
    blacksmith_armor: {
        url: images.vfx_blacksmith_armor_pop_atlas,
        meta: animationAtlases["Vfx Blacksmith Armor"].pop,
    },
    blacksmith_weapon: {
        url: images.vfx_blacksmith_weapon_pop_atlas,
        meta: animationAtlases["Vfx Blacksmith Weapon"].pop,
    },
    bitter_experience: {
        url: images.vfx_bitter_experience_pop_atlas,
        meta: animationAtlases["Vfx Bitter Experience"].pop,
    },
    leather_armor: { url: images.vfx_leather_armor_pop_atlas, meta: animationAtlases["Vfx Leather Armor"].pop },
    small_specie: { url: images.vfx_small_specie_pop_atlas, meta: animationAtlases["Vfx Small Specie"].pop },
    lucky_strike: { url: images.vfx_lucky_strike_pop_atlas, meta: animationAtlases["Vfx Lucky Strike"].pop },
    stun: { url: images.vfx_stun_pop_atlas, meta: animationAtlases["Vfx Stun"].pop },
    backstab: { url: images.vfx_backstab_pop_atlas, meta: animationAtlases["Vfx Backstab"].pop },
    blind_fury: { url: images.vfx_blind_fury_pop_atlas, meta: animationAtlases["Vfx Blind Fury"].pop },
    miner: { url: images.vfx_miner_pop_atlas, meta: animationAtlases["Vfx Miner"].pop },
    madness: { url: images.vfx_madness_pop_atlas, meta: animationAtlases["Vfx Madness"].pop },
    mage_misfortune: { url: images.vfx_mage_misfortune_pop_atlas, meta: animationAtlases["Vfx Mage Misfortune"].pop },
    mage_fireforged: { url: images.vfx_mage_fireforged_pop_atlas, meta: animationAtlases["Vfx Mage Fireforged"].pop },
    piercing_spear: { url: images.vfx_piercing_spear_pop_atlas, meta: animationAtlases["Vfx Piercing Spear"].pop },
    wind_flow: { url: images.vfx_wind_flow_pop_atlas, meta: animationAtlases["Vfx Wind Flow"].pop },
    aggr: { url: images.vfx_aggr_pop_atlas, meta: animationAtlases["Vfx Aggr"].pop },
    satyr_courage: { url: images.vfx_satyr_courage_pop_atlas, meta: animationAtlases["Vfx Satyr Courage"].pop },
    satyr_helping_hand: {
        url: images.vfx_satyr_helping_hand_pop_atlas,
        meta: animationAtlases["Vfx Satyr Helping Hand"].pop,
    },
    wild_regeneration: {
        url: images.vfx_wild_regeneration_pop_atlas,
        meta: animationAtlases["Vfx Wild Regeneration"].pop,
    },
    shadow_touch: { url: images.vfx_shadow_touch_pop_atlas, meta: animationAtlases["Vfx Shadow Touch"].pop },
    hamstring: { url: images.vfx_hamstring_pop_atlas, meta: animationAtlases["Vfx Hamstring"].pop },
    shatter_armor: { url: images.vfx_shatter_armor_pop_atlas, meta: animationAtlases["Vfx Shatter Armor"].pop },
    penetrating_bite: {
        url: images.vfx_penetrating_bite_pop_atlas,
        meta: animationAtlases["Vfx Penetrating Bite"].pop,
    },
    multi_attack: { url: images.vfx_multi_attack_pop_atlas, meta: animationAtlases["Vfx Multi Attack"].pop },
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
const authoredDurations = new Map<FlagPopKind, number>(
    Object.entries(definitions).map(([kind, { meta }]) => [
        kind as FlagPopKind,
        meta.frameDurationsMs!.reduce((sum, ms) => sum + ms, 0),
    ]),
);
const atlasLeases = new Map<FlagPopKind, number>();

/** Share atlas ownership with shader variants using the same painted source. */
export function retainFlagAtlas(kind: FlagPopKind): void {
    atlasLeases.set(kind, (atlasLeases.get(kind) ?? 0) + 1);
}
export function releaseFlagAtlas(kind: FlagPopKind): void {
    const remaining = Math.max(0, (atlasLeases.get(kind) ?? 1) - 1);
    atlasLeases.set(kind, remaining);
    if (remaining > 0) return;
    queueMicrotask(() => {
        if (atlasLeases.get(kind) !== 0) return;
        atlasLeases.delete(kind);
        void Assets.unload(definitions[kind].url).catch(() => undefined);
    });
}

/** Authored cels end at their own duration, capped at one second. */
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
    private readonly pendingUnits = new Map<string, number>();
    private pops: {
        unitId: string;
        container: Container;
        sprite: Sprite | InterpolatedFlagCel;
        startedAtMs: number;
        follow?: () => Anchor | undefined;
        offsetY: number;
    }[] = [];
    public constructor(
        private readonly kind: FlagPopKind,
        private readonly attach: FlagOverlayAttach,
        private readonly now: () => number = () => performance.now(),
    ) {}
    public get active(): boolean {
        return this.pops.length > 0;
    }
    /** Warm the atlas during the first strike without holding up combat playback. */
    public preload(): void {
        void this.loadFrames();
    }
    private loadFrames(): Promise<Texture[] | undefined> {
        if (this.frames) return Promise.resolve(this.frames);
        if (this.load) return this.load;
        if (!this.leaseHeld) {
            this.leaseHeld = true;
            retainFlagAtlas(this.kind);
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
        const existing = this.pops.find((pop) => pop.unitId === unitId);
        if (existing) {
            // A third/further strike must be visible even while the preceding pop is dissolving.
            if (
                this.kind === "small_specie" ||
                this.kind === "multi_attack" ||
                this.kind === "penetrating_bite" ||
                this.kind === "backstab" ||
                this.kind === "piercing_spear" ||
                this.kind === "blind_fury" ||
                this.kind === "leather_armor" ||
                this.kind === "miner" ||
                this.kind === "madness" ||
                this.kind === "bitter_experience" ||
                this.kind === "lucky_strike" ||
                this.kind.startsWith("blacksmith_")
            ) {
                existing.startedAtMs = this.now();
                existing.follow = follow;
                existing.container.position.set(anchor.x, anchor.y + existing.offsetY);
                this.update(0);
            }
            return;
        }
        if (this.pendingUnits.has(unitId)) {
            if (
                this.kind === "small_specie" ||
                this.kind === "multi_attack" ||
                this.kind === "penetrating_bite" ||
                this.kind === "backstab" ||
                this.kind === "piercing_spear" ||
                this.kind === "blind_fury" ||
                this.kind === "leather_armor" ||
                this.kind === "miner" ||
                this.kind === "madness" ||
                this.kind === "bitter_experience" ||
                this.kind === "lucky_strike" ||
                this.kind.startsWith("blacksmith_")
            )
                this.pendingUnits.set(unitId, this.now());
            return;
        }
        this.pendingUnits.set(unitId, this.now());
        const generation = this.generation;
        try {
            const frames = await this.loadFrames();
            if (!frames || generation !== this.generation) return;
            // A cold download must not play a stale attack cue after the strike has finished.
            const startedAtMs =
                this.kind === "small_specie" ||
                this.kind === "multi_attack" ||
                this.kind === "shadow_touch" ||
                this.kind === "hamstring" ||
                this.kind === "stun" ||
                this.kind === "penetrating_bite" ||
                this.kind === "backstab" ||
                this.kind === "piercing_spear" ||
                this.kind === "blind_fury" ||
                this.kind === "leather_armor" ||
                this.kind === "miner" ||
                this.kind === "madness" ||
                this.kind === "bitter_experience" ||
                this.kind === "lucky_strike" ||
                this.kind.startsWith("blacksmith_")
                    ? this.pendingUnits.get(unitId)!
                    : this.now();
            if (this.now() - startedAtMs >= OVERHEAD_EFFECT_DURATION_MS) return;
            const position = follow ? follow() : anchor;
            if (!position) return;
            const container = new Container();
            const size = cellSize * 1.45 * 0.9;
            const sprite = this.kind === "blind_fury" ? new InterpolatedFlagCel(frames, size) : new Sprite(frames[0]);
            if (sprite instanceof Sprite) {
                sprite.anchor.set(0.5, 1);
                sprite.width = sprite.height = size;
            }
            container.addChild(sprite);
            const offsetY = cellSize * 0.07;
            container.position.set(position.x, position.y + offsetY);
            container.scale.set(1, -1);
            this.attach(container, 5520, follow ?? (() => anchor));
            this.pops.push({ unitId, container, sprite, startedAtMs, follow, offsetY });
            this.update(0);
        } finally {
            if (generation === this.generation) this.pendingUnits.delete(unitId);
        }
    }
    public update(_dtSeconds: number): void {
        // Scene steps are fixed and capped under load. An overhead UI effect must use real elapsed time.
        const now = this.now();
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const pop = this.pops[i];
            const ageMs = Math.max(0, now - pop.startedAtMs);
            const authoredDuration = authoredDurations.get(this.kind)!;
            const elapsed = overheadEffectElapsedMs(ageMs, authoredDuration);
            const frame = commonFlagFrameAt(this.kind, elapsed);
            const position = pop.follow?.();
            if (frame === undefined || (pop.follow && !position)) {
                pop.container.destroy({ children: true });
                this.pops.splice(i, 1);
                continue;
            }
            if (pop.sprite instanceof InterpolatedFlagCel) {
                const durations = definitions[this.kind].meta.frameDurationsMs!;
                let start = 0;
                for (let f = 0; f < frame; f++) start += durations[f];
                pop.sprite.setCel(frame, (elapsed - start) / durations[frame]);
            } else {
                pop.sprite.texture = this.frames![frame];
            }
            if (
                this.kind === "hamstring" ||
                this.kind === "stun" ||
                this.kind === "blind_fury" ||
                this.kind === "leather_armor" ||
                this.kind === "miner" ||
                this.kind === "madness" ||
                this.kind === "bitter_experience" ||
                this.kind === "lucky_strike" ||
                this.kind.startsWith("blacksmith_")
            ) {
                const phase = ageMs / OVERHEAD_EFFECT_DURATION_MS;
                pop.sprite.alpha = Math.max(0, Math.min(1, phase / 0.08, (1 - phase) / 0.22));
            }
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
            releaseFlagAtlas(this.kind);
        }
    }
}
