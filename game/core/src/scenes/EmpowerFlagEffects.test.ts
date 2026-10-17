import { describe, expect, mock, spyOn, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { animationAtlases } from "../generated/animation_atlases";
import { images } from "../imageAssets";
import { isLazyCombatEffectAssetKey } from "../pixi/imageAssetTiers";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../pixi/productionImageAssetPolicy";
import { animatableEffectNames } from "./effect_pops";
import { empowerAppliedUnitIds } from "./empowerFlagEffects";
import { Sandbox } from "./Sandbox";
import { CommonFlagPops, commonFlagFrameAt } from "./sandbox/CommonFlagPops";

const EMPOWER_FLAG_EFFECT = { Empower: "empower" } as const;

describe("Empower flag effect", () => {
    test("Empower remains available in production and loads only when needed", () => {
        for (const key of ["vfx_empower_pop_atlas", "vfx_empower_pop_atlas_quarter"]) {
            expect(isLazyCombatEffectAssetKey(key)).toBe(true);
            expect(isProductionOmittedDisabledUnitAnimationAssetKey(key)).toBe(false);
        }
    });
    for (const [name, kind] of Object.entries(EMPOWER_FLAG_EFFECT)) {
        test(`${name}: successful recipients, refreshes and lab share the same effect`, () => {
            const unit = { isDead: () => false, flashBuffApplied: mock(() => undefined), getName: () => "Nightmare" };
            const second = { ...unit, flashBuffApplied: mock(() => undefined) };
            const dead = { ...unit, isDead: () => true };
            const spawnCommonFlagPop = mock<(recipient: typeof unit, effect: string) => void>(() => undefined);
            const scene = Object.assign(Object.create(Sandbox.prototype), {
                unitsHolder: {
                    getAllUnits: () =>
                        new Map([
                            ["first", unit],
                            ["second", second],
                            ["dead", dead],
                        ]),
                },
                combatVisuals: { spawnCommonFlagPop },
                creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
                moveAnimManager: { isMoving: () => false },
            }) as Sandbox & { renderCastOutcomes: (events: GameEvent[]) => void };
            const event: GameEvent = {
                type: "effects_applied",
                applications: [
                    { unitId: "first", name, kind: "buff" },
                    { unitId: "first", name, kind: "buff" },
                    { unitId: "second", name, kind: "buff" },
                    { unitId: "dead", name, kind: "buff" },
                    { unitId: "missing", name, kind: "buff" },
                    { unitId: "resisted", name, kind: "buff", resisted: true },
                    { unitId: "wrong-kind", name, kind: "debuff" },
                ],
            };
            expect(empowerAppliedUnitIds([event])).toHaveLength(4);
            scene.renderCastOutcomes([event]);
            expect(spawnCommonFlagPop.mock.calls).toEqual([
                [unit, kind],
                [second, kind],
            ]);
            scene.renderCastOutcomes([event]);
            expect(spawnCommonFlagPop).toHaveBeenCalledTimes(4);
            expect(scene.playCreatureAnimationLabState(kind).ok).toBe(true);
            expect(spawnCommonFlagPop).toHaveBeenLastCalledWith(unit, kind);
            expect(animatableEffectNames([name])).toEqual(new Set());
        });

        test(`${name}: plays nine painted symbol cels above a rebuilt flag for one real second`, async () => {
            const meta = animationAtlases["Vfx Empower"].pop;
            expect(meta.frameCount).toBe(9);
            expect(meta.frameDurationsMs!.reduce((sum, ms) => sum + ms, 0)).toBe(1000);
            expect(commonFlagFrameAt(kind, 0)).toBe(0);
            expect(commonFlagFrameAt(kind, 999)).toBe(8);
            expect(commonFlagFrameAt(kind, 1000)).toBeUndefined();
            const atlas = new Texture({
                source: new TextureSource({ width: 1152, height: 1152 }),
            });
            const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
            const unload = spyOn(Assets, "unload").mockResolvedValue();
            const root = new Container();
            root.scale.set(0.8, -0.5);
            let now = 0;
            let anchor: { x: number; y: number } | undefined = { x: 100, y: 200 };
            const layer = new CommonFlagPops(
                kind,
                (container) => root.addChild(container),
                () => now,
            );
            try {
                await Promise.all([layer.spawn("first", anchor, 64, () => anchor), layer.spawn("first", anchor, 64)]);
                const bookTextures = {
                    empower: images.vfx_empower_pop_atlas,
                };
                expect(load).toHaveBeenCalledWith(bookTextures[kind]);
                expect(root.children).toHaveLength(1);
                const pop = root.children[0];
                const sprite = pop.children[0] as Sprite;
                expect(sprite.texture.source).toBe(atlas.source);
                expect(sprite.texture.frame).toMatchObject({ x: 0, y: 0, width: 384, height: 384 });
                expect(sprite.alpha).toBe(1);
                anchor = { x: 150, y: 250 };
                now = 500;
                layer.update(1 / 240);
                expect(pop.x).toBe(150);
                expect(pop.y).toBeCloseTo(250 + 64 * 0.07);
                expect(pop.scale.y).toBeCloseTo(-1.6);
                expect(sprite.width).toBeCloseTo(64 * 1.45 * 0.9);
                expect(sprite.alpha).toBe(1);
                now = 900;
                layer.update(0);
                expect(sprite.texture.frame).toMatchObject({ x: 768, y: 768 });
                now = 1000;
                layer.update(0);
                expect(pop.destroyed).toBe(true);
                await layer.spawn("first", anchor, 64, () => anchor);
                anchor = undefined;
                layer.update(0);
                expect(layer.active).toBe(false);
            } finally {
                layer.clear();
                await Promise.resolve();
                expect(atlas.source.destroyed).toBe(false);
                expect(unload).toHaveBeenCalledWith(images.vfx_empower_pop_atlas);
                load.mockRestore();
                unload.mockRestore();
            }
        });
    }
    test("unrelated effects remain generic and missing events stay silent", () => {
        expect(empowerAppliedUnitIds(undefined)).toEqual([]);
        expect(animatableEffectNames(["Weakness", "Bless", ...Object.keys(EMPOWER_FLAG_EFFECT)])).toEqual(
            new Set(["Weakness", "Bless"]),
        );
    });
});
