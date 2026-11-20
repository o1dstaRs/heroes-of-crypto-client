import { describe, expect, mock, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { animatableEffectNames } from "./effect_pops";
import { OGRE_SPELL_FLAG_EFFECTS, ogreSpellFlagApplications } from "./ogreSpellFlagEffects";
import { Sandbox } from "./Sandbox";

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
                [unit, kind, "combat", undefined, name],
                [second, kind, "combat", undefined, name],
            ]);
            scene.renderCastOutcomes([event]);
            expect(spawnCommonFlagPop).toHaveBeenCalledTimes(4);
            expect(scene.playCreatureAnimationLabState(kind).ok).toBe(true);
            expect(spawnCommonFlagPop).toHaveBeenLastCalledWith(unit, kind, "preview");
            expect(animatableEffectNames([name])).toEqual(new Set());
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
            { unitId: "one", kind: "ogre_riot", name: "Riot" },
            { unitId: "two", kind: "ogre_riot", name: "Mass Riot" },
            { unitId: "one", kind: "ogre_magic_mirror", name: "Mass Magic Mirror" },
            { unitId: "two", kind: "ogre_magic_mirror", name: "Mass Magic Mirror" },
        ]);
    });
    test("unrelated effects remain generic and missing events stay silent", () => {
        expect(ogreSpellFlagApplications(undefined)).toEqual([]);
        expect(animatableEffectNames(["Weakness", "Bless", ...Object.keys(OGRE_SPELL_FLAG_EFFECTS)])).toEqual(
            new Set(["Weakness", "Bless"]),
        );
    });
});
