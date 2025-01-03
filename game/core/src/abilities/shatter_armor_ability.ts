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

import { AbilityType, ISceneLog, Unit, HoCLib, FightStateManager } from "@heroesofcrypto/common";

export function processShatterArmorAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    sceneLog: ISceneLog,
): void {
    if (targetUnit.isDead()) {
        return;
    }

    const shatterArmorAbility = fromUnit.getAbility("Shatter Armor");
    if (shatterArmorAbility) {
        const shatterArmorEffect = shatterArmorAbility.getEffect();
        if (!shatterArmorEffect) {
            return;
        }

        const activeShatterArmorEffect = targetUnit.getEffect("Shatter Armor");
        const amplifier =
            shatterArmorAbility.getType() === AbilityType.STATUS && targetUnit.hasAbilityActive("Mechanism") ? 1.5 : 1;

        // need to overwrite actual effect power here
        shatterArmorEffect.setPower(
            Number(
                (
                    (activeShatterArmorEffect?.getPower() ?? 0) +
                    fromUnit.calculateAbilityCount(
                        shatterArmorAbility,
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
                    ) *
                        amplifier
                ).toFixed(2),
            ),
        );

        const laps = shatterArmorEffect.getLaps();

        if (targetUnit.getId() === currentActiveUnit.getId()) {
            shatterArmorEffect.extend();
        }

        if (targetUnit.applyEffect(shatterArmorEffect)) {
            sceneLog.updateLog(
                `${fromUnit.getName()} applied Shatter Armor on ${targetUnit.getName()} for ${HoCLib.getLapString(
                    laps,
                )}`,
            );
        }
    }
}
