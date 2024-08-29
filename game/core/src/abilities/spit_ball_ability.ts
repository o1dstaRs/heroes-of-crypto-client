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

import { AttackType, HoCLib, HoCConfig, ToFactionType, AllFactionsType, Grid, Spell } from "@heroesofcrypto/common";
import { getAbsorptionTarget } from "../effects/effects_helper";

import { SceneLog } from "../menu/scene_log";
import { isMirrored } from "../spells/spells_helper";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { getLapString } from "../utils/strings";

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
    unitsHolder: UnitsHolder,
    grid: Grid,
    sceneLog: SceneLog,
): void {
    // effect can be absorbed
    const absorptionTarget = getAbsorptionTarget(targetUnit, grid, unitsHolder);
    if (absorptionTarget) {
        targetUnit = absorptionTarget;
    }

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

    if (!debuffs.size) {
        return;
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

        const debuff = new Spell({ spellProperties: HoCConfig.getSpellConfig(faction, randomDebuff), amount: 1 });
        let laps = debuff.getLapsTotal();

        targetUnit.applyDebuff(debuff, undefined, undefined, targetUnit.getId() === currentActiveUnit.getId());
        sceneLog.updateLog(
            `${fromUnit.getName()} applied ${randomDebuff} on ${targetUnit.getName()} for ${getLapString(laps)}`,
        );

        // we already know it has not been applied already
        if (isMirrored(targetUnit)) {
            fromUnit.applyDebuff(debuff, undefined, undefined, fromUnit.getId() === currentActiveUnit.getId());
            sceneLog.updateLog(
                `${targetUnit.getName()} mirrored ${randomDebuff} to ${fromUnit.getName()} for ${getLapString(laps)}`,
            );
        }
    } else {
        sceneLog.updateLog(`${targetUnit.getName()} resisted from ${randomDebuff}`);
    }
}
