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
    HoCConstants,
    HoCMath,
    HoCLib,
    Unit,
    FightStateManager,
    ISceneLog,
    UnitsHolder,
    IStatisticHolder,
    IDamageStatistic,
} from "@heroesofcrypto/common";

import { processLuckyStrikeAbility } from "./lucky_strike_ability";
import { processPetrifyingGazeAbility } from "./petrifying_gaze_ability";
import { processSpitBallAbility } from "./spit_ball_ability";
import { processStunAbility } from "./stun_ability";

export interface IAOERangeAttackResult {
    landed: boolean;
    maxDamage: number;
    unitIdsDied: string[];
}

export function processRangeAOEAbility(
    attackerUnit: Unit,
    affectedUnits: Unit[],
    currentActiveUnit: Unit,
    rangeAttackDivisor: number,
    unitsHolder: UnitsHolder,
    grid: Grid,
    sceneLog: ISceneLog,
    damageStatisticHolder: IStatisticHolder<IDamageStatistic>,
    isAttack = true,
): IAOERangeAttackResult {
    const unitIdsDied: string[] = [];
    let aoeAbility = attackerUnit.getAbility("Area Throw");
    if (!aoeAbility) {
        aoeAbility = attackerUnit.getAbility("Large Caliber");
    }

    let maxDamage = 0;
    if (aoeAbility) {
        const wasDead: Unit[] = [];
        for (const unit of affectedUnits) {
            if (unit.isDead()) {
                unitIdsDied.push(unit.getId());
                wasDead.push(unit);
                continue;
            }

            const isAttackMissed =
                HoCLib.getRandomInt(0, 100) <
                attackerUnit.calculateMissChance(
                    unit,
                    FightStateManager.getInstance()
                        .getFightProperties()
                        .getAdditionalAbilityPowerPerTeam(unit.getTeam()),
                );
            if (isAttackMissed) {
                sceneLog.updateLog(`${attackerUnit.getName()} misses ${isAttack ? "attk" : "resp"} ${unit.getName()}`);
            } else {
                let abilityMultiplier = attackerUnit.calculateAbilityMultiplier(
                    aoeAbility,
                    FightStateManager.getInstance()
                        .getFightProperties()
                        .getAdditionalAbilityPowerPerTeam(attackerUnit.getTeam()),
                );

                const paralysisAttackerEffect = attackerUnit.getEffect("Paralysis");
                if (paralysisAttackerEffect) {
                    abilityMultiplier *= (100 - paralysisAttackerEffect.getPower()) / 100;
                }

                const damageFromAttack = processLuckyStrikeAbility(
                    attackerUnit,
                    attackerUnit.calculateAttackDamage(
                        unit,
                        AttackType.RANGE,
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalAbilityPowerPerTeam(attackerUnit.getTeam()),
                        rangeAttackDivisor,
                        abilityMultiplier,
                        false,
                    ),
                    sceneLog,
                );

                damageStatisticHolder.add({
                    unitName: attackerUnit.getName(),
                    damage: unit.applyDamage(damageFromAttack),
                    team: attackerUnit.getTeam(),
                });
                const pegasusLightEffect = unit.getEffect("Pegasus Light");
                if (pegasusLightEffect) {
                    attackerUnit.increaseMorale(pegasusLightEffect.getPower());
                }
                sceneLog.updateLog(
                    `${attackerUnit.getName()} ${isAttack ? "attk" : "resp"} ${unit.getName()} (${damageFromAttack})`,
                );
                maxDamage = Math.max(maxDamage, damageFromAttack);

                if (!unit.isDead()) {
                    processPetrifyingGazeAbility(attackerUnit, unit, damageFromAttack, sceneLog, damageStatisticHolder);
                }
            }
        }

        for (const unit of affectedUnits) {
            if (unit.isDead() && !wasDead.includes(unit)) {
                sceneLog.updateLog(`${unit.getName()} died`);
                if (!unitIdsDied.includes(unit.getId())) {
                    unitIdsDied.push(unit.getId());
                }
                attackerUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
                unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(unit);
                attackerUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
                wasDead.push(unit);
            } else {
                processStunAbility(attackerUnit, unit, attackerUnit, sceneLog);
                processSpitBallAbility(attackerUnit, unit, currentActiveUnit, unitsHolder, grid, sceneLog);
            }
        }
        attackerUnit.decreaseNumberOfShots();

        return {
            landed: true,
            maxDamage,
            unitIdsDied,
        };
    }

    return {
        landed: false,
        maxDamage,
        unitIdsDied,
    };
}

export function evaluateAffectedUnits(
    affectedCells: HoCMath.XY[],
    unitsHolder: UnitsHolder,
    grid: Grid,
): Array<Unit[]> | undefined {
    const cellKeys: number[] = [];
    const unitIds: string[] = [];
    const affectedUnits: Unit[] = [];

    for (const c of affectedCells) {
        const cellKey = (c.x << 4) | c.y;
        if (cellKeys.includes(cellKey)) {
            continue;
        }

        const occupantId = grid.getOccupantUnitId(c);
        if (!occupantId) {
            continue;
        }

        if (unitIds.includes(occupantId)) {
            continue;
        }

        const occupantUnit = unitsHolder.getAllUnits().get(occupantId);
        if (!occupantUnit) {
            continue;
        }

        affectedUnits.push(occupantUnit);
        cellKeys.push(cellKey);
        unitIds.push(occupantId);
    }

    if (affectedUnits.length) {
        return [affectedUnits, affectedUnits];
    }

    return undefined;
}
