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

import { HoCLib } from "@heroesofcrypto/common";

import { SceneLog } from "../menu/scene_log";
import { Unit } from "../units/units";

export function processStunAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    sceneLog: SceneLog,
): void {
    if (fromUnit.isDead() || targetUnit.isDead()) {
        return;
    }

    let extend = false;
    // extend to make sure current turn is encountered
    if (targetUnit.getId() === currentActiveUnit.getId()) {
        extend = true;
    }

    const stunAbility = fromUnit.getAbility("Stun");
    if (stunAbility && HoCLib.getRandomInt(0, 100) < fromUnit.calculateAbilityApplyChance(stunAbility)) {
        if (targetUnit.applyEffect(fromUnit, stunAbility.getEffectName(), extend)) {
            sceneLog.updateLog(`${targetUnit.getName()} got stunned for 1 lap`);
        }
    }
}
