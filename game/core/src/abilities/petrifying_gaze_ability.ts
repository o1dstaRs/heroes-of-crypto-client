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

import { HoCLib, AbilityType, ISceneLog, Unit, IStatisticHolder, IDamageStatistic } from "@heroesofcrypto/common";

export function processPetrifyingGazeAbility(
    fromUnit: Unit,
    toUnit: Unit,
    damageFromAttack: number,
    sceneLog: ISceneLog,
    damageStatisticHolder: IStatisticHolder<IDamageStatistic>,
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
    let damageFromAbility = amountOfUnitsKilled * toUnit.getMaxHp();

    let proc = false;
    if (amountOfUnitsKilled < toUnit.getAmountAlive()) {
        const coeff1 = toUnit.getHp() / toUnit.getMaxHp();
        const coeff2 = 1 - (unitsKilled - Math.floor(unitsKilled));

        if (fromUnit.getStackPower() > coeff1 * 100) {
            damageFromAbility += toUnit.getHp();
            proc = true;
        } else {
            const startSpread = toUnit.getLevel() === 3 ? fromUnit.getStackPower() * 3 : fromUnit.getStackPower();
            const chanceToKillLastUnit = HoCLib.getRandomInt(fromUnit.getStackPower(), startSpread + 1);
            const coeff2Int = Math.floor((coeff2 * 100) / (toUnit.getLevel() === 3 ? 2 : 1));
            if (chanceToKillLastUnit >= coeff2Int) {
                damageFromAbility += toUnit.getHp();
                proc = true;
            } else {
                const rnd = HoCLib.getRandomInt(0, coeff2Int);
                if (rnd < chanceToKillLastUnit) {
                    damageFromAbility += toUnit.getHp();
                    proc = true;
                }
            }
        }
    } else {
        amountOfUnitsKilled = toUnit.getAmountAlive();
    }

    if (amountOfUnitsKilled || proc) {
        let damageFromAbilityTmp = damageFromAbility;

        if (damageFromAbility >= toUnit.getHp()) {
            amountOfUnitsKilled = 1;
            damageFromAbilityTmp -= toUnit.getHp();
        }
        amountOfUnitsKilled += Math.floor(damageFromAbilityTmp / toUnit.getMaxHp());

        // apply the ability damage
        damageStatisticHolder.add({
            unitName: fromUnit.getName(),
            damage: toUnit.applyDamage(damageFromAbility),
            team: fromUnit.getTeam(),
        });

        sceneLog.updateLog(`${amountOfUnitsKilled} ${toUnit.getName()} killed by ${petrifyingGazeAbility.getName()}`);
    }
}
