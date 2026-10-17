import { expect, mock, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    Spell,
    TeamVals,
    Unit,
    UnitVals,
    type GameAction,
    type GameEvent,
} from "@heroesofcrypto/common";
import { Texture } from "pixi.js";

import { Sandbox } from "./Sandbox";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

for (const [school, name] of [
    ["Life", "Spiritual Armor"],
    ["Life", "Blessing"],
    ["Life", "Helping Hand"],
    ["Life", "Courage"],
    ["Chaos", "Fireforged Sword"],
]) {
    test(`${name} reaches the generic buff animation from a real unit application`, () => {
        const effects = new EffectFactory();
        const unit = Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Peasant", "", 10),
            gridSettings,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        );
        const pop = mock((_entry: { unit: Unit; flash: string; buffs: string[] }) => undefined);
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            unitsHolder: { getAllUnits: () => new Map([[unit.getId(), unit]]) },
            shownDebuffsByUnit: new Map(),
            shownBuffsByUnit: new Map(),
            queueOrPlayEffectPops: pop,
        }) as { reconcileEffectVisuals(): void };
        scene.reconcileEffectVisuals();
        expect(pop).not.toHaveBeenCalled();
        unit.applyBuff(new Spell({ spellProperties: HoCConfig.getSpellConfig(school, name), amount: 1 }));
        scene.reconcileEffectVisuals();
        expect(pop).toHaveBeenCalledWith(expect.objectContaining({ unit, flash: "buff", buffs: [name] }));
        scene.reconcileEffectVisuals();
        expect(pop.mock.calls.filter(([entry]) => entry.buffs.includes(name))).toHaveLength(1);
    });
}

test.each(["Armor Rune", "Weapon Rune"])("AI and Premium %s casts show the confirmed enchantment", (name) => {
    const unit = {
        isDead: () => false,
        getVisualCenter: () => ({ x: 128, y: 64 }),
        flashBuffApplied: mock(() => undefined),
    };
    const units = new Map([["ally", unit]]);
    const spawnEnchantResult = mock(() => undefined);
    const events: GameEvent[] = [
        {
            type: "spell_cast",
            casterId: "caster",
            spellName: name,
            unitIdsDied: [],
            animations: [],
            outcomes: [{ unitId: "ally", outcome: "enchanted", amount: 2 }],
        },
    ];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => units },
        snapshotRenderableUnits: () => units,
        createActionEngine: () => ({ apply: () => ({ completed: true, events }) }),
        applyTurnEngineEvents: mock(() => undefined),
        shouldDeferActionToAuthoritativeReplay: () => false,
        sc_sceneSettings: { getGridSettings: () => gridSettings },
        texAny: () => Texture.WHITE,
        combatVisuals: { spawnEnchantResult },
    }) as { applyGameAction(action: GameAction): boolean };
    expect(scene.applyGameAction({ type: "cast_spell", casterId: "caster", targetId: "ally", spellName: name })).toBe(
        true,
    );
    expect(spawnEnchantResult).toHaveBeenCalledWith(
        { x: 128, y: 64 },
        gridSettings.getCellSize(),
        expect.objectContaining({ success: true, label: name === "Armor Rune" ? "+2 armor" : "+2 attack" }),
    );
    expect(unit.flashBuffApplied).toHaveBeenCalledTimes(1);
});
