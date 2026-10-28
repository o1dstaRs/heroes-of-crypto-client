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

for (const [school, name, generic] of [
    ["Life", "Spiritual Armor", true],
    ["Life", "Blessing", true],
    ["Life", "Helping Hand", false],
    ["Life", "Courage", false],
    ["Chaos", "Fireforged Sword", false],
] as const) {
    test(`${name} ${generic ? "uses the generic buff animation" : "leaves presentation to its recorded flag cue"}`, () => {
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
        expect(pop).toHaveBeenCalledWith(
            expect.objectContaining({ unit, flash: generic ? "buff" : "none", buffs: generic ? [name] : [] }),
            false,
        );
        scene.reconcileEffectVisuals();
        expect(pop.mock.calls.filter(([entry]) => entry.buffs.includes(name))).toHaveLength(generic ? 1 : 0);
    });
}

test.each(["Armor Rune", "Weapon Rune"])("AI and Premium %s casts show the confirmed enchantment", (name) => {
    const unit = {
        isDead: () => false,
        getVisualCenter: () => ({ x: 128, y: 64 }),
        flashBuffApplied: mock(() => undefined),
    };
    const units = new Map([["ally", unit]]);
    const spawnCommonFlagPop = mock(() => undefined);
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
        combatVisuals: { spawnCommonFlagPop },
    }) as { applyGameAction(action: GameAction): boolean };
    expect(scene.applyGameAction({ type: "cast_spell", casterId: "caster", targetId: "ally", spellName: name })).toBe(
        true,
    );
    expect(spawnCommonFlagPop).toHaveBeenCalledWith(
        unit,
        name === "Armor Rune" ? "blacksmith_armor" : "blacksmith_weapon",
    );
    expect(unit.flashBuffApplied).toHaveBeenCalledTimes(1);
});
