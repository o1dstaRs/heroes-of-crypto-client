import { afterAll, beforeAll, expect, test } from "bun:test";
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
import { BufferImageSource, Container, DOMAdapter, Sprite, Texture } from "pixi.js";
import { RenderableUnit } from "../scenes/RenderableUnit";
import { shouldPreloadUnitAnimationAtlas } from "./creatureAnimationSettings";
import { isRedundantFullResolutionUnitAtlasKey } from "./imageAssetTiers";
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Champion reactions and three spear attacks preserve idle scale, stop gait and finish once", () => {
    const grid = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const effects = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Champion", "champion_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const tex = (width: number, height = width) =>
        new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width, height }) });
    const idle = tex(4096),
        walk = tex(3072, 1536),
        reaction = tex(4096, 2048),
        attack = tex(3840, 7168),
        plume = tex(512),
        fallback = tex(768);
    const unit = RenderableUnit.fromBase(base, (key) =>
        key === "champion_lab_idle_atlas"
            ? idle
            : key === "champion_lab_walk_atlas"
              ? walk
              : key === "champion_lab_plume"
                ? plume
                : ["champion_lab_hit_atlas", "champion_lab_death_atlas"].includes(key)
                  ? reaction
                  : /^champion_lab_melee_attack(?:_up|_down)?_atlas$/.test(key)
                    ? attack
                    : fallback,
    );
    unit.setCreatureAnimationLabPreviewEnabled(false);
    const world = new Container();
    unit.ensureVisual(world, grid);
    const state = unit as unknown as {
        sprite: Sprite;
        walkAnim?: unknown;
        oneShotAnim?: {
            frameIndex: number;
            frames: Texture[];
            frameDurationsMs: number[];
            authoredRealTime: boolean;
            finished?: boolean;
        };
    };
    const scale = { x: Math.abs(state.sprite.scale.x), y: Math.abs(state.sprite.scale.y) },
        anchor = state.sprite.anchor.y;
    const idleContact = state.sprite.toGlobal({
        x: 312 - state.sprite.texture.width * state.sprite.anchor.x,
        y: 820 - state.sprite.texture.height * state.sprite.anchor.y,
    });
    for (const action of ["hit", "melee_attack", "melee_attack_up", "melee_attack_down", "death"]) {
        const key = `champion_lab_${action}_atlas`;
        expect(unit.getAnimationTextureKey(action)).toBe(key);
        expect(shouldPreloadUnitAnimationAtlas(key, false)).toBe(true);
        expect(isRedundantFullResolutionUnitAtlasKey(key)).toBe(false);
        unit.startBoardWalkAnimation(1, 4);
        unit.setBoardWalkDistanceCells(0.47);
        let completed = 0;
        expect(unit.playOneShotAnimation(action, () => completed++)).toBe(true);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(scale.x, 6);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(scale.y, 6);
        expect(state.walkAnim).toBeUndefined();
        expect(state.oneShotAnim?.authoredRealTime).toBe(true);
        const durations = [...state.oneShotAnim!.frameDurationsMs];
        const isAttack = action.startsWith("melee_attack");
        expect(durations.reduce((a, b) => a + b, 0)).toBeCloseTo(
            isAttack ? 550 : (action === "hit" ? 400 / 1.17 : 1080) / 1.23,
            6,
        );
        if (isAttack) {
            expect(durations).toEqual([17, 16, 17, 35, 35, 35, 22, 21, 22, 27, 26, 27, 20, 20, 20, 33, 34, 33, 90]);
            expect(state.oneShotAnim?.frames).toHaveLength(19);
            expect(state.sprite.texture.width).toBe(1280);
            expect(state.sprite.texture.height).toBe(1024);
        }
        for (let i = 0; i < durations.length; i++) {
            expect(state.oneShotAnim?.frameIndex).toBe(i);
            unit.ensureVisual(world, grid);
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(scale.x, 6);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(scale.y, 6);
            expect(state.sprite.anchor.y).toBeCloseTo(isAttack ? 986 / 1024 : anchor, 6);
            expect(state.sprite.anchor.x).toBeCloseTo(isAttack ? 512 / 1280 : 0.5, 6);
            if (isAttack) {
                const contact = state.sprite.toGlobal({
                    x: 312 - state.sprite.texture.width * state.sprite.anchor.x,
                    y: 948 - state.sprite.texture.height * state.sprite.anchor.y,
                });
                expect(contact.x).toBeCloseTo(idleContact.x, 6);
                expect(contact.y).toBeCloseTo(idleContact.y, 6);
            }
            expect(state.sprite.filters?.length ?? 0).toBe(0);
            unit.stepOneShotAnimation(durations[i]);
        }
        expect(completed).toBe(1);
        if (action !== "death") {
            expect(unit.isPlayingOneShotAnimation()).toBe(false);
            expect(state.sprite.texture.source).toBe(idle.source);
            if (isAttack) {
                unit.playOneShotAnimation(action, undefined, true);
                unit.stepOneShotAnimation(220);
                unit.returnToIdleAnimation();
                expect(state.sprite.texture.source).toBe(idle.source);
                expect(state.sprite.anchor.x).toBe(0.5);
                expect(state.sprite.anchor.y).toBe(anchor);
                expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(scale.x, 6);
                expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(scale.y, 6);
            }
        } else {
            const corpse = state.sprite.texture;
            expect(state.oneShotAnim?.finished).toBe(true);
            unit.stepOneShotAnimation(20000);
            unit.ensureVisual(world, grid);
            expect(state.sprite.texture).toBe(corpse);
            expect(completed).toBe(1);
        }
    }
});
