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

import { HoCConstants, ISceneLog, Unit, FightStateManager, UnitsHolder } from "@heroesofcrypto/common";

import { DamageStatisticHolder } from "../stats/damage_stats";

export function processFireShieldAbility(
    fromUnit: Unit,
    toUnit: Unit,
    sceneLog: ISceneLog,
    damageFromAttack: number,
    unitsHolder: UnitsHolder,
): string[] {
    const unitIdsDied: string[] = [];
    if (toUnit.isDead()) {
        return unitIdsDied;
    }

    const fireShieldAbility = fromUnit.getAbility("Fire Shield");
    if (fireShieldAbility && !toUnit.hasAbilityActive("Fire Element")) {
        const heavyArmorAbility = toUnit.getAbility("Heavy Armor");
        let multiplier = 1;
        if (heavyArmorAbility) {
            multiplier = Number(
                (
                    ((heavyArmorAbility.getPower() + toUnit.getLuck()) / 100 / HoCConstants.MAX_UNIT_STACK_POWER) *
                        toUnit.getStackPower() +
                    1
                ).toFixed(2),
            );
        }

        // take magic resist into account
        const fireShieldDmg = Math.floor(
            Math.ceil(damageFromAttack * fromUnit.calculateAbilityMultiplier(fireShieldAbility)) *
                (1 - toUnit.getMagicResist() / 100) *
                multiplier,
        );
        toUnit.applyDamage(fireShieldDmg);
        DamageStatisticHolder.getInstance().add({
            unitName: fromUnit.getName(),
            damage: fireShieldDmg,
            team: fromUnit.getTeam(),
        });
        sceneLog.updateLog(`${toUnit.getName()} received (${fireShieldDmg}) from Fire Shield`);

        if (toUnit.isDead()) {
            sceneLog.updateLog(`${toUnit.getName()} died`);
            unitIdsDied.push(toUnit.getId());
            fromUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
            fromUnit.applyMoraleStepsModifier(
                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
            );
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(toUnit);
        }
    }

    return unitIdsDied;
}
