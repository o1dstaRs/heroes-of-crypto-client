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

export function processBlindnessAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    sceneLog: SceneLog,
): void {
    if (targetUnit.isDead()) {
        return;
    }

    const blindnessAbility = fromUnit.getAbility("Blindness");
    if (blindnessAbility && HoCLib.getRandomInt(0, 100) < fromUnit.calculateAbilityApplyChance(blindnessAbility)) {
        const blindnessEffect = blindnessAbility.getEffect();
        if (!blindnessEffect) {
            return;
        }

        if (targetUnit.hasEffectActive(blindnessEffect.getName())) {
            return;
        }

        const laps = blindnessEffect.getLaps();

        if (targetUnit.getId() === currentActiveUnit.getId()) {
            blindnessEffect.extend();
        }

        if (targetUnit.applyEffect(blindnessEffect)) {
            sceneLog.updateLog(`${targetUnit.getName()} is blind for ${laps} laps`);
        }
    }
}
