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

import { AttackType, Grid, GridSettings, GridMath, HoCMath, HoCConstants } from "@heroesofcrypto/common";

import { SceneLog } from "../menu/scene_log";
import { FightStateManager } from "../state/fight_state_manager";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { nextStandingTargets } from "./abilities_helper";

export function processFireBreathAbility(
    fromUnit: Unit,
    toUnit: Unit,
    sceneLog: SceneLog,
    unitsHolder: UnitsHolder,
    sceneStepCount: number,
    grid: Grid,
    gridSettings: GridSettings,
    attackTypeString: string,
    targetMovePosition?: HoCMath.XY,
): void {
    const fireBreathAbility = fromUnit.getAbility("Fire Breath");

    if (!fireBreathAbility) {
        return;
    }

    const targetPos = GridMath.getCellForPosition(gridSettings, toUnit.getPosition());

    if (targetPos) {
        const unitsDead: Unit[] = [];
        const targets = nextStandingTargets(fromUnit, toUnit, grid, unitsHolder, targetMovePosition);

        for (const nextStandingTarget of targets) {
            if (
                nextStandingTarget.isDead() ||
                nextStandingTarget.getMagicResist() >= 100 ||
                nextStandingTarget.hasAbilityActive("Fire Element")
            ) {
                continue;
            }

            const heavyArmorAbility = nextStandingTarget.getAbility("Heavy Armor");
            let multiplier = 1;
            if (heavyArmorAbility) {
                multiplier = Number(
                    (
                        ((heavyArmorAbility.getPower() + nextStandingTarget.getLuck()) /
                            100 /
                            HoCConstants.MAX_UNIT_STACK_POWER) *
                            nextStandingTarget.getStackPower() +
                        1
                    ).toFixed(2),
                );
            }

            // take magic resist into account
            const fireBreathAttackDamage = Math.floor(
                fromUnit.calculateAttackDamage(
                    nextStandingTarget,
                    AttackType.MELEE,
                    1,
                    fromUnit.calculateAbilityMultiplier(fireBreathAbility),
                ) *
                    (1 - nextStandingTarget.getMagicResist() / 100) *
                    multiplier,
            );

            nextStandingTarget.applyDamage(fireBreathAttackDamage, sceneStepCount);
            DamageStatisticHolder.getInstance().add({
                unitName: fromUnit.getName(),
                damage: fireBreathAttackDamage,
                team: fromUnit.getTeam(),
            });

            sceneLog.updateLog(
                `${fromUnit.getName()} ${attackTypeString} ${nextStandingTarget.getName()} (${fireBreathAttackDamage})`,
            );

            if (nextStandingTarget.isDead()) {
                unitsDead.push(nextStandingTarget);
            }
        }

        for (const unitDead of unitsDead) {
            sceneLog.updateLog(`${unitDead.getName()} died`);
            unitsHolder.deleteUnitById(unitDead.getId(), true);
            fromUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
            fromUnit.applyMoraleStepsModifier(
                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
            );
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(unitDead);
        }

        unitsHolder.refreshStackPowerForAllUnits();
    }
}
