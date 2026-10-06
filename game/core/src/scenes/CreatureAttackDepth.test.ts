import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
    type TeamType,
} from "@heroesofcrypto/common";
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { releaseBoardMirror, setBoardMirror } from "../pixi/boardMirror";
import { CREATURE_SPRITE_ANIMATION_SETTINGS } from "../pixi/creatureAnimationSettings";
import { resolveCreatureHeadPriorityDepths } from "./battlefieldCreatureDepthSort";
import { RenderableUnit as LevelOneRenderableUnit } from "./LevelOneRenderableUnit";
import { CREATURE_ATTACK_FOREGROUND_Z_INDEX, RenderableUnit } from "./RenderableUnit";

const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
// Native atlas frames retain their authored dimensions without depending on image decoding.
const atlas = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
});
const originalAnimationSettings = { ...CREATURE_SPRITE_ANIMATION_SETTINGS };
const fixtures: Array<{ units: RenderableUnit[]; root: Container }> = [];
const attacks = ["attack", "attack_up", "attack_down", "melee_attack", "melee_attack_up", "melee_attack_down"];

type Visuals = {
    sprite: Sprite;
    badgeContainer: Container;
    shadow: Sprite;
    oneShotAnim?: {
        frameDurationsMs?: readonly number[];
        durationPerFrame: number;
        frames: Texture[];
        authoredRealTime?: boolean;
    };
};
const visuals = (unit: RenderableUnit): Visuals => unit as unknown as Visuals;

beforeEach(() => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
});
afterEach(() => {
    for (const { units, root } of fixtures.splice(0)) {
        for (const unit of units) unit.destroyVisuals();
        releaseBoardMirror(root);
        root.destroy({ children: true });
    }
    Object.assign(CREATURE_SPRITE_ANIMATION_SETTINGS, originalAnimationSettings);
});

function createPair(
    renderer: typeof RenderableUnit | typeof LevelOneRenderableUnit,
    facing: -1 | 1,
    mirrored: boolean,
    attackerName: "Medusa" | "Orc",
) {
    const root = new Container();
    root.scale.set(mirrored ? -1 : 1, -1);
    root.sortableChildren = true;
    setBoardMirror(root, mirrored);
    const create = (team: TeamType, faction: string, name: string, x: number, y: number): RenderableUnit => {
        const effects = new EffectFactory();
        const base = Unit.createUnit(
            HoCConfig.getCreatureConfig(team, faction, name, `${name.toLowerCase()}_512`, 1),
            grid,
            team,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        );
        const unit = renderer.fromBase(base, () => atlas) as unknown as RenderableUnit;
        unit.setPosition(x, y);
        unit.setBattlefieldVisualProjection(true);
        unit.setBoardFacing(facing);
        unit.syncVisual(root, grid);
        return unit;
    };
    const team = facing === 1 ? TeamVals.LEFT : TeamVals.RIGHT;
    const attacker = create(team, "Chaos", attackerName, 128, 1152);
    const berserker = create(
        team === TeamVals.LEFT ? TeamVals.RIGHT : TeamVals.LEFT,
        "Might",
        "Berserker",
        128 + facing * 128,
        1024,
    );
    berserker.setBoardFacing(-facing);
    berserker.syncVisual(root, grid);
    const units = [attacker, berserker];
    fixtures.push({ units, root });
    const naturalDepths = new Map(units.map((unit) => [String(unit.getId()), visuals(unit).sprite.zIndex]));
    const shadowDepth = visuals(attacker).shadow.zIndex;
    return { attacker, berserker, units, root, naturalDepths, shadowDepth };
}

function startAttack(pair: ReturnType<typeof createPair>, state: string): AbortController | undefined {
    let shot: AbortController | undefined;
    if (state.startsWith("melee_") || pair.attacker.getName() !== "Medusa") {
        expect(pair.attacker.playOneShotAnimation(state)).toBe(true);
    } else {
        shot = pair.attacker.prepareDryadRangedShot();
        expect(shot).toBeDefined();
        expect(pair.attacker.playDryadRangedShot(state, shot!, () => undefined)).toBe(true);
    }
    pair.attacker.syncVisual(pair.root, grid);
    pair.berserker.syncVisual(pair.root, grid);
    expect(pair.attacker.isPlayingForegroundAttackAnimation()).toBe(true);
    expect(visuals(pair.attacker).sprite.zIndex).toBe(CREATURE_ATTACK_FOREGROUND_Z_INDEX);
    expect(visuals(pair.attacker).badgeContainer.zIndex).toBe(CREATURE_ATTACK_FOREGROUND_Z_INDEX + 1);
    expect(visuals(pair.attacker).shadow.zIndex).toBe(pair.shadowDepth);
    expect(pair.attacker.getCreatureDepthSortCandidate(0)).toBeUndefined();
    return shot;
}

