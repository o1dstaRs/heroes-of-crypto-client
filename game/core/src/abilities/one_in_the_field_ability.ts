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

import { FightStateManager } from "../state/fight_state_manager";
import { Unit } from "../units/units";

export function processOneInTheFieldAbility(unit: Unit): void {
    if (!unit.hasAbilityActive("One in the Field")) {
        FightStateManager.getInstance().addRepliedAttack(unit.getId());
        unit.setResponded(true);
    }
}
