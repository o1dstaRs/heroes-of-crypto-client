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

import { AbilityType, HoCLib } from "@heroesofcrypto/common";

import { SceneLog } from "../menu/scene_log";
import { Unit } from "../units/units";
import { getLapString } from "../utils/strings";

export function processStunAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    sceneLog: SceneLog,
): void {
    if (targetUnit.isDead()) {
        return;
    }

    const stunAbility = fromUnit.getAbility("Stun");

    if (!stunAbility) {
        return;
    }

    const amplifier =
        stunAbility.getType() === AbilityType.STATUS && targetUnit.hasAbilityActive("Mechanism") ? 1.5 : 1;

    if (HoCLib.getRandomInt(0, 100) < Math.min(100, fromUnit.calculateAbilityApplyChance(stunAbility) * amplifier)) {
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
            sceneLog.updateLog(`${targetUnit.getName()} got stunned for ${getLapString(laps)}`);
        }
    }
}
