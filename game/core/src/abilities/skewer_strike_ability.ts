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
    Grid,
    HoCMath,
    HoCConstants,
    ISceneLog,
    Unit,
    FightStateManager,
    UnitsHolder,
    AbilityHelper,
    IStatisticHolder,
    IDamageStatistic,
} from "@heroesofcrypto/common";

import { processAggrAbility } from "./aggr_ability";
import { processBlindnessAbility } from "./blindness_ability";
import { processBoarSalivaAbility } from "./boar_saliva_ability";
import { processDeepWoundsAbility } from "./deep_wounds_ability";
import { processDullingDefenseAblity } from "./dulling_defense_ability";
import { processMinerAbility } from "./miner_ability";
import { processParalysisAbility } from "./paralysis_ability";
import { processPegasusLightAbility } from "./pegasus_light_ability";
import { processPetrifyingGazeAbility } from "./petrifying_gaze_ability";
import { processShatterArmorAbility } from "./shatter_armor_ability";
import { processStunAbility } from "./stun_ability";

export function processSkewerStrikeAbility(
    fromUnit: Unit,
    toUnit: Unit,
    sceneLog: ISceneLog,
    unitsHolder: UnitsHolder,
    grid: Grid,
    damageStatisticHolder: IStatisticHolder<IDamageStatistic>,
    targetMovePosition?: HoCMath.XY,
    isAttack = true,
): string[] {
    const unitIdsDied: string[] = [];
    const skewerStrikeAbility = fromUnit.getAbility("Skewer Strike");

    if (!skewerStrikeAbility) {
        return unitIdsDied;
    }

    let actionString: string;
    if (isAttack) {
        actionString = "attk";
    } else {
        actionString = "resp";
    }

    const unitsDead: Unit[] = [];
    const targets = AbilityHelper.nextStandingTargets(
        fromUnit,
        toUnit,
        grid,
        unitsHolder,
        targetMovePosition,
        false,
        true,
    );

    for (const nextStandingTarget of targets) {
        if (nextStandingTarget.isDead()) {
            continue;
        }

        const damageFromAttack = fromUnit.calculateAttackDamage(
            nextStandingTarget,
            AttackType.MELEE,
            1,
            fromUnit.calculateAbilityMultiplier(skewerStrikeAbility),
        );

        damageStatisticHolder.add({
            unitName: fromUnit.getName(),
            damage: nextStandingTarget.applyDamage(damageFromAttack),
            team: fromUnit.getTeam(),
        });

        sceneLog.updateLog(
            `${fromUnit.getName()} ${actionString} ${nextStandingTarget.getName()} (${damageFromAttack})`,
        );

        if (nextStandingTarget.isDead()) {
            unitsDead.push(nextStandingTarget);
        }

        // check all the possible modificators here
        // just in case if we have more inherited/stolen abilities
        processMinerAbility(fromUnit, nextStandingTarget, sceneLog);
        processStunAbility(fromUnit, nextStandingTarget, fromUnit, sceneLog);
        processDullingDefenseAblity(nextStandingTarget, fromUnit, sceneLog);
        processPetrifyingGazeAbility(fromUnit, nextStandingTarget, damageFromAttack, sceneLog, damageStatisticHolder);
        processBoarSalivaAbility(fromUnit, nextStandingTarget, fromUnit, sceneLog);
        processAggrAbility(fromUnit, nextStandingTarget, fromUnit, sceneLog);
        processDeepWoundsAbility(fromUnit, nextStandingTarget, fromUnit, sceneLog);
        processPegasusLightAbility(fromUnit, nextStandingTarget, fromUnit, sceneLog);
        processParalysisAbility(fromUnit, nextStandingTarget, fromUnit, sceneLog);
        if (isAttack) {
            processShatterArmorAbility(fromUnit, nextStandingTarget, fromUnit, sceneLog);
        } else {
            processBlindnessAbility(fromUnit, nextStandingTarget, fromUnit, sceneLog);
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

    return unitIdsDied;
}
