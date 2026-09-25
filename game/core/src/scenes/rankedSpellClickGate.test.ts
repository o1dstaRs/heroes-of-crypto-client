import { describe, expect, test } from "bun:test";

import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
    type GameAction,
    type Spell,
    type TeamType,
} from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";

/**
 * A ranked spell click is sent to the server, which runs canCastSpell and answers spell_not_available for a
 * target that fails it. The local sandbox always asked that rule first, through its own engine; the ranked
 * click did not, so a Troll could fire its Wild Regeneration gift at itself or at a level-4 Abomination and
 * the refusal came back over the wire (production REJECT-TRACE, 2026-09-25). The click now asks first.
 */

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

let nextId = 0;
const createUnit = (factionName: string, creatureName: string, team: TeamType = TeamVals.LEFT): Unit => {
    const effectFactory = new EffectFactory();
    const unit = Unit.createUnit(
        { ...HoCConfig.getCreatureConfig(team, factionName, creatureName, "", 10), id: `unit-${nextId++}` },
        gridSettings,
        team,
        UnitVals.CREATURE,
        new AbilityFactory(effectFactory),
        effectFactory,
        false,
    );
    unit.setStackPower(5);
    return unit;
};

/** The authoritative display list a ranked unit carries in place of buff OBJECTS. */
const mirrorBuff = (unit: Unit, name: string): void => {
    const properties = unit.getUnitProperties();
    properties.applied_buffs.push(name);
    properties.applied_buffs_laps.push(2);
    properties.applied_buffs_descriptions.push(name);
    properties.applied_buffs_powers.push(25);
};

const rankedScene = (caster: Unit, spellName: string, others: Unit[]) => {
    const spell = caster.getSpells().find((candidate) => candidate.getName() === spellName) as Spell;
    const submitted: GameAction[] = [];
    const units = new Map([caster, ...others].map((unit) => [unit.getId(), unit]));
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        currentActiveUnit: caster,
        currentActiveSpell: spell,
        currentEnemiesCellsWithinMovementRange: undefined,
        gridMatrix: [],
        grid: { getSettings: () => gridSettings },
        sc_sceneSettings: { getGridSettings: () => gridSettings },
        unitsHolder: { getAllUnits: () => units },
        shouldDeferActionToAuthoritativeReplay: () => true,
        submitActionForAuthoritativeReplay: (action: GameAction) => {
            submitted.push(action);
            return true;
        },
    }) as { castSpellOnTarget: (target: Unit) => boolean };
    return { spell, submitted, click: (target: Unit) => scene.castSpellOnTarget(target) };
};

describe("a ranked spell click is checked before it is sent", () => {
    test("a Troll's Wild Regeneration goes out only to a legal ally", () => {
        const troll = createUnit("Chaos", "Troll");
        const otherTroll = createUnit("Chaos", "Troll");
        const abomination = createUnit("Chaos", "Abomination");
        const berserker = createUnit("Might", "Berserker");
        const { spell, submitted, click } = rankedScene(troll, "Wild Regeneration", [
            otherTroll,
            abomination,
            berserker,
        ]);

        expect(spell).toBeDefined();
        expect(click(troll)).toBe(false);
        expect(click(otherTroll)).toBe(false);
        expect(click(abomination)).toBe(false);
        expect(submitted).toHaveLength(0);

        expect(click(berserker)).toBe(true);
        expect(submitted).toEqual([
            expect.objectContaining({
                type: "cast_spell",
                casterId: troll.getId(),
                spellName: "Wild Regeneration",
                targetId: berserker.getId(),
            }),
        ]);
    });

    test("an Ogre Mage's Riot is held back from a stack the server shows under Mass Riot", () => {
        const ogreMage = createUnit("Might", "Ogre Mage");
        const underMassRiot = createUnit("Might", "Berserker");
        const clean = createUnit("Might", "Berserker");
        mirrorBuff(underMassRiot, "Mass Riot");
        const { submitted, click } = rankedScene(ogreMage, "Riot", [underMassRiot, clean]);

        expect(click(underMassRiot)).toBe(false);
        expect(submitted).toHaveLength(0);

        expect(click(clean)).toBe(true);
        expect(submitted.map((action) => (action.type === "cast_spell" ? action.targetId : undefined))).toEqual([
            clean.getId(),
        ]);
    });
});
