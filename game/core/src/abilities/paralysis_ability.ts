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

import { AbilityType, ISceneLog, HoCLib, Unit, FightStateManager } from "@heroesofcrypto/common";

export function processParalysisAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    sceneLog: ISceneLog,
): void {
    if (targetUnit.isDead()) {
        return;
    }

    const paralysisAbility = fromUnit.getAbility("Paralysis");
    if (
        paralysisAbility &&
        HoCLib.getRandomInt(0, 100) <
            fromUnit.calculateAbilityApplyChance(
                paralysisAbility,
                FightStateManager.getInstance()
                    .getFightProperties()
                    .getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
            ) *
                2
    ) {
        const paralysisEffect = paralysisAbility.getEffect();
        if (!paralysisEffect) {
            return;
        }

        if (targetUnit.hasEffectActive(paralysisEffect.getName())) {
            return;
        }

        const amplifier =
            paralysisAbility.getType() === AbilityType.STATUS && targetUnit.hasAbilityActive("Mechanism") ? 1.5 : 1;

        // need to overwrite actual effect power here
        paralysisEffect.setPower(
            Number(
                (
                    fromUnit.calculateEffectMultiplier(
                        paralysisEffect,
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
                    ) *
                    100 *
                    amplifier
                ).toFixed(2),
            ),
        );

        const laps = paralysisEffect.getLaps();

        if (targetUnit.getId() === currentActiveUnit.getId()) {
            paralysisEffect.extend();
        }

        if (targetUnit.applyEffect(paralysisEffect)) {
            sceneLog.updateLog(
                `${fromUnit.getName()} applied Paralysis on ${targetUnit.getName()} for ${HoCLib.getLapString(laps)}`,
            );
        }
    }
}
