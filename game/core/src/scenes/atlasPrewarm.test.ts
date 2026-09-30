import { afterEach, beforeAll, expect, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";
import { BufferImageSource, Texture } from "pixi.js";
import { CREATURE_SPRITE_ANIMATION_SETTINGS } from "../pixi/creatureAnimationSettings";
import { RenderableUnit } from "./RenderableUnit";
import { RenderableUnit as ApprovedUnit } from "./LevelOneRenderableUnit";

const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
    }
    document.cookie ??= "";
});

afterEach(() => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
});

function sheet(): Texture {
    return new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 8, height: 8 }),
    });
}

// Both RenderableUnit flavours expose fromBase with the same structural shape; keep the helper open
// to the approved (level-one) class without coupling the two class hierarchies.
type AnyRenderableUnitFromBase = (
    base: Unit,
    resolver: (name: string) => Texture | undefined,
) => { prewarmCombatAtlasFrame(sources: WeakSet<object>): Texture | undefined; destroyVisuals(): void };

function create(
    resolver: (name: string) => Texture | undefined,
    ctor: AnyRenderableUnitFromBase = RenderableUnit.fromBase,
) {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    const effects = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Peasant", "peasant_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    return ctor(base, resolver);
}

test("a combat sheet is offered before walk and idle, and a missing sheet is not decoded", () => {
    const combat = sheet();
    const walk = sheet();
    const idle = sheet();
    const seen: string[] = [];
    const unit = create((name) => {
        seen.push(name);
        if (name.includes("_attack") || name.includes("_hit_") || name.includes("_death_") || name.includes("_cast_")) {
            return combat;
        }
        if (name.includes("_walk_")) return walk;
        if (name.includes("_idle_") || name.includes("_default_")) return idle;
        return undefined;
    });
    const uploaded = new WeakSet<object>();
    expect(unit.prewarmCombatAtlasFrame(uploaded)?.source).toBe(combat.source);
    uploaded.add(combat.source);
    expect(unit.prewarmCombatAtlasFrame(uploaded)?.source).toBe(walk.source);
    uploaded.add(walk.source);
    expect(unit.prewarmCombatAtlasFrame(uploaded)?.source).toBe(idle.source);
    uploaded.add(idle.source);
    expect(unit.prewarmCombatAtlasFrame(uploaded)).toBeUndefined();
    expect(seen.some((name) => /arbalester_idle_page_/.test(name))).toBe(false);
    unit.destroyVisuals();
});

test("an approved unit whose sheets are still downloading contributes nothing", () => {
    const unit = create(() => undefined);
    expect(unit.prewarmCombatAtlasFrame(new WeakSet())).toBeUndefined();
    unit.destroyVisuals();
    const approved = create(() => undefined, ApprovedUnit.fromBase);
    expect(approved.prewarmCombatAtlasFrame(new WeakSet())).toBeUndefined();
    approved.destroyVisuals();
});
