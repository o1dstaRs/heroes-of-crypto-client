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

import { AttackType, HoCLib, HoCMath, HoCConstants, HoCScene } from "@heroesofcrypto/common";

import { FightStateManager } from "../state/fight_state_manager";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { processFireShieldAbility } from "./fire_shield_ability";
import { processOneInTheFieldAbility } from "./one_in_the_field_ability";
import { processStunAbility } from "./stun_ability";
import { processBlindnessAbility } from "./blindness_ability";
import { processBoarSalivaAbility } from "./boar_saliva_ability";
import { processPetrifyingGazeAbility } from "./petrifying_gaze_ability";
import { processLuckyStrikeAbility } from "./lucky_strike_ability";
import { processShatterArmorAbility } from "./shatter_armor_ability";
import { processRapidChargeAbility } from "./rapid_charge_ability";
import { processPenetratingBiteAbility } from "./penetrating_bite_ability";
import { processPegasusLightAbility } from "./pegasus_light_ability";
import { processParalysisAbility } from "./paralysis_ability";
import { processDeepWoundsAbility } from "./deep_wounds_ability";
import { processMinerAbility } from "./miner_ability";
import { processAggrAbility } from "./aggr_ability";

export interface ILightningSpinResult {
    landed: boolean;
    unitIdsDied: string[];
}

export function processLightningSpinAbility(
    fromUnit: Unit,
    sceneLog: HoCScene.SceneLog,
    unitsHolder: UnitsHolder,
    rapidChargeCells: number,
    attackFromCell?: HoCMath.XY,
    isAttack = true,
): ILightningSpinResult {
    const unitIdsDied: string[] = [];
    let lightningSpinLanded = false;
    const lightningSpinAbility = fromUnit.getAbility("Lightning Spin");

    if (lightningSpinAbility) {
        const unitsDead: Unit[] = [];
        const wasDead: Unit[] = [];
        const enemyList = unitsHolder.allEnemiesAroundUnit(fromUnit, isAttack, attackFromCell);
        let actionString: string;
        if (isAttack) {
            actionString = "attk";
        } else {
            actionString = "resp";
        }
        const enemyIdDamageFromAttack: Map<string, number> = new Map();

        const commonAbilityMultiplier = processRapidChargeAbility(fromUnit, rapidChargeCells);
        for (const enemy of enemyList) {
            if (enemy.isDead()) {
                wasDead.push(enemy);
                continue;
            }

            const isAttackMissed = HoCLib.getRandomInt(0, 100) < fromUnit.calculateMissChance(enemy);

            if (fromUnit.hasDebuffActive("Cowardice") && fromUnit.getCumulativeHp() < enemy.getCumulativeHp()) {
                continue;
            }

            if (isAttackMissed) {
                sceneLog.updateLog(`${fromUnit.getName()} misses ${actionString} ${enemy.getName()}`);
                continue;
            }

            let abilityMultiplier = fromUnit.calculateAbilityMultiplier(lightningSpinAbility) * commonAbilityMultiplier;
            const paralysisAttackerEffect = fromUnit.getEffect("Paralysis");
            if (paralysisAttackerEffect) {
                abilityMultiplier *= (100 - paralysisAttackerEffect.getPower()) / 100;
            }

            const deepWoundsEffect = enemy.getEffect("Deep Wounds");
            if (
                deepWoundsEffect &&
                (fromUnit.hasAbilityActive("Deep Wounds Level 1") ||
                    fromUnit.hasAbilityActive("Deep Wounds Level 2") ||
                    fromUnit.hasAbilityActive("Deep Wounds Level 3"))
            ) {
                abilityMultiplier *= 1 + deepWoundsEffect.getPower() / 100;
            }

            const damageFromAttack =
                processLuckyStrikeAbility(
                    fromUnit,
                    fromUnit.calculateAttackDamage(enemy, AttackType.MELEE, 1, abilityMultiplier),
                    sceneLog,
                ) + processPenetratingBiteAbility(fromUnit, enemy);

            enemy.applyDamage(damageFromAttack);
            DamageStatisticHolder.getInstance().add({
                unitName: fromUnit.getName(),
                damage: damageFromAttack,
                team: fromUnit.getTeam(),
            });
            enemyIdDamageFromAttack.set(enemy.getId(), damageFromAttack);
            const pegasusLightEffect = enemy.getEffect("Pegasus Light");
            if (pegasusLightEffect) {
                fromUnit.increaseMorale(pegasusLightEffect.getPower());
            }

            sceneLog.updateLog(`${fromUnit.getName()} ${actionString} ${enemy.getName()} (${damageFromAttack})`);

            if (enemy.isDead()) {
                unitsDead.push(enemy);
            }

            // check all the possible modificators here
            // just in case if we have more inherited/stolen abilities
            processMinerAbility(fromUnit, enemy, sceneLog);
            processStunAbility(fromUnit, enemy, fromUnit, sceneLog);
            processPetrifyingGazeAbility(fromUnit, enemy, damageFromAttack, sceneLog);
            processBoarSalivaAbility(fromUnit, enemy, fromUnit, sceneLog);
            processAggrAbility(fromUnit, enemy, fromUnit, sceneLog);
            processDeepWoundsAbility(fromUnit, enemy, fromUnit, sceneLog);
            processPegasusLightAbility(fromUnit, enemy, fromUnit, sceneLog);
            processParalysisAbility(fromUnit, enemy, fromUnit, sceneLog);
            if (isAttack) {
                processShatterArmorAbility(fromUnit, enemy, fromUnit, sceneLog);
            } else {
                processBlindnessAbility(fromUnit, enemy, fromUnit, sceneLog);
            }
        }

        for (const enemy of enemyList) {
            if (!wasDead.includes(enemy)) {
                const damageFromAttack = enemyIdDamageFromAttack.get(enemy.getId());
                if (damageFromAttack) {
                    processFireShieldAbility(enemy, fromUnit, sceneLog, unitsHolder, damageFromAttack);
                }
            }
        }

        for (const unitDead of unitsDead) {
            sceneLog.updateLog(`${unitDead.getName()} died`);
            unitIdsDied.push(unitDead.getId());
            fromUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
            fromUnit.applyMoraleStepsModifier(
                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
            );
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(unitDead);
        }

        if (!isAttack) {
            processOneInTheFieldAbility(fromUnit);
        }

        lightningSpinLanded = true;
    }

    return { landed: lightningSpinLanded, unitIdsDied };
}
