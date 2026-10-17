import { SpellTargetType, type GameAction, type GameEvent } from "@heroesofcrypto/common";
import { expect, mock, test } from "bun:test";

import type { PixiRenderableSpell } from "./RenderableSpell";
import type { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";

const cases = [
    { name: "Battle Roar", kind: undefined },
    { name: "Mass Riot", kind: "ogre_riot" },
    { name: "Mass Magic Mirror", kind: "ogre_magic_mirror" },
] as const;

const fixture = (name: string, completed = true, authoritative = false) => {
    const ally = { isDead: () => false, flashBuffApplied: mock(() => undefined) };
    const dead = { isDead: () => true, flashBuffApplied: mock(() => undefined) };
    const resisted = { isDead: () => false, flashBuffApplied: mock(() => undefined) };
    const units = new Map([
        ["ally", ally],
        ["dead", dead],
        ["resisted", resisted],
    ]);
    const events: GameEvent[] = [
        {
            type: "effects_applied",
            applications: [
                { unitId: "ally", name, kind: "buff" },
                { unitId: "ally", name, kind: "buff" },
                { unitId: "dead", name, kind: "buff" },
                { unitId: "resisted", name, kind: "buff", resisted: true },
            ],
        },
    ];
    const apply = mock((_action: GameAction) => ({ completed, events }));
    const cleanup = mock(() => undefined);
    const submit = mock((_action: GameAction) => true);
    const spawnBattleRoarPop = mock(() => undefined);
    const spawnCommonFlagPop = mock(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => ({}) },
        sc_sceneLog: { updateLog: mock(() => undefined) },
        unitsHolder: { getAllUnits: () => units },
        snapshotRenderableUnits: () => units,
        shouldDeferActionToAuthoritativeReplay: () => authoritative,
        submitActionForAuthoritativeReplay: submit,
        createActionEngine: () => ({ apply }),
        playUnitCombatSound: mock(() => undefined),
        cleanupAfterSpell: cleanup,
        combatVisuals: { spawnBattleRoarPop, spawnCommonFlagPop },
    }) as unknown as {
        castMassOrSummonSpell: (spell: PixiRenderableSpell, caster: RenderableUnit) => void;
    };
    const spell = {
        getName: () => name,
        getPower: () => 1,
        isSummon: () => false,
        getSpellTargetType: () => SpellTargetType.ALL_ALLIES,
    } as unknown as PixiRenderableSpell;
    const caster = {
        getId: () => "caster",
        getAmountAlive: () => 10,
        hasAnimationState: () => true,
        playOneShotAnimation: mock(() => undefined),
    } as unknown as RenderableUnit;
    return {
        scene,
        spell,
        caster,
        ally,
        dead,
        resisted,
        apply,
        cleanup,
        submit,
        spawnBattleRoarPop,
        spawnCommonFlagPop,
    };
};

test.each(cases)(
    "local $name casts present their authored flag effect through the real mass-cast route",
    ({ name, kind }) => {
        const f = fixture(name);
        f.scene.castMassOrSummonSpell(f.spell, f.caster);
        expect(f.apply).toHaveBeenCalledWith({ type: "cast_spell", casterId: "caster", spellName: name });
        expect(f.cleanup).toHaveBeenCalledTimes(1);
        expect(f.caster.playOneShotAnimation).toHaveBeenCalledWith("cast");
        if (kind) {
            expect(f.spawnCommonFlagPop).toHaveBeenCalledTimes(1);
            expect(f.spawnCommonFlagPop).toHaveBeenCalledWith(f.ally, kind);
            expect(f.spawnBattleRoarPop).not.toHaveBeenCalled();
        } else {
            expect(f.spawnBattleRoarPop).toHaveBeenCalledTimes(1);
            expect(f.spawnBattleRoarPop).toHaveBeenCalledWith(f.ally);
            expect(f.spawnCommonFlagPop).not.toHaveBeenCalled();
        }
        expect(f.ally.flashBuffApplied).toHaveBeenCalledTimes(1);
        expect(f.dead.flashBuffApplied).not.toHaveBeenCalled();
        expect(f.resisted.flashBuffApplied).not.toHaveBeenCalled();
    },
);

test.each(cases)("a rejected local $name cast never presents a successful application", ({ name }) => {
    const f = fixture(name, false);
    f.scene.castMassOrSummonSpell(f.spell, f.caster);
    expect(f.apply).toHaveBeenCalledTimes(1);
    expect(f.cleanup).not.toHaveBeenCalled();
    expect(f.spawnBattleRoarPop).not.toHaveBeenCalled();
    expect(f.spawnCommonFlagPop).not.toHaveBeenCalled();
    expect(f.ally.flashBuffApplied).not.toHaveBeenCalled();
});

test("an authoritative mass cast waits for its replay before presenting flag effects", () => {
    const f = fixture("Battle Roar", true, true);
    f.scene.castMassOrSummonSpell(f.spell, f.caster);
    expect(f.submit).toHaveBeenCalledWith({ type: "cast_spell", casterId: "caster", spellName: "Battle Roar" });
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.cleanup).not.toHaveBeenCalled();
    expect(f.spawnBattleRoarPop).not.toHaveBeenCalled();
    expect(f.spawnCommonFlagPop).not.toHaveBeenCalled();
    expect(f.ally.flashBuffApplied).not.toHaveBeenCalled();
});
