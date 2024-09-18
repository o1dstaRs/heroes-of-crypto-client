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

export function processAggrAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    sceneLog: SceneLog,
): void {
    if (targetUnit.isDead()) {
        return;
    }

    const aggrAbility = fromUnit.getAbility("Aggr");
    if (aggrAbility && HoCLib.getRandomInt(0, 100) < fromUnit.calculateAbilityApplyChance(aggrAbility)) {
        const aggrEffect = aggrAbility.getEffect();
        if (!aggrEffect) {
            return;
        }

        if (targetUnit.hasEffectActive(aggrEffect.getName())) {
            return;
        }

        const laps = aggrEffect.getLaps();

        if (targetUnit.getId() === currentActiveUnit.getId()) {
            aggrEffect.extend();
        }

        if (
            !(aggrAbility.getType() === AbilityType.MIND && targetUnit.hasMindAttackResistance()) &&
            targetUnit.applyEffect(aggrEffect)
        ) {
            sceneLog.updateLog(
                `${fromUnit.getName()} applied Aggr on ${targetUnit.getName()} for ${getLapString(laps)}`,
            );
            targetUnit.setTarget(fromUnit.getId());
        } else {
            sceneLog.updateLog(`${targetUnit.getName()} resisted from Aggr`);
        }
    }
}
