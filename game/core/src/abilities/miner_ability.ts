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

import { ISceneLog, Unit } from "@heroesofcrypto/common";

export function processMinerAbility(attackerUnit: Unit, targetUnit: Unit, sceneLog: ISceneLog) {
    const minerAbility = attackerUnit.getAbility("Miner");

    if (!minerAbility || attackerUnit.isDead()) {
        return;
    }

    const armorAmount = attackerUnit.calculateAbilityCount(minerAbility);
    if (armorAmount > 0) {
        attackerUnit.increaseBaseArmor(armorAmount);
        targetUnit.decreaseBaseArmor(armorAmount);
        sceneLog.updateLog(
            `${attackerUnit.getName()} mined ${armorAmount.toFixed(2)} armor from ${targetUnit.getName()}`,
        );
    }
}
