import { afterEach, describe, expect, test } from "bun:test";

import {
    AbilityFactory,
    AllAbilities,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    HoCLib,
    TeamVals,
    Unit,
    UnitVals,
    type ISceneLog,
    type TeamType,
} from "@heroesofcrypto/common";

import { RenderableUnit } from "./RenderableUnit";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const sceneLog: ISceneLog = {
    getLog: () => "",
    updateLog: () => undefined,
    hasBeenUpdated: () => false,
};

function createRenderableUnit(
    team: TeamType,
    factionName: string,
    creatureName: string,
    textureName: string,
): RenderableUnit {
    const effectFactory = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(team, factionName, creatureName, textureName, 1),
        gridSettings,
        team,
        UnitVals.CREATURE,
        new AbilityFactory(effectFactory),
        effectFactory,
        false,
    );
    return RenderableUnit.fromBase(base, () => undefined);
}

const spellAmounts = (unit: Unit): Record<string, number> =>
    Object.fromEntries(unit.getSpells().map((spell) => [spell.getName(), spell.getAmount()]));

afterEach(() => HoCLib.setDeterministicRandomSource(undefined));

describe("RenderableUnit runtime spell synchronization", () => {
    test("removes and grants getSpells entries when a castable ability is stolen", () => {
        const queen = createRenderableUnit(TeamVals.LOWER, "Nature", "Arachna Queen", "arachna_queen_512");
        const angel = createRenderableUnit(TeamVals.UPPER, "Life", "Angel", "angel_512");
        HoCLib.setDeterministicRandomSource(() => 0);

        expect(spellAmounts(angel)).toEqual({ Resurrection: 1 });
        expect(spellAmounts(queen)).toEqual({});
        expect(AllAbilities.processPredatoryAssimilationAbility(queen, angel, sceneLog)?.abilityName).toBe(
            "Resurrection",
        );
        expect(spellAmounts(angel)).toEqual({});
        expect(spellAmounts(queen)).toEqual({ Resurrection: 1 });
    });

    test("transfers exact remaining spellbook charges into the thief's getSpells entries", () => {
        const queen = createRenderableUnit(TeamVals.LOWER, "Nature", "Arachna Queen", "arachna_queen_512");
        const satyr = createRenderableUnit(TeamVals.UPPER, "Nature", "Satyr", "satyr_512");
        satyr.useSpell("Courage");
        satyr.useSpell("Summon Wolves");
        HoCLib.setDeterministicRandomSource(() => 0);

        expect(spellAmounts(satyr)).toEqual({ Courage: 2, "Helping Hand": 1, "Summon Wolves": 1 });
        expect(AllAbilities.processPredatoryAssimilationAbility(queen, satyr, sceneLog)?.abilityName).toBe(
            "Forest Spellbook",
        );
        expect(spellAmounts(satyr)).toEqual({});
        expect(spellAmounts(queen)).toEqual({ Courage: 2, "Helping Hand": 1, "Summon Wolves": 1 });
    });
});
