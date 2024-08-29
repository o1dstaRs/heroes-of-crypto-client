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

import { Unit } from "../units/units";
import { Spell } from "./spells";

export const isMirrored = (targetUnit: Unit): boolean => {
    let mirrorChance = 0;
    const magicMirrorBuff = targetUnit.getBuff("Magic Mirror");
    const massMagicMirrorBuff = targetUnit.getBuff("Mass Magic Mirror");
    if (magicMirrorBuff) {
        mirrorChance = magicMirrorBuff.getPower();
    }
    if (massMagicMirrorBuff) {
        mirrorChance = Math.max(mirrorChance, massMagicMirrorBuff.getPower());
    }
    if (mirrorChance > 100) {
        mirrorChance = 100;
    }
    if (mirrorChance < 0) {
        mirrorChance = 0;
    }
    mirrorChance = Math.floor(mirrorChance);

    return HoCLib.getRandomInt(0, 100) < Math.floor(mirrorChance);
};

export const hasAlreadyAppliedSpell = (targetUnit: Unit, spell: Spell): boolean => {
    const conflictingSpells = [...spell.getConflictsWith(), spell.getName()];
    let needToApply = true;
    for (const cs of conflictingSpells) {
        if ((spell.isBuff() && targetUnit.hasBuffActive(cs)) || (!spell.isBuff() && targetUnit.hasDebuffActive(cs))) {
            needToApply = false;
            break;
        }
    }

    return needToApply;
};
