import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
    AbilityFactory,
    AllAbilities,
    EffectFactory,
    FightStateManager,
    GridConstants,
    GridSettings,
    HoCConfig,
    HoCLib,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";

import { DamageStatisticHolder } from "./DamageStats";
import { formatCombatRange } from "./combatRange";
import { petrifyingGazePreview, petrifyingGazePreviewText } from "./petrifyingGazePreview";

const settings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const log = { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false };
const previousFight = FightStateManager.getInstance().getFightProperties();
afterEach(() => FightStateManager.getInstance().setFightProperties(previousFight));

function unit(gazer: boolean, amount = 1, maxHp = 100, frontHp = maxHp): Unit {
    const team = gazer ? TeamVals.LEFT : TeamVals.RIGHT;
    const properties = HoCConfig.getCreatureConfig(team, "Chaos", "Medusa", "medusa_512", amount);
    properties.amount_alive = amount;
    properties.max_hp = maxHp;
    properties.hp = frontHp;
    properties.stack_power = 5;
    properties.luck = 0;
    if (!gazer) properties.abilities.length = 0;
    const effects = new EffectFactory();
    return Unit.createUnit(
        { ...properties, level: 1 },
        settings,
        team,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
}

describe("Petrifying Gaze attack preview", () => {
    test("shows the engine's level-, distance- and mind-resistance-adjusted kill chance", () => {
        const attacker = unit(true);
        const target = unit(false, 1, 10_000);
        const level = spyOn(target, "getLevel").mockReturnValue(4);
        const mind = spyOn(target, "getMindResist").mockReturnValue(50);
        try {
            const preview = petrifyingGazePreview(attacker, target, { min: 10, max: 20 }, 0, 8)!;
            expect(preview.killsMax).toBe(1);
            expect(preview.chanceMin).toBe(6);
            expect(preview.chanceMax).toBe(6);
            expect(petrifyingGazePreviewText(preview)).toBe("Gaze: 6%");
            expect(petrifyingGazePreview(attacker, target, { min: 10, max: 20 }, 0)!.chanceMax).toBe(14);
        } finally {
            level.mockRestore();
            mind.mockRestore();
        }
    });

    test("shows a separate extra-kill spread for large stacks and respects the exclusive roll ceiling", () => {
        const preview = petrifyingGazePreview(unit(true), unit(false, 1000, 1), { min: 100, max: 100 }, 0)!;
        expect(preview.killsMin).toBe(40);
        expect(preview.killsMax).toBe(60);
        expect(petrifyingGazePreviewText(preview)).toBe(`Gaze: +${formatCombatRange(40, 60)} kills`);
        expect(petrifyingGazePreviewText(preview, true)).toEndWith("(first hit)");
    });

    test("finds the kill maximum inside a damage band as ordinary damage depletes the target", () => {
        const preview = petrifyingGazePreview(unit(true), unit(false, 10, 10), { min: 1, max: 99 }, 0)!;
        expect(preview.killsMin).toBe(0);
        expect(preview.killsMax).toBe(4);
    });

    test("does not confuse mind resistance with immunity to the gaze's damage-based stack kills", () => {
        const attacker = unit(true);
        const target = unit(false, 100, 10);
        const resistance = spyOn(target, "getMindResist").mockReturnValue(100);
        try {
            const preview = petrifyingGazePreview(attacker, target, { min: 100, max: 100 }, 0)!;
            expect(preview.killsMin).toBe(4);
            expect(preview.killsMax).toBe(5);
            expect(preview.chanceMin).toBe(100);
        } finally {
            resistance.mockRestore();
        }
    });

    test("suppresses inactive, absorbed, zero-damage and already-lethal hits", () => {
        const attacker = unit(true);
        const target = unit(false);
        expect(petrifyingGazePreview(unit(false), target, { min: 1, max: 2 }, 0)).toBeUndefined();
        expect(petrifyingGazePreview(attacker, target, { min: 0, max: 0 }, 0)).toBeUndefined();
        expect(petrifyingGazePreview(attacker, target, { min: 100, max: 200 }, 0)).toBeUndefined();
        const absorbed = spyOn(target, "willAbsorbIncomingHit").mockReturnValue(true);
        expect(petrifyingGazePreview(attacker, target, { min: 1, max: 2 }, 0)).toBeUndefined();
        absorbed.mockRestore();
        const effect = new EffectFactory().makeEffect("Break")!;
        attacker.applyEffect(effect);
        expect(petrifyingGazePreview(attacker, target, { min: 1, max: 2 }, 0)).toBeUndefined();
    });

    test("reports zero chance against a mind-immune target", () => {
        const target = unit(false);
        const immune = spyOn(target, "hasMindAttackResistance").mockReturnValue(true);
        try {
            expect(petrifyingGazePreviewText(petrifyingGazePreview(unit(true), target, { min: 1, max: 2 }, 0)!)).toBe(
                "Gaze: 0%",
            );
        } finally {
            immune.mockRestore();
        }
    });

    test("is a read-only forecast that consumes neither random rolls nor ammunition", () => {
        const attacker = unit(true);
        const target = unit(false, 10, 10);
        const shots = attacker.getRangeShots();
        const hp = target.getCumulativeHp();
        const random = spyOn(HoCLib, "getRandomInt").mockImplementation(() => {
            throw new Error("Preview must not roll");
        });
        try {
            expect(petrifyingGazePreview(attacker, target, { min: 1, max: 40 }, 0)).toBeDefined();
            expect(attacker.getRangeShots()).toBe(shots);
            expect(target.getCumulativeHp()).toBe(hp);
        } finally {
            random.mockRestore();
        }
    });

    for (const scenario of [
        {
            name: "floating-point kill threshold",
            min: 50,
            max: 50,
            amount: 8,
            hp: 29,
            frontHp: 29,
            damageTaken: (d: number) => d,
        },
        { name: "ordinary damage", min: 1, max: 79, amount: 8, hp: 10, frontHp: 10, damageTaken: (d: number) => d },
        {
            name: "wounded front creature",
            min: 15,
            max: 45,
            amount: 8,
            hp: 10,
            frontHp: 3,
            damageTaken: (d: number) => d,
        },
        {
            name: "Flesh Shield redirection",
            min: 20,
            max: 80,
            amount: 8,
            hp: 10,
            frontHp: 10,
            damageTaken: (d: number) => Math.ceil(d / 2),
        },
        {
            name: "damage before gaze includes a burn",
            min: 15,
            max: 65,
            amount: 8,
            hp: 10,
            frontHp: 10,
            damageTaken: (d: number) => d + Math.floor(d / 3),
        },
    ]) {
        test(`matches actual combat outcomes for every gaze roll: ${scenario.name}`, () => {
            FightStateManager.getInstance().reset();
            const attacker = unit(true);
            const target = unit(false, scenario.amount, scenario.hp, scenario.frontHp);
            const preview = petrifyingGazePreview(attacker, target, scenario, 0, 1, scenario.damageTaken)!;
            const percentageMax = Math.floor(
                attacker.calculateAbilityApplyChance(attacker.getAbility("Petrifying Gaze")!, 0),
            );
            const percentageMin = Math.floor((percentageMax / 3) * 2);
            const procChance = AllAbilities.calculatePetrifyingGazeKillChance(percentageMax, 1, 0);
            let minimum = Infinity;
            let maximum = 0;
            let chanceMin = 100;
            let chanceMax = 0;
            const random = spyOn(HoCLib, "getRandomInt");
            try {
                for (let impact = scenario.min; impact <= scenario.max; impact++) {
                    let killChance = 0;
                    for (let coefficient = percentageMin; coefficient < percentageMax; coefficient++) {
                        for (const proc of [false, true]) {
                            const victim = unit(false, scenario.amount, scenario.hp, scenario.frontHp);
                            victim.applyDamage(scenario.damageTaken(impact), 0, log);
                            const alive = victim.getAmountAlive();
                            let call = 0;
                            random.mockImplementation(() => (call++ === 0 ? coefficient : proc ? 0 : 99));
                            AllAbilities.processPetrifyingGazeAbility(
                                attacker,
                                victim,
                                impact,
                                log,
                                new DamageStatisticHolder(),
                            );
                            const killed = alive - victim.getAmountAlive();
                            minimum = Math.min(minimum, killed);
                            maximum = Math.max(maximum, killed);
                            if (killed > 0)
                                killChance += (proc ? procChance : 100 - procChance) / (percentageMax - percentageMin);
                        }
                    }
                    chanceMin = Math.min(chanceMin, killChance);
                    chanceMax = Math.max(chanceMax, killChance);
                }
            } finally {
                random.mockRestore();
            }
            expect(preview.killsMin).toBe(minimum);
            expect(preview.killsMax).toBe(maximum);
            expect(preview.chanceMin).toBeCloseTo(chanceMin, 7);
            expect(preview.chanceMax).toBeCloseTo(chanceMax, 7);
        });
    }
});
