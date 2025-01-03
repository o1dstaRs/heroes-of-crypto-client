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

import {
    AttackType,
    HoCLib,
    HoCMath,
    HoCConstants,
    ISceneLog,
    Unit,
    FightStateManager,
    UnitsHolder,
    IStatisticHolder,
    IDamageStatistic,
} from "@heroesofcrypto/common";

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
import { processDullingDefenseAblity } from "./dulling_defense_ability";

export interface ILightningSpinResult {
    landed: boolean;
    unitIdsDied: string[];
}

export function processLightningSpinAbility(
    fromUnit: Unit,
    sceneLog: ISceneLog,
    unitsHolder: UnitsHolder,
    rapidChargeCells: number,
    damageStatisticHolder: IStatisticHolder<IDamageStatistic>,
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
        let increaseMoraleTotal = 0;

        let moraleDecreaseForTheUnitTeam: Record<string, number> = {};

        for (const enemy of enemyList) {
            if (enemy.isDead()) {
                wasDead.push(enemy);
                continue;
            }

            const isAttackMissed =
                HoCLib.getRandomInt(0, 100) <
                fromUnit.calculateMissChance(
                    enemy,
                    FightStateManager.getInstance()
                        .getFightProperties()
                        .getAdditionalAbilityPowerPerTeam(enemy.getTeam()),
                );

            if (fromUnit.hasDebuffActive("Cowardice") && fromUnit.getCumulativeHp() < enemy.getCumulativeHp()) {
                continue;
            }

            if (isAttackMissed) {
                sceneLog.updateLog(`${fromUnit.getName()} misses ${actionString} ${enemy.getName()}`);
                continue;
            }

            let abilityMultiplier =
                fromUnit.calculateAbilityMultiplier(
                    lightningSpinAbility,
                    FightStateManager.getInstance()
                        .getFightProperties()
                        .getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
                ) * commonAbilityMultiplier;
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

            damageStatisticHolder.add({
                unitName: fromUnit.getName(),
                damage: enemy.applyDamage(
                    damageFromAttack,
                    FightStateManager.getInstance().getFightProperties().getBreakChancePerTeam(fromUnit.getTeam()),
                    sceneLog,
                ),
                team: fromUnit.getTeam(),
                lap: FightStateManager.getInstance().getFightProperties().getCurrentLap(),
            });
            enemyIdDamageFromAttack.set(enemy.getId(), damageFromAttack);
            const pegasusLightEffect = enemy.getEffect("Pegasus Light");
            if (pegasusLightEffect) {
                increaseMoraleTotal += pegasusLightEffect.getPower();
            }

            sceneLog.updateLog(`${fromUnit.getName()} ${actionString} ${enemy.getName()} (${damageFromAttack})`);

            if (enemy.isDead()) {
                unitsDead.push(enemy);
            } else {
                // check all the possible modificators here
                // just in case if we have more inherited/stolen abilities
                processMinerAbility(fromUnit, enemy, sceneLog);
                processStunAbility(fromUnit, enemy, fromUnit, sceneLog);
                processDullingDefenseAblity(enemy, fromUnit, sceneLog);
                processPetrifyingGazeAbility(fromUnit, enemy, damageFromAttack, sceneLog, damageStatisticHolder);
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
        }

        for (const enemy of enemyList) {
            if (!wasDead.includes(enemy)) {
                const damageFromAttack = enemyIdDamageFromAttack.get(enemy.getId());
                if (damageFromAttack) {
                    const fireShieldResult = processFireShieldAbility(
                        enemy,
                        fromUnit,
                        sceneLog,
                        damageFromAttack,
                        unitsHolder,
                        damageStatisticHolder,
                    );

                    if (fireShieldResult.increaseMorale) {
                        enemy.increaseMorale(
                            fireShieldResult.increaseMorale,
                            FightStateManager.getInstance()
                                .getFightProperties()
                                .getAdditionalMoralePerTeam(enemy.getTeam()),
                        );
                    }

                    if (Object.keys(fireShieldResult.moraleDecreaseForTheUnitTeam).length) {
                        moraleDecreaseForTheUnitTeam = fireShieldResult.moraleDecreaseForTheUnitTeam;
                    }

                    for (const uId in fireShieldResult.unitIdsDied) {
                        if (!unitIdsDied.includes(uId)) {
                            unitIdsDied.push(uId);
                        }
                    }
                }
            }
        }

        for (const unitDead of unitsDead) {
            sceneLog.updateLog(`${unitDead.getName()} died`);
            unitIdsDied.push(unitDead.getId());
            increaseMoraleTotal += HoCConstants.MORALE_CHANGE_FOR_KILL;
            const unitNameKey = `${unitDead.getName()}:${unitDead.getTeam()}`;
            moraleDecreaseForTheUnitTeam[unitNameKey] =
                (moraleDecreaseForTheUnitTeam[unitNameKey] || 0) + HoCConstants.MORALE_CHANGE_FOR_KILL;
        }

        if (!isAttack) {
            processOneInTheFieldAbility(fromUnit);
        }

        lightningSpinLanded = true;

        if (!fromUnit.isDead()) {
            fromUnit.increaseMorale(
                increaseMoraleTotal,
                FightStateManager.getInstance().getFightProperties().getAdditionalMoralePerTeam(fromUnit.getTeam()),
            );
        }

        unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(moraleDecreaseForTheUnitTeam);
    }

    return { landed: lightningSpinLanded, unitIdsDied };
}
