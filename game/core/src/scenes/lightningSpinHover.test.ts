import { describe, expect, spyOn, test } from "bun:test";

import {
    AbilityFactory,
    AllAbilities,
    AttackVals,
    EffectFactory,
    FightStateManager,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    HoCLib,
    Spell,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type IAttackDamageProjectionInput,
    type ISceneLog,
    type TeamType,
} from "@heroesofcrypto/common";

import { DamageStatisticHolder } from "./DamageStats";
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
const sceneLog: ISceneLog = {
    getLog: () => "",
    updateLog: () => undefined,
    hasBeenUpdated: () => false,
};
const attackFrom = { x: 5, y: 5 };
const projectSpin = (
    Sandbox.prototype as unknown as {
        projectMeleeRiderDamage(
            source: "Lightning Spin",
            input: Omit<IAttackDamageProjectionInput, "target">,
            victim: Unit,
            attackFromCell: { x: number; y: number },
            withLuckyStrike: (damage: number) => number,
        ): { min: number; max: number };
    }
).projectMeleeRiderDamage;

const createUnit = (team: TeamType, abilities: string[], stackPower: number, luck = 0, armor = 10): Unit => {
    const properties = HoCConfig.getCreatureConfig(team, "Chaos", "Hydra", "hydra_512", 1);
    properties.abilities.splice(0, properties.abilities.length, ...abilities);
    properties.abilities_descriptions.splice(0, properties.abilities_descriptions.length, ...abilities.map(() => ""));
    properties.abilities_stack_powered.splice(
        0,
        properties.abilities_stack_powered.length,
        ...abilities.map(() => true),
    );
    properties.abilities_auras.splice(0, properties.abilities_auras.length, ...abilities.map(() => false));
    properties.stack_power = stackPower;
    properties.luck = luck;
    properties.base_attack = 10;
    properties.base_armor = armor;
    properties.attack_damage_min = 40;
    properties.attack_damage_max = 48;
    properties.max_hp = 100_000;
    properties.hp = 100_000;
    const effects = new EffectFactory();
    return Unit.createUnit(
        properties,
        gridSettings,
        team,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
};

const place = (grid: Grid, units: UnitsHolder, unit: Unit, cell: { x: number; y: number }): void => {
    const position = GridMath.getPositionForFootprintAnchor(
        gridSettings,
        cell,
        unit.getFootprintWidth(),
        unit.getFootprintHeight(),
    );
    unit.setPosition(position.x, position.y);
    grid.occupyCells(unit.getCells(), unit.getId(), unit.getTeam(), unit.getAttackRange(), false, false);
    units.addUnit(unit);
};

const buff = (unit: Unit, name: string, power: number): void => {
    const spell = new Spell({ spellProperties: HoCConfig.getSpellConfig("System", name), amount: 1 });
    spell.setPower(power);
    unit.applyBuff(spell);
};

describe("Lightning Spin hover damage matches combat", () => {
    for (const scenario of [
        { name: "100% spin at stack power 1", stackPower: 1 },
        { name: "100% spin at stack power 3", stackPower: 3 },
        { name: "100% spin at stack power 5", stackPower: 5 },
        { name: "fractional percentage from luck", stackPower: 3, luck: 7 },
        { name: "team ability power", stackPower: 3, synergy: 12 },
        { name: "stronger target armor", stackPower: 3, armor: 33 },
        { name: "Giant's Maul", stackPower: 3, maul: 40 },
        { name: "Broken Aegis", stackPower: 3, aegis: 30 },
        { name: "Paralysis", stackPower: 3, paralysis: 50 },
        { name: "Rapid Charge", stackPower: 3, charge: 3 },
        { name: "Deep Wounds", stackPower: 3, deepWounds: 20 },
    ]) {
        test(scenario.name, () => {
            for (const roll of [0, 1 - Number.EPSILON]) {
                FightStateManager.getInstance().reset();
                const properties = FightStateManager.getInstance().getFightProperties();
                const synergy = spyOn(properties, "getAdditionalAbilityPowerPerTeam").mockImplementation((team) =>
                    team === TeamVals.LEFT ? (scenario.synergy ?? 0) : 0,
                );
                try {
                    const grid = new Grid(gridSettings, GridVals.NORMAL);
                    const units = new UnitsHolder(grid);
                    const abilities = ["Lightning Spin"];
                    if (scenario.charge) abilities.push("Rapid Charge");
                    if (scenario.deepWounds) abilities.push("Deep Wounds Level 1");
                    const attacker = createUnit(TeamVals.LEFT, abilities, scenario.stackPower, scenario.luck);
                    expect(
                        attacker.calculateAbilityMultiplier(
                            attacker.getAbility("Lightning Spin")!,
                            scenario.synergy ?? 0,
                        ),
                    ).toBeCloseTo((100 + (scenario.luck ?? 0) + (scenario.synergy ?? 0)) / 100, 5);
                    const victim = createUnit(TeamVals.RIGHT, [], 5, 0, scenario.armor);
                    place(grid, units, attacker, attackFrom);
                    place(grid, units, victim, { x: 7, y: 5 });
                    if (scenario.maul) buff(attacker, "Giants Maul", scenario.maul);
                    if (scenario.aegis) buff(victim, "Broken Aegis", scenario.aegis);
                    for (const [unit, name, power] of [
                        [attacker, "Paralysis", scenario.paralysis],
                        [victim, "Deep Wounds", scenario.deepWounds],
                    ] as const) {
                        if (!power) continue;
                        const effect = new EffectFactory().makeEffect(name);
                        if (!effect) throw new Error(`Missing effect: ${name}`);
                        effect.setPower(power);
                        unit.applyEffect(effect);
                    }
                    const cells = scenario.charge ?? 1;
                    const preview = projectSpin.call(
                        {
                            currentActiveKnownPaths: new Map([
                                [(attackFrom.x << 4) | attackFrom.y, [{ route: Array.from({ length: cells }) }]],
                            ]),
                        },
                        "Lightning Spin",
                        {
                            attacker,
                            attackType: AttackVals.MELEE,
                            synergyAbilityPowerIncrease: scenario.synergy ?? 0,
                        },
                        victim,
                        attackFrom,
                        (damage) => damage,
                    );
                    const before = victim.getCumulativeHp();
                    const random = spyOn(HoCLib, "getRandomInt").mockImplementation((min, max) =>
                        roll === 0 ? min : Math.max(min, max - 1),
                    );
                    try {
                        const result = AllAbilities.processLightningSpinAbility(
                            attacker,
                            sceneLog,
                            units,
                            cells,
                            new DamageStatisticHolder(),
                            attackFrom,
                            true,
                            [],
                            grid,
                        );
                        expect(result.landed).toBe(true);
                        expect(before - victim.getCumulativeHp()).toBe(roll === 0 ? preview.min : preview.max);
                    } finally {
                        random.mockRestore();
                    }
                    if (scenario.stackPower === 1) expect(preview).toEqual({ min: 40, max: 47 });
                } finally {
                    synergy.mockRestore();
                }
            }
        });
    }
});
