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

import { AbilityType, Unit, HoCLib, ISceneLog, FightStateManager } from "@heroesofcrypto/common";

export function processBoarSalivaAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    sceneLog: ISceneLog,
): void {
    if (targetUnit.isDead()) {
        return;
    }

    const boarSalivaAbility = fromUnit.getAbility("Boar Saliva");
    if (boarSalivaAbility) {
        const boarSalivaEffect = boarSalivaAbility.getEffect();
        if (!boarSalivaEffect) {
            return;
        }

        if (targetUnit.hasEffectActive(boarSalivaEffect.getName())) {
            return;
        }

        // need to overwrite actual effect power here
        boarSalivaEffect.setPower(
            Number(
                (
                    fromUnit.calculateEffectMultiplier(
                        boarSalivaEffect,
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
                    ) * 100
                ).toFixed(2),
            ),
        );

        const laps = boarSalivaEffect.getLaps();

        if (targetUnit.getId() === currentActiveUnit.getId()) {
            boarSalivaEffect.extend();
        }

        if (
            !(boarSalivaAbility.getType() === AbilityType.MIND && targetUnit.hasMindAttackResistance()) &&
            targetUnit.applyEffect(boarSalivaEffect)
        ) {
            sceneLog.updateLog(
                `${fromUnit.getName()} applied Boar Saliva on ${targetUnit.getName()} for ${HoCLib.getLapString(laps)}`,
            );
        } else {
            sceneLog.updateLog(`${targetUnit.getName()} resisted from Boar Saliva`);
        }
    }
}
