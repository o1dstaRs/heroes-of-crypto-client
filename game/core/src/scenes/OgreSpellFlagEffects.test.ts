import { describe, expect, mock, spyOn, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { images } from "../imageAssets";
import { animationAtlases } from "../generated/animation_atlases";
import { animatableEffectNames } from "./effect_pops";
import { OGRE_SPELL_FLAG_EFFECTS, ogreSpellFlagApplications } from "./ogreSpellFlagEffects";
import { Sandbox } from "./Sandbox";
import { CommonFlagPops, commonFlagFrameAt } from "./sandbox/CommonFlagPops";

describe("Ogre Mage spell flag effects", () => {
    for (const [name, kind] of Object.entries(OGRE_SPELL_FLAG_EFFECTS)) {
        test(`${name}: successful recipients, mass targets, refreshes and lab share the same effect`, () => {
            const unit = { isDead: () => false, flashBuffApplied: mock(() => undefined), getName: () => "Ogre Mage" };
            const second = { ...unit, flashBuffApplied: mock(() => undefined) };
            const dead = { ...unit, isDead: () => true };
            const spawnCommonFlagPop = mock(() => undefined);
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
            expect(ogreSpellFlagApplications([event])).toHaveLength(4);
            scene.renderCastOutcomes([event]);
            expect<unknown>(spawnCommonFlagPop.mock.calls).toEqual([
                [unit, kind],
                [second, kind],
            ]);
            scene.renderCastOutcomes([event]);
            expect(spawnCommonFlagPop).toHaveBeenCalledTimes(4);
            expect(scene.playCreatureAnimationLabState(kind).ok).toBe(true);
            expect(spawnCommonFlagPop).toHaveBeenLastCalledWith(unit, kind);
            expect(animatableEffectNames([name])).toEqual(new Set());
        });

        test(`${name}: plays moving symbol cels above a rebuilt flag for one real second`, async () => {
            const meta = animationAtlases[kind === "ogre_riot" ? "Vfx Ogre Riot" : "Vfx Ogre Magic Mirror"].pop;
            expect(meta.frameCount).toBe(9);
            expect(meta.frameDurationsMs!.reduce((sum, ms) => sum + ms, 0)).toBe(1000);
            expect(commonFlagFrameAt(kind, 0)).toBe(0);
            expect(commonFlagFrameAt(kind, 999)).toBe(8);
            expect(commonFlagFrameAt(kind, 1000)).toBeUndefined();
            const atlas = new Texture({
                source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }),
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
                const symbolAtlases = {
                    ogre_riot: images.vfx_ogre_riot_pop_atlas,
                    ogre_magic_mirror: images.vfx_ogre_magic_mirror_pop_atlas,
                };
                expect(load).toHaveBeenCalledWith(symbolAtlases[kind]);
                expect(root.children).toHaveLength(1);
                const pop = root.children[0];
                const sprite = pop.children[0] as Sprite;
                expect(sprite.texture.source).toBe(atlas.source);
                expect(sprite.texture.frame).toMatchObject({ x: 0, y: 0, width: 384, height: 384 });
                const firstCel = sprite.texture;
                const width = sprite.width;
                anchor = { x: 150, y: 250 };
                now = 500;
                layer.update(1 / 240);
                expect(pop.x).toBe(150);
                expect(pop.y).toBeCloseTo(250 + 64 * 0.07);
                expect(pop.scale.y).toBeCloseTo(-1.6);
                expect(sprite.width).toBe(width);
                expect(sprite.texture).not.toBe(firstCel);
                expect(sprite.alpha).toBe(1);
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
                expect(unload).toHaveBeenCalled();
                load.mockRestore();
                unload.mockRestore();
            }
        });
    }
    test("mass casts fan out the ordinary symbol to every successful recipient", () => {
        expect(OGRE_SPELL_FLAG_EFFECTS["Mass Riot"]).toBe("ogre_riot");
        expect(OGRE_SPELL_FLAG_EFFECTS["Mass Magic Mirror"]).toBe("ogre_magic_mirror");
        expect(new Set(Object.values(OGRE_SPELL_FLAG_EFFECTS)).size).toBe(2);
        expect(
            ogreSpellFlagApplications([
                {
                    type: "effects_applied",
                    applications: [
                        { unitId: "one", name: "Mass Riot", kind: "buff" },
                        { unitId: "two", name: "Mass Riot", kind: "buff" },
                        { unitId: "one", name: "Riot", kind: "buff" },
                        { unitId: "one", name: "Mass Magic Mirror", kind: "buff" },
                        { unitId: "two", name: "Mass Magic Mirror", kind: "buff" },
                    ],
                },
            ]),
        ).toEqual([
            { unitId: "one", kind: "ogre_riot" },
            { unitId: "two", kind: "ogre_riot" },
            { unitId: "one", kind: "ogre_magic_mirror" },
            { unitId: "two", kind: "ogre_magic_mirror" },
        ]);
    });
    test("unrelated effects remain generic and missing events stay silent", () => {
        expect(ogreSpellFlagApplications(undefined)).toEqual([]);
        expect(animatableEffectNames(["Weakness", "Bless", ...Object.keys(OGRE_SPELL_FLAG_EFFECTS)])).toEqual(
            new Set(["Weakness", "Bless"]),
        );
    });
});