function expectNormalDepthBeforeNextLayout(pair: ReturnType<typeof createPair>): void {
    expect(pair.attacker.isPlayingForegroundAttackAnimation()).toBe(false);
    expect(visuals(pair.attacker).sprite.zIndex).toBe(pair.naturalDepths.get(String(pair.attacker.getId()))!);
    expect(visuals(pair.attacker).badgeContainer.zIndex).toBe(
        pair.naturalDepths.get(String(pair.attacker.getId()))! + 1,
    );
    expect(visuals(pair.attacker).shadow.zIndex).toBe(pair.shadowDepth);
    const candidates = pair.units.map((unit, index) => unit.getCreatureDepthSortCandidate(index)!);
    expect(candidates.every(Boolean)).toBe(true);
    for (const candidate of candidates) expect(candidate.baseDepth).toBe(pair.naturalDepths.get(candidate.id)!);
    const expected = resolveCreatureHeadPriorityDepths(
        candidates.map((candidate) => ({ ...candidate, baseDepth: pair.naturalDepths.get(candidate.id)! })),
    );
    const actual = resolveCreatureHeadPriorityDepths(candidates);
    for (const unit of pair.units) {
        const id = String(unit.getId());
        const depth = actual.get(id);
        if (depth !== undefined) unit.applyCreatureHeadPriorityDepth(depth);
        expect(visuals(unit).sprite.zIndex).toBe(expected.get(id) ?? pair.naturalDepths.get(id)!);
        expect(visuals(unit).sprite.zIndex).toBeLessThan(CREATURE_ATTACK_FOREGROUND_Z_INDEX);
    }
    expect(visuals(pair.attacker).sprite.zIndex).toBeLessThan(visuals(pair.berserker).sprite.zIndex);
    expect(visuals(pair.attacker).shadow.zIndex).toBe(pair.shadowDepth);
}

for (const [name, renderer, attackerName] of [
    ["production Medusa", RenderableUnit, "Medusa"],
    ["LevelOne Orc", LevelOneRenderableUnit, "Orc"],
] as const) {
    for (const facing of [-1, 1] as const) {
        for (const mirrored of [false, true]) {
            describe(`${name}, facing ${facing}, mirrored ${mirrored}`, () => {
                test("finishes ranged and melee recovery before the scene depth pass", () => {
                    for (const state of attacks) {
                        const pair = createPair(renderer, facing, mirrored, attackerName);
                        const shot = startAttack(pair, state);
                        const anim = visuals(pair.attacker).oneShotAnim!;
                        const durations = anim.frameDurationsMs ?? anim.frames.map(() => anim.durationPerFrame);
                        pair.attacker.stepOneShotAnimation(durations.slice(0, -1).reduce((sum, ms) => sum + ms, 0));
                        // Sandbox lays out first, advances the final animation frame, then collects candidates.
                        pair.attacker.syncVisual(pair.root, grid);
                        pair.berserker.syncVisual(pair.root, grid);
                        const clockScale = anim.authoredRealTime ? 4 : 1;
                        pair.attacker.stepSpawnAnimation((durations.at(-1)! + 0.01) / (1000 * clockScale));
                        expect(pair.attacker.isPlayingOneShotAnimation()).toBe(false);
                        expectNormalDepthBeforeNextLayout(pair);
                        if (shot) {
                            expect(shot.signal.aborted).toBe(false);
                            pair.attacker.finishDryadRangedShot(shot);
                        }
                    }
                });

                test("restores depth immediately when an attack is cancelled into idle", () => {
                    for (const state of attacks) {
                        const pair = createPair(renderer, facing, mirrored, attackerName);
                        const shot = startAttack(pair, state);
                        pair.attacker.returnToIdleAnimation();
                        expect(pair.attacker.isPlayingOneShotAnimation()).toBe(false);
                        if (shot) expect(shot.signal.aborted).toBe(true);
                        expectNormalDepthBeforeNextLayout(pair);
                    }
                });

                test("restores depth when an incoming hit replaces an attack", () => {
                    for (const state of attacks) {
                        const pair = createPair(renderer, facing, mirrored, attackerName);
                        const shot = startAttack(pair, state);
                        expect(pair.attacker.playOneShotAnimation("hit")).toBe(true);
                        expect(pair.attacker.isPlayingOneShotAnimation("hit")).toBe(true);
                        if (shot) expect(shot.signal.aborted).toBe(true);
                        expectNormalDepthBeforeNextLayout(pair);
                    }
                });
            });
        }
    }
}
