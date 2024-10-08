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

import { ISceneLog, Unit, HoCLib } from "@heroesofcrypto/common";

export function processPegasusLightAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    sceneLog: ISceneLog,
): void {
    if (targetUnit.isDead()) {
        return;
    }

    const pegasusLightAbility = fromUnit.getAbility("Pegasus Light");
    if (pegasusLightAbility) {
        const pegasusLightEffect = pegasusLightAbility.getEffect();
        if (!pegasusLightEffect) {
            return;
        }

        if (targetUnit.hasEffectActive(pegasusLightEffect.getName())) {
            return;
        }

        // need to overwrite actual effect power here
        pegasusLightEffect.setPower(fromUnit.calculateEffectMultiplier(pegasusLightEffect));

        const laps = pegasusLightEffect.getLaps();

        if (targetUnit.getId() === currentActiveUnit.getId()) {
            pegasusLightEffect.extend();
        }

        if (targetUnit.applyEffect(pegasusLightEffect)) {
            sceneLog.updateLog(
                `${fromUnit.getName()} applied Pegasus Light on ${targetUnit.getName()} for ${HoCLib.getLapString(
                    laps,
                )}`,
            );
        }
    }
}
