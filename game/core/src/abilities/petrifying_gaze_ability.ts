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

import { HoCLib, AbilityType, HoCScene } from "@heroesofcrypto/common";

import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";

export function processPetrifyingGazeAbility(
    fromUnit: Unit,
    toUnit: Unit,
    damageFromAttack: number,
    sceneLog: HoCScene.SceneLog,
): void {
    if (toUnit.isDead() || damageFromAttack <= 0) {
        return;
    }

    const petrifyingGazeAbility = fromUnit.getAbility("Petrifying Gaze");
    if (
        !petrifyingGazeAbility ||
        (petrifyingGazeAbility.getType() === AbilityType.MIND && toUnit.hasMindAttackResistance())
    ) {
        return;
    }

    const percentageMax = Math.floor(fromUnit.calculateAbilityApplyChance(petrifyingGazeAbility));
    const percentageMin = Math.floor(percentageMax / 2);

    const randomCoeff = HoCLib.getRandomInt(percentageMin, percentageMax) / 100;
    const randomAdditionalDamage = damageFromAttack * randomCoeff;
    const unitsKilled = randomAdditionalDamage / toUnit.getMaxHp();
    let amountOfUnitsKilled = Math.min(Math.floor(unitsKilled), toUnit.getAmountAlive() - 1);

    let damageFromAbility = 0;
    if (amountOfUnitsKilled < toUnit.getAmountAlive()) {
        const coeff1 = toUnit.getHp() / toUnit.getMaxHp();
        const coeff2 = 1 - (unitsKilled - Math.floor(unitsKilled));

        if (fromUnit.getStackPower() > coeff1 * 100) {
            damageFromAbility = toUnit.getHp();
        } else {
            const startSpread = toUnit.getLevel() === 3 ? fromUnit.getStackPower() : 1;
            const chanceToKillLastUnit =
                HoCLib.getRandomInt(startSpread, fromUnit.getStackPower() + 1) * (toUnit.getLevel() === 3 ? 2 : 1);
            if (HoCLib.getRandomInt(0, Math.floor(coeff2 * 100)) < chanceToKillLastUnit) {
                damageFromAbility = toUnit.getHp();
            }
        }
    } else {
        amountOfUnitsKilled = toUnit.getAmountAlive();
    }

    if (amountOfUnitsKilled) {
        damageFromAbility += amountOfUnitsKilled * toUnit.getMaxHp();

        // apply the ability damage
        toUnit.applyDamage(damageFromAbility);
        DamageStatisticHolder.getInstance().add({
            unitName: fromUnit.getName(),
            damage: damageFromAbility,
            team: fromUnit.getTeam(),
        });

        sceneLog.updateLog(`${amountOfUnitsKilled} ${toUnit.getName()} killed by ${petrifyingGazeAbility.getName()}`);
    }
}
