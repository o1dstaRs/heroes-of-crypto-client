import { describe, expect, mock, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { isLazyCombatEffectAssetKey } from "../pixi/imageAssetTiers";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../pixi/productionImageAssetPolicy";
import { animatableEffectNames } from "./effect_pops";
import { empowerAppliedUnitIds } from "./empowerFlagEffects";
import { Sandbox } from "./Sandbox";

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
            expect(spawnCommonFlagPop).toHaveBeenLastCalledWith(unit, kind, "preview");
            expect(animatableEffectNames([name])).toEqual(new Set());
        });
    }
    test("unrelated effects remain generic and missing events stay silent", () => {
        expect(empowerAppliedUnitIds(undefined)).toEqual([]);
        expect(animatableEffectNames(["Weakness", "Bless", ...Object.keys(EMPOWER_FLAG_EFFECT)])).toEqual(
            new Set(["Weakness", "Bless"]),
        );
    });
});
