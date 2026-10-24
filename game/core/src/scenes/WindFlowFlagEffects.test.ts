import { describe, expect, mock, spyOn, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { animationAtlases } from "../generated/animation_atlases";
import { OVERHEAD_EFFECT_DURATION_MS } from "../settings/statusEffectTiming";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";
import { animatableEffectNames } from "./effect_pops";
import { windFlowRecipients } from "./windFlowFlagEffects";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";
import { Sandbox } from "./Sandbox";
import { CommonFlagPops } from "./sandbox/CommonFlagPops";

describe("Wind Flow flag cels", () => {
    for (const [name, kind] of Object.entries({ "Wind Flow": "wind_flow" } as const)) {
        test(`${name}: successful recipients and recasts use the same cue as the lab`, () => {
            const ally = { isDead: () => false, flashBuffApplied: mock(() => undefined), getName: () => "Dryad" };
            const dead = { ...ally, isDead: () => true };
            const spawnCommonFlagPop = mock(() => undefined);
            const scene = Object.assign(Object.create(Sandbox.prototype), {
                unitsHolder: {
                    getAllUnits: () =>
                        new Map([
                            ["ally", ally],
                            ["dead", dead],
                            ["enemy", ally],
                        ]),
                },
                combatVisuals: { spawnCommonFlagPop },
                creatureAnimationLabPlacedUnit: () => ({ ok: true, unit: ally }),
                moveAnimManager: { isMoving: () => false },
            }) as Sandbox & { renderCastOutcomes: (events: GameEvent[]) => void };
            const events: GameEvent[] = [
                {
                    type: "effects_applied",
                    applications: [
                        { unitId: "ally", name, kind: "buff" },
                        { unitId: "ally", name, kind: "buff" },
                        { unitId: "caster", name, kind: "debuff" },
                        { unitId: "resisted", name, kind: "buff", resisted: true },
                        { unitId: "enemy", name, kind: "buff" },
                        { unitId: "dead", name, kind: "buff" },
                        { unitId: "missing", name, kind: "buff" },
                    ],
                },
            ];
            expect(windFlowRecipients(events).map((unitId) => ({ unitId, kind }))).toEqual([
                { unitId: "ally", kind },
                { unitId: "enemy", kind },
                { unitId: "dead", kind },
                { unitId: "missing", kind },
            ]);
            scene.renderCastOutcomes(events);
            expect<unknown>(spawnCommonFlagPop.mock.calls).toEqual([
                [ally, kind],
                [ally, kind],
            ]);
            scene.renderCastOutcomes(events);
            expect(spawnCommonFlagPop).toHaveBeenCalledTimes(4);
            expect(scene.playCreatureAnimationLabState(kind).ok).toBe(true);
            expect(spawnCommonFlagPop).toHaveBeenLastCalledWith(ally, kind);
            expect(animatableEffectNames([name])).toEqual(new Set());
            expect(canPreviewCreatureLabState({ name: "Dryad", abilities: [], spells: [`Nature:${name}`] }, kind)).toBe(
                true,
            );
            expect(canPreviewCreatureLabState({ name: "Wolf", abilities: [], spells: [] }, kind)).toBe(false);
            expect(canPreviewCreatureLabState({ name: "Valkyrie", abilities: ["Wind Flow"], spells: [] }, kind)).toBe(
                true,
            );
        });

        test(`${name}: all cels follow a mirrored moving flag and disappear after 650 ms`, async () => {
            const meta = animationAtlases["Vfx Wind Flow"].pop;
            expect(meta.frameCount).toBe(10);
            expect(isLazyCombatEffectAssetKey("vfx_wind_flow_pop_atlas")).toBe(true);
            expect(isProductionOmittedAssetKey("vfx_wind_flow_pop_atlas")).toBe(false);
            expect(meta.frameDurationsMs?.reduce((a, b) => a + b, 0)).toBe(650);
            const atlas = new Texture({
                source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }),
            });
            const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
            const unload = spyOn(Assets, "unload").mockResolvedValue();
            const root = new Container();
            root.scale.set(-0.8, -0.5);
            let now = 0;
            let anchor: { x: number; y: number } | undefined = { x: 100, y: 200 };
            const pops = new CommonFlagPops(
                kind,
                (c) => root.addChild(c),
                () => now,
            );
            try {
                await Promise.all([pops.spawn("ally", anchor, 64, () => anchor), pops.spawn("ally", anchor, 64)]);
                expect(root.children).toHaveLength(1);
                const pop = root.children[0];
                const sprite = pop.children[0] as Sprite;
                const seen = new Set<Texture>();
                for (now = 0; now < OVERHEAD_EFFECT_DURATION_MS; now += 10) {
                    pops.update(0);
                    seen.add(sprite.texture);
                }
                expect(seen.size).toBe(10);
                expect(pop.scale.y).toBeCloseTo(-1.6);
                anchor = { x: 170, y: 230 };
                now = OVERHEAD_EFFECT_DURATION_MS - 1;
                pops.update(0);
                expect(pop.position.x).toBe(170);
                expect(pop.position.y).toBeCloseTo(230 + 64 * 0.07);
                now = OVERHEAD_EFFECT_DURATION_MS;
                pops.update(0);
                expect(pops.active).toBe(false);
                expect(pop.destroyed).toBe(true);
                await pops.spawn("ally", anchor, 64, () => anchor);
                anchor = undefined;
                pops.update(0);
                expect(pops.active).toBe(false);
            } finally {
                pops.clear();
                await Promise.resolve();
                expect(atlas.source.destroyed).toBe(false);
                expect(unload).toHaveBeenCalled();
                load.mockRestore();
                unload.mockRestore();
                root.destroy({ children: true });
            }
        });
    }
    test("missing events and snapshot refreshes cannot replay Wind Flow", () => {
        expect(windFlowRecipients(undefined)).toEqual([]);
        expect(animatableEffectNames(["Wind Flow", "Blessing"])).toEqual(new Set(["Blessing"]));
    });
});
