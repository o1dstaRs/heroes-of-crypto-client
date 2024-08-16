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

    const stunAbility = fromUnit.getAbility("Stun");
    if (stunAbility && HoCLib.getRandomInt(0, 100) < fromUnit.calculateAbilityApplyChance(stunAbility)) {
        const stunEffect = stunAbility.getEffect();
        if (!stunEffect) {
            return;
        }

        if (targetUnit.hasEffectActive(stunEffect.getName())) {
            return;
        }

        const laps = stunEffect.getLaps();

        if (targetUnit.getId() === currentActiveUnit.getId()) {
            stunEffect.extend();
        }

        if (targetUnit.applyEffect(stunEffect)) {
            sceneLog.updateLog(`${targetUnit.getName()} got stunned for ${laps} lap`);
        }
    }
}
