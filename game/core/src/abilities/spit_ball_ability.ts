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

import { AttackType, HoCLib, ToFactionType, AllFactionsType } from "@heroesofcrypto/common";

import { SceneLog } from "../menu/scene_log";
import { SpellsFactory } from "../spells/spells_factory";
import { Unit } from "../units/units";

const POSSIBLE_DEBUFFS_TO_FACTIONS = {
    Sadness: "Death",
    Quagmire: "Death",
    "Weakening Beam": "Death",
    Weakness: "Death",
    Rangebane: "Order",
    Cowardice: "Order",
};

export function processSpitBallAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    spellsFactory: SpellsFactory,
    sceneLog: SceneLog,
): void {
    if (targetUnit.isDead()) {
        return;
    }

    const spilBallAbility = fromUnit.getAbility("Spit Ball");
    if (!spilBallAbility || HoCLib.getRandomInt(0, 100) >= fromUnit.calculateAbilityApplyChance(spilBallAbility)) {
        return;
    }

    const debuffsNames = Object.keys(POSSIBLE_DEBUFFS_TO_FACTIONS);
    const debuffs = new Set(debuffsNames);
    if (targetUnit.getAttackType() !== AttackType.RANGE) {
        debuffs.delete("Rangebane");
    }

    for (const db of debuffsNames) {
        if (debuffs.has(db) && targetUnit.hasDebuffActive(db)) {
            debuffs.delete(db);
        }
    }

    const randomDebuff = Array.from(debuffs)[HoCLib.getRandomInt(0, debuffs.size)];

    let applied = true;
    if (HoCLib.getRandomInt(0, 100) < Math.floor(targetUnit.getMagicResist())) {
        applied = false;
    }

    if (applied) {
        // can return us undefined
        const faction =
            ToFactionType[
                POSSIBLE_DEBUFFS_TO_FACTIONS[
                    randomDebuff as keyof typeof POSSIBLE_DEBUFFS_TO_FACTIONS
                ] as AllFactionsType
            ];

        if (faction === undefined) {
            return;
        }

        const debuff = spellsFactory.makeSpell(faction, randomDebuff, 1);
        targetUnit.applyDebuff(debuff, undefined, undefined, targetUnit.getId() === currentActiveUnit.getId());
        sceneLog.updateLog(`Applied ${randomDebuff} on ${targetUnit.getName()}`);
    } else {
        sceneLog.updateLog(`${targetUnit.getName()} resisted from ${randomDebuff}`);
    }
}
