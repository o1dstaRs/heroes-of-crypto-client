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

import { SceneLog } from "../menu/scene_log";
import { Unit } from "../units/units";
import { getLapString } from "../utils/strings";

export function processParalysisAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    sceneLog: SceneLog,
): void {
    if (targetUnit.isDead()) {
        return;
    }

    const paralysisAbility = fromUnit.getAbility("Paralysis");
    if (paralysisAbility) {
        const paralysisEffect = paralysisAbility.getEffect();
        if (!paralysisEffect) {
            return;
        }

        if (targetUnit.hasEffectActive(paralysisEffect.getName())) {
            return;
        }

        // need to overwrite actual effect power here
        paralysisEffect.setPower(Number((fromUnit.calculateEffectMultiplier(paralysisEffect) * 100).toFixed(2)));

        const laps = paralysisEffect.getLaps();

        if (targetUnit.getId() === currentActiveUnit.getId()) {
            paralysisEffect.extend();
        }

        if (targetUnit.applyEffect(paralysisEffect)) {
            sceneLog.updateLog(
                `${fromUnit.getName()} applied Paralysis on ${targetUnit.getName()} for ${getLapString(laps)}`,
            );
        }
    }
}
