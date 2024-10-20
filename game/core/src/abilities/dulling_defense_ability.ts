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

import { ISceneLog, Unit } from "@heroesofcrypto/common";

export function processDullingDefenseAblity(fromUnit: Unit, toUnit: Unit, sceneLog: ISceneLog): void {
    if (toUnit.isDead()) {
        return;
    }

    const dullingDefenseAbility = fromUnit.getAbility("Dulling Defense");
    if (dullingDefenseAbility) {
        const dullingDefensePower = Number(dullingDefenseAbility.getPower().toFixed(1));
        if (dullingDefensePower <= 0) {
            return;
        }

        const reducedBy = toUnit.reduceBaseAttack(dullingDefensePower);

        if (reducedBy) {
            sceneLog.updateLog(`${toUnit.getName()} permanently lost ${reducedBy} base attack due to Dulling Defense`);
        }
    }
}
