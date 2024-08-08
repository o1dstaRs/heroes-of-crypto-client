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
import { Ability } from "./abilities";

export function processLuckyStrikeAbility(ability: Ability): boolean {
    if (ability.getName() == "Lucky Strike") {
        if (HoCLib.getRandomInt(0, 100) < 40) {
            return true;
        }
    }
    return false;
}
