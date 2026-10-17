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
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { CREATURE_SPRITE_ANIMATION_SETTINGS, usesApprovedBaseAnimations } from "../pixi/creatureAnimationSettings";
import { RenderableUnit } from "./RenderableUnit";
import creatures from "../../../heroes-of-crypto-common/src/configuration/creatures.json";

const roster = Object.entries(creatures).flatMap(([faction, entries]) =>
    typeof entries === "object" ? Object.keys(entries).map((name) => [faction, name] as const) : [],
);
const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const texture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
});
beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
    document.cookie ??= "";
});
afterEach(() => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
});
type Playback = {
    frames: Texture[];
    frameIndex: number;
    stateName: string;
    frameDurationsMs?: readonly number[];
    durationPerFrame?: number;
    footAnchorY: number;
    holdLastFrame: boolean;
    authoredRealTime: boolean;
};
type Visuals = {
    sprite: Sprite;
    walkAnim?: Playback;
    oneShotAnim?: Playback;
    selectionAnimFrames?: Texture[];
    selectionAnimationStartedAtMs: number;
};
const internals = (unit: RenderableUnit) => unit as unknown as Visuals;
function create(faction: string, name: string, lab: boolean) {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = !lab;
    const effects = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, faction, name, name.toLowerCase().replaceAll(" ", "_") + "_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const unit = RenderableUnit.fromBase(base, () => texture);
    const root = new Container();
    unit.setPosition(0, 1024);
    if (lab) unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(root, grid);
    internals(unit).selectionAnimationStartedAtMs = 0;
    return { unit, root };
}
function samePose(a: RenderableUnit, b: RenderableUnit) {
    const left = internals(a).sprite,
        right = internals(b).sprite;
    expect(left.width).toBeCloseTo(right.width, 5);
    expect(left.height).toBeCloseTo(right.height, 5);
    expect(left.anchor.x).toBeCloseTo(right.anchor.x, 5);
    expect(left.anchor.y).toBeCloseTo(right.anchor.y, 5);
    expect((left.filters ?? []).map((f) => f.constructor.name)).toEqual(
        (right.filters ?? []).map((f) => f.constructor.name),
    );
}
test.each(roster)("%s / %s matches the lab at rest, in motion and in every authored action", (faction, name) => {
    const runtime = create(faction, name, false),
        lab = create(faction, name, true);
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    try {
        expect(internals(runtime.unit).selectionAnimFrames?.length).toBe(
            internals(lab.unit).selectionAnimFrames?.length,
        );
        samePose(runtime.unit, lab.unit);
        runtime.unit.setCreatureAnimationLabPreviewEnabled(false);
        samePose(runtime.unit, lab.unit);
        for (const unit of [runtime.unit, lab.unit]) unit.startBoardWalkAnimation(1, 3);

        expect(internals(runtime.unit).walkAnim?.frames.length).toBe(internals(lab.unit).walkAnim?.frames.length);
        for (const distance of [0, 0.2, 0.65, 1.3, 2, 2.6]) {
            for (const unit of [runtime.unit, lab.unit]) {
                unit.setBoardWalkDistanceCells(distance);
                unit.stepSpawnAnimation(0.016);
            }
            expect(internals(runtime.unit).walkAnim?.frameIndex).toBe(internals(lab.unit).walkAnim?.frameIndex);
            samePose(runtime.unit, lab.unit);
        }
        for (const unit of [runtime.unit, lab.unit]) unit.stopBoardWalkAnimation();
        const melee = ["Peasant", "Squire", "Wolf", "Troglodyte", "Scavenger"].includes(name)
            ? "attack"
            : "melee_attack";
        const states = usesApprovedBaseAnimations(name) ? [melee, melee + "_up", melee + "_down", "hit", "death"] : [];
        if (
            ["Arbalester", "Orc", "Dryad", "Centaur", "Elf", "Medusa", "Monk", "Cyclops", "Zena", "Beholder"].includes(
                name,
            )
        )
            states.push("attack", "attack_up", "attack_down");
        if (
            [
                "Blacksmith",
                "Wandering Mage",
                "Troll",
                "Battle Mage",
                "Healer",
                "Behemoth",
                "Ogre Mage",
                "Satyr",
                "Unicorn",
                "Valkyrie",
            ].includes(name)
        )
            states.push("cast");
        for (const state of states) {
            expect(runtime.unit.hasAnimationState(state), state).toBe(lab.unit.hasAnimationState(state));
            if (!lab.unit.hasAnimationState(state)) continue;
            expect(runtime.unit.getAnimationTextureKey(state)).toBe(lab.unit.getAnimationTextureKey(state));
            const runtimeStarted = runtime.unit.playOneShotAnimation(state);
            const labStarted = lab.unit.playOneShotAnimation(state, undefined, true);
            expect(runtimeStarted, state).toBe(labStarted);
            if (!labStarted) continue;
            if (!internals(lab.unit).oneShotAnim) continue;
            const action = internals(runtime.unit).oneShotAnim!,
                preview = internals(lab.unit).oneShotAnim!;
            expect(action.frames.length).toBe(preview.frames.length);
            expect(action.frameDurationsMs).toEqual(preview.frameDurationsMs);
            expect(action.durationPerFrame).toBe(preview.durationPerFrame);
            expect(action.authoredRealTime).toBe(preview.authoredRealTime);
            expect(action.holdLastFrame).toBe(preview.holdLastFrame);
            for (const ms of [0, 20, 70, 110]) {
                for (const unit of [runtime.unit, lab.unit]) unit.stepOneShotAnimation(ms);
                expect(internals(runtime.unit).oneShotAnim?.frameIndex).toBe(
                    internals(lab.unit).oneShotAnim?.frameIndex,
                );
                samePose(runtime.unit, lab.unit);
            }
            for (const unit of [runtime.unit, lab.unit]) unit.returnToIdleAnimation();
            samePose(runtime.unit, lab.unit);
        }
    } finally {
        runtime.root.destroy({ children: true });
        lab.root.destroy({ children: true });
    }
});
