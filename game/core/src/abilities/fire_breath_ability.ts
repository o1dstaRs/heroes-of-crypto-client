/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import {
    AttackType,
    Grid,
    HoCMath,
    HoCConstants,
    ISceneLog,
    Unit,
    FightStateManager,
    UnitsHolder,
    AbilityHelper,
    IStatisticHolder,
    IDamageStatistic,
} from "@heroesofcrypto/common";

export interface IFireBreathResult {
    increaseMorale: number;
    unitIdsDied: string[];
    moraleDecreaseForTheUnitTeam: Record<string, number>;
}

export function processFireBreathAbility(
    fromUnit: Unit,
    toUnit: Unit,
    sceneLog: ISceneLog,
    unitsHolder: UnitsHolder,
    grid: Grid,
    attackTypeString: string,
    damageStatisticHolder: IStatisticHolder<IDamageStatistic>,
    targetMovePosition?: HoCMath.XY,
): IFireBreathResult {
    const unitIdsDied: string[] = [];
    const moraleDecreaseForTheUnitTeam: Record<string, number> = {};
    const fireBreathAbility = fromUnit.getAbility("Fire Breath");
    let increaseMoraleTotal = 0;

    if (!fireBreathAbility) {
        return {
            increaseMorale: increaseMoraleTotal,
            moraleDecreaseForTheUnitTeam,
            unitIdsDied,
        };
    }

    const unitsDead: Unit[] = [];
    const targets = AbilityHelper.nextStandingTargets(fromUnit, toUnit, grid, unitsHolder, targetMovePosition);

    for (const nextStandingTarget of targets) {
        if (
            nextStandingTarget.isDead() ||
            nextStandingTarget.getMagicResist() >= 100 ||
            nextStandingTarget.hasAbilityActive("Fire Element")
        ) {
            continue;
        }

        const heavyArmorAbility = nextStandingTarget.getAbility("Heavy Armor");
        let multiplier = 1;
        if (heavyArmorAbility) {
            multiplier = Number(
                (
                    ((heavyArmorAbility.getPower() + nextStandingTarget.getLuck()) /
                        100 /
                        HoCConstants.MAX_UNIT_STACK_POWER) *
                        nextStandingTarget.getStackPower() +
                    1
                ).toFixed(2),
            );
        }

        // take magic resist into account
        const fireBreathAttackDamage = Math.floor(
            fromUnit.calculateAttackDamage(
                nextStandingTarget,
                AttackType.MELEE,
                FightStateManager.getInstance()
                    .getFightProperties()
                    .getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
                1,
                fromUnit.calculateAbilityMultiplier(
                    fireBreathAbility,
                    FightStateManager.getInstance()
                        .getFightProperties()
                        .getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
                ),
            ) *
                (1 - nextStandingTarget.getMagicResist() / 100) *
                multiplier,
        );

        damageStatisticHolder.add({
            unitName: fromUnit.getName(),
            damage: nextStandingTarget.applyDamage(fireBreathAttackDamage, 0 /* magic attack */, sceneLog),
            team: fromUnit.getTeam(),
            lap: FightStateManager.getInstance().getFightProperties().getCurrentLap(),
        });

        sceneLog.updateLog(
            `${fromUnit.getName()} ${attackTypeString} ${nextStandingTarget.getName()} (${fireBreathAttackDamage})`,
        );

        if (nextStandingTarget.isDead()) {
            unitsDead.push(nextStandingTarget);
        }
    }

    for (const unitDead of unitsDead) {
        sceneLog.updateLog(`${unitDead.getName()} died`);
        unitIdsDied.push(unitDead.getId());
        increaseMoraleTotal += HoCConstants.MORALE_CHANGE_FOR_KILL;
        const unitNameKey = `${unitDead.getName()}:${unitDead.getTeam()}`;
        moraleDecreaseForTheUnitTeam[unitNameKey] =
            (moraleDecreaseForTheUnitTeam[unitNameKey] || 0) + HoCConstants.MORALE_CHANGE_FOR_KILL;
    }

    return {
        increaseMorale: increaseMoraleTotal,
        moraleDecreaseForTheUnitTeam,
        unitIdsDied,
    };
}
