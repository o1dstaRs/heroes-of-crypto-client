import { MoveAnimationManager, type IMoveAnimationContext } from "./sandbox/MoveAnimationManager";
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
import {
    CREATURE_SPRITE_ANIMATION_SETTINGS,
    usesApprovedBaseAnimations,
    shouldPreloadUnitAnimationAtlas,
} from "../pixi/creatureAnimationSettings";
import { RenderableUnit } from "./RenderableUnit";

const roster = [
    ["Life", "Peasant", "attack"],
    ["Life", "Squire", "attack"],
    ["Life", "Blacksmith", "melee_attack"],
    ["Life", "Arbalester", "melee_attack"],
    ["Nature", "Fairy", "melee_attack"],
    ["Nature", "Dryad", "melee_attack"],
    ["Nature", "Wolf", "attack"],
    ["Nature", "Leprechaun", "melee_attack"],
    ["Chaos", "Scavenger", "attack"],
    ["Chaos", "Orc", "melee_attack"],
    ["Chaos", "Troglodyte", "attack"],
    ["Chaos", "Wandering Mage", "melee_attack"],
    ["Might", "Mermaid", "melee_attack"],
    ["Might", "Berserker", "melee_attack"],
    ["Might", "Centaur", "melee_attack"],
    ["Might", "Wolf Rider", "attack"],
    ["Chaos", "Troll", "melee_attack"],
    ["Chaos", "Medusa", "melee_attack"],
] as const;
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
    unit.ensureVisual(root, grid);
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
test.each(roster)("%s / %s matches the lab at rest, in motion and in every authored action", (faction, name, melee) => {
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
        expect(internals(runtime.unit).walkAnim?.frames.length).toBeGreaterThan(1);
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
        const states = [melee, melee + "_up", melee + "_down", "hit", "death"];
        if (["Arbalester", "Orc", "Dryad", "Centaur", "Medusa"].includes(name))
            states.push("attack", "attack_up", "attack_down");
        if (["Blacksmith", "Wandering Mage", "Troll"].includes(name)) states.push("cast");
        for (const state of states) {
            expect(runtime.unit.hasAnimationState(state), state).toBe(true);
            expect(runtime.unit.getAnimationTextureKey(state)).toBe(lab.unit.getAnimationTextureKey(state));
            expect(runtime.unit.playOneShotAnimation(state), state).toBe(true);
            expect(lab.unit.playOneShotAnimation(state, undefined, true), state).toBe(true);
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
test("other tiers stay outside the approved package and Dryad ranged textures preload", () => {
    for (const name of ["Cyclops", "Beholder", "Black Dragon"]) expect(usesApprovedBaseAnimations(name)).toBe(false);
    expect(CREATURE_SPRITE_ANIMATION_SETTINGS.enabled).toBe(false);
    for (const state of ["attack", "attack_up", "attack_down"])
        expect(shouldPreloadUnitAnimationAtlas(`dryad_lab_${state}_atlas`, false)).toBe(true);
});

test.each(roster)("%s / %s completes its gait on a long segment and a diagonal corner", (faction, name) => {
    const { unit, root } = create(faction, name, false);
    const cell = grid.getCellSize();
    const manager = new MoveAnimationManager({
        getGridSettings: () => grid,
        getWorldRoot: () => root,
        setMoveBlocked: () => {},
        updateSceneLog: () => {},
        finishTurn: () => {},
        requestVisibleStateUpdate: () => {},
        getHoverManager: () => ({ setSilhouetteLocked: () => {}, clearHoverSilhouette: () => {} }),
    } as unknown as IMoveAnimationContext);
    try {
        for (const direction of [1, -1]) {
            for (const path of [
                [
                    { x: 0, y: 1024 },
                    { x: direction * 5 * cell, y: 1024 },
                ],
                [
                    { x: 0, y: 1024 },
                    { x: direction * cell, y: 1024 - cell },
                    { x: direction * 4 * cell, y: 1024 - cell },
                ],
            ]) {
                unit.returnToIdleAnimation();
                unit.setPosition(path[0].x, path[0].y);
                let completed = 0;
                manager.startMoveAnimation(
                    unit,
                    path,
                    cell / (unit.canFly() ? 1.2 : 1),
                    { x: 4, y: 1 },
                    undefined,
                    () => completed++,
                );
                const frames = new Set<number>();
                const textures = new Set<Texture>();
                for (let tick = 0; tick < 200; tick++) {
                    manager.update(0.016);
                    unit.syncVisual(root, grid);
                    unit.stepSpawnAnimation(0.016);
                    if (internals(unit).walkAnim) {
                        frames.add(internals(unit).walkAnim!.frameIndex);
                        textures.add(internals(unit).sprite.texture);
                    }
                }
                expect(frames.size, name).toBeGreaterThanOrEqual(6);
                expect(textures.size, name).toBeGreaterThanOrEqual(6);
                for (let tick = 0; tick < 300; tick++) {
                    manager.update(0.016);
                    unit.syncVisual(root, grid);
                    unit.stepSpawnAnimation(0.016);
                }
                expect(completed).toBe(1);
                expect(manager.isMoving()).toBe(false);
                expect(internals(unit).walkAnim).toBeUndefined();
                expect(unit.getPosition()).toEqual(path[path.length - 1]);
            }
        }
    } finally {
        manager.cancel();
        root.destroy({ children: true });
    }
});
