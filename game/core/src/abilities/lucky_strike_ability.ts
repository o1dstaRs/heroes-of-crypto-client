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

export function processLuckyStrikeAbility(attackerUnit: Unit, damageFromAttack: number, sceneLog: SceneLog): number {
    const luckyStrikeAbility = attackerUnit.getAbility("Lucky Strike");

    if (!luckyStrikeAbility) {
        return damageFromAttack;
    }

    if (HoCLib.getRandomInt(0, 100) < attackerUnit.calculateAbilityApplyChance(luckyStrikeAbility)) {
        sceneLog.updateLog(`${attackerUnit.getName()} activates Lucky Strike`);
        damageFromAttack = Math.floor(damageFromAttack * attackerUnit.calculateAbilityMultiplier(luckyStrikeAbility));
    }

    return damageFromAttack;
}