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

import { ISceneLog, Unit, HoCLib, FightStateManager } from "@heroesofcrypto/common";

export function processDeepWoundsAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    sceneLog: ISceneLog,
): void {
    if (targetUnit.isDead()) {
        return;
    }

    const deepWoundsLevel1Ability = fromUnit.getAbility("Deep Wounds Level 1");
    const deepWoundsLevel2Ability = fromUnit.getAbility("Deep Wounds Level 2");
    const deepWoundsLevel3Ability = fromUnit.getAbility("Deep Wounds Level 3");
    let powerSum = 0;
    let deepWoundsEffect =
        deepWoundsLevel1Ability?.getEffect() ??
        deepWoundsLevel2Ability?.getEffect() ??
        deepWoundsLevel3Ability?.getEffect() ??
        null;
    if (deepWoundsLevel1Ability && deepWoundsLevel1Ability.getEffect()) {
        powerSum += fromUnit.calculateAbilityCount(
            deepWoundsLevel1Ability,
            FightStateManager.getInstance().getFightProperties().getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
        );
    }
    if (deepWoundsLevel2Ability && deepWoundsLevel2Ability.getEffect()) {
        powerSum += fromUnit.calculateAbilityCount(
            deepWoundsLevel2Ability,
            FightStateManager.getInstance().getFightProperties().getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
        );
    }
    if (deepWoundsLevel3Ability && deepWoundsLevel3Ability.getEffect()) {
        powerSum += fromUnit.calculateAbilityCount(
            deepWoundsLevel3Ability,
            FightStateManager.getInstance().getFightProperties().getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
        );
    }

    if (powerSum && deepWoundsEffect) {
        const activeDeepWoundsEffect = targetUnit.getEffect("Deep Wounds");

        // need to overwrite actual effect power here
        deepWoundsEffect.setPower(Number(((activeDeepWoundsEffect?.getPower() ?? 0) + powerSum).toFixed(1)));

        const laps = deepWoundsEffect.getLaps();

        if (targetUnit.getId() === currentActiveUnit.getId()) {
            deepWoundsEffect.extend();
        }

        if (targetUnit.applyEffect(deepWoundsEffect)) {
            sceneLog.updateLog(
                `${fromUnit.getName()} applied Deep Wounds on ${targetUnit.getName()} for ${HoCLib.getLapString(laps)}`,
            );
        }
    }
}
