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

import { AbilityType, HoCLib, Unit, ISceneLog, FightStateManager } from "@heroesofcrypto/common";

export function processBlindnessAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    sceneLog: ISceneLog,
): void {
    if (targetUnit.isDead()) {
        return;
    }

    const blindnessAbility = fromUnit.getAbility("Blindness");
    if (
        blindnessAbility &&
        HoCLib.getRandomInt(0, 100) <
            fromUnit.calculateAbilityApplyChance(
                blindnessAbility,
                FightStateManager.getInstance()
                    .getFightProperties()
                    .getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
            )
    ) {
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

        if (
            !(blindnessAbility.getType() === AbilityType.MIND && targetUnit.hasMindAttackResistance()) &&
            targetUnit.applyEffect(blindnessEffect)
        ) {
            sceneLog.updateLog(`${targetUnit.getName()} is blind for ${HoCLib.getLapString(laps)}`);
        } else {
            sceneLog.updateLog(`${targetUnit.getName()} resisted from blindness effect`);
        }
    }
}
