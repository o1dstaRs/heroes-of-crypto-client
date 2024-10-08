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

import { AttackType, HoCLib, Unit, ISceneLog } from "@heroesofcrypto/common";

import { DamageStatisticHolder } from "../stats/damage_stats";
import { processLuckyStrikeAbility } from "./lucky_strike_ability";
import { processPenetratingBiteAbility } from "./penetrating_bite_ability";

export interface IDoublePunchResult {
    applied: boolean;
    missed: boolean;
    damage: number;
}

export function processDoublePunchAbility(fromUnit: Unit, toUnit: Unit, sceneLog: ISceneLog): IDoublePunchResult {
    const doublePunchAbility = fromUnit.getAbility("Double Punch");
    let secondPunchLanded = false;
    let damageFromAttack = 0;

    if (
        doublePunchAbility &&
        !fromUnit.isDead() &&
        !fromUnit.hasAbilityActive("No Melee") &&
        !fromUnit.isSkippingThisTurn() &&
        !toUnit.isDead() &&
        (!fromUnit.getTarget() || fromUnit.getTarget() === toUnit.getId())
    ) {
        if (HoCLib.getRandomInt(0, 100) < fromUnit.calculateMissChance(toUnit)) {
            sceneLog.updateLog(`${fromUnit.getName()} misses attk ${toUnit.getName()}`);
            return {
                applied: true,
                missed: true,
                damage: damageFromAttack,
            };
        }

        let abilityMultiplier = fromUnit.calculateAbilityMultiplier(doublePunchAbility);
        const paralysisAttackerEffect = fromUnit.getEffect("Paralysis");
        if (paralysisAttackerEffect) {
            abilityMultiplier *= (100 - paralysisAttackerEffect.getPower()) / 100;
        }

        const deepWoundsEffect = toUnit.getEffect("Deep Wounds");
        if (
            deepWoundsEffect &&
            (fromUnit.hasAbilityActive("Deep Wounds Level 1") ||
                fromUnit.hasAbilityActive("Deep Wounds Level 2") ||
                fromUnit.hasAbilityActive("Deep Wounds Level 3"))
        ) {
            abilityMultiplier *= 1 + deepWoundsEffect.getPower() / 100;
        }

        damageFromAttack =
            processLuckyStrikeAbility(
                fromUnit,
                fromUnit.calculateAttackDamage(toUnit, AttackType.MELEE, 1, abilityMultiplier),
                sceneLog,
            ) + processPenetratingBiteAbility(fromUnit, toUnit);
        // do not actually apply the damage, just calculate it
        // it will be applied outside on a client side
        // to make sure that possible response is also captured
        DamageStatisticHolder.getInstance().add({
            unitName: fromUnit.getName(),
            damage: damageFromAttack,
            team: fromUnit.getTeam(),
        });
        const pegasusLightEffect = toUnit.getEffect("Pegasus Light");
        if (pegasusLightEffect) {
            fromUnit.increaseMorale(pegasusLightEffect.getPower());
        }
        sceneLog.updateLog(`${fromUnit.getName()} attk ${toUnit.getName()} (${damageFromAttack})`);

        secondPunchLanded = true;
    }

    return {
        applied: secondPunchLanded,
        missed: false,
        damage: damageFromAttack,
    };
}
