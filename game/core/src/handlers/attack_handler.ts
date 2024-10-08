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
    GridMath,
    GridSettings,
    Grid,
    SpellHelper,
    SpellPowerType,
    IWeightedRoute,
    Spell,
    HoCConstants,
    AbilityHelper,
    ISceneLog,
    Unit,
    FightStateManager,
    UnitsHolder,
    EffectHelper,
    MoveHandler,
    IAnimationData,
} from "@heroesofcrypto/common";

import { processDoublePunchAbility } from "../abilities/double_punch_ability";
import { processDoubleShotAbility } from "../abilities/double_shot_ability";
import { processFireBreathAbility } from "../abilities/fire_breath_ability";
import { processFireShieldAbility } from "../abilities/fire_shield_ability";
import { processLightningSpinAbility } from "../abilities/lightning_spin_ability";
import { processOneInTheFieldAbility } from "../abilities/one_in_the_field_ability";
import { processStunAbility } from "../abilities/stun_ability";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { processBlindnessAbility } from "../abilities/blindness_ability";
import { processBoarSalivaAbility } from "../abilities/boar_saliva_ability";
import { processSpitBallAbility } from "../abilities/spit_ball_ability";
import { processPetrifyingGazeAbility } from "../abilities/petrifying_gaze_ability";
import { IAOERangeAttackResult, processRangeAOEAbility } from "../abilities/aoe_range_ability";
import { processThroughShotAbility } from "../abilities/through_shot_ability";
import { processLuckyStrikeAbility } from "../abilities/lucky_strike_ability";
import { processShatterArmorAbility } from "../abilities/shatter_armor_ability";
import { processRapidChargeAbility } from "../abilities/rapid_charge_ability";
import { processPenetratingBiteAbility } from "../abilities/penetrating_bite_ability";
import { processPegasusLightAbility } from "../abilities/pegasus_light_ability";
import { processParalysisAbility } from "../abilities/paralysis_ability";
import { processDeepWoundsAbility } from "../abilities/deep_wounds_ability";
import { processMinerAbility } from "../abilities/miner_ability";
import { processAggrAbility } from "../abilities/aggr_ability";
import { processSkewerStrikeAbility } from "../abilities/skewer_strike_ability";
import { IVisibleDamage } from "../state/visible_state";
import { processChainLightningAbility } from "../abilities/chain_lightning_ability";

export interface IRangeAttackEvaluation {
    rangeAttackDivisors: number[];
    affectedUnits: Array<Unit[]>;
    affectedCells: Array<HoCMath.XY[]>;
    attackObstacle?: IAttackObstacle;
}

export interface IAttackResult {
    completed: boolean;
    unitIdsDied: string[];
    animationData?: IAnimationData[];
}

export interface IAttackObstacle {
    position: HoCMath.XY;
    size: number;
    distance: number;
}

export class AttackHandler {
    public readonly gridSettings: GridSettings;

    public readonly grid: Grid;

    public readonly sceneLog: ISceneLog;

    public constructor(gridSettings: GridSettings, grid: Grid, sceneLog: ISceneLog) {
        this.gridSettings = gridSettings;
        this.grid = grid;
        this.sceneLog = sceneLog;
    }

    private getAffectedUnitsAndObstacles(
        allUnits: ReadonlyMap<string, Unit>,
        cellsToPositions: [HoCMath.XY, HoCMath.XY][],
        attackerUnit: Unit,
        isThroughShot = false,
        isSelection = false,
        isAOEShot = false,
    ): IRangeAttackEvaluation {
        const affectedUnitIds: string[] = [];
        const affectedUnits: Array<Unit[]> = [];
        const affectedCells: Array<HoCMath.XY[]> = [];
        const rangeAttackDivisors: number[] = [];
        let attackObstacle: IAttackObstacle | undefined;

        for (const cellToPosition of cellsToPositions) {
            const cell = cellToPosition[0];
            const position = cellToPosition[1];

            const possibleUnitId = this.grid.getOccupantUnitId(cell);
            if (possibleUnitId === "B" && !isSelection && !isAOEShot) {
                const obstablePosition = {
                    x: (this.gridSettings.getMinX() + this.gridSettings.getMaxX()) / 2,
                    y: (this.gridSettings.getMinY() + this.gridSettings.getMaxY()) / 2,
                };
                attackObstacle = {
                    position: obstablePosition,
                    size: 4,
                    distance: HoCMath.getDistance(attackerUnit.getPosition(), obstablePosition),
                };
                break;
            }

            if (!possibleUnitId) {
                continue;
            }
            if ((attackerUnit && attackerUnit.getId() === possibleUnitId) || affectedUnitIds.includes(possibleUnitId)) {
                continue;
            }
            const possibleUnit = allUnits.get(possibleUnitId);
            if (!possibleUnit) {
                continue;
            }

            if (attackerUnit) {
                if (attackerUnit.getTeam() === possibleUnit.getTeam()) {
                    continue;
                }
            }

            let unitsThisShot: Unit[] = [];
            unitsThisShot.push(possibleUnit);
            affectedUnitIds.push(possibleUnitId);

            if (attackerUnit.hasAbilityActive("Large Caliber") || attackerUnit.hasAbilityActive("Area Throw")) {
                const unitIds: string[] = [possibleUnitId];

                let isCellOccupied = false;
                const possibleOccupantId = this.grid.getOccupantUnitId(cell);
                if (possibleOccupantId) {
                    if (allUnits.get(possibleOccupantId)) {
                        isCellOccupied = true;
                    }
                }

                if (isSelection || isCellOccupied) {
                    const cells = GridMath.getCellsAroundCell(this.gridSettings, cell);

                    for (const c of cells) {
                        const possibleUnitId = this.grid.getOccupantUnitId(c);
                        if (!possibleUnitId) {
                            continue;
                        }
                        if (unitIds.includes(possibleUnitId)) {
                            continue;
                        }

                        const possibleUnit = allUnits.get(possibleUnitId);
                        if (!possibleUnit) {
                            continue;
                        }

                        unitsThisShot.push(possibleUnit);
                        unitIds.push(possibleUnitId);
                    }

                    cells.push(cell);
                    affectedCells.push(cells);
                } else {
                    affectedCells.push([cell]);
                }
            } else {
                affectedCells.push([cell]);
            }

            affectedUnits.push(unitsThisShot);
            rangeAttackDivisors.push(this.getRangeAttackDivisor(attackerUnit, position));

            if (isThroughShot && possibleUnit.hasAbilityActive("Arrows Wingshield Aura")) {
                break;
            }
        }

        return {
            rangeAttackDivisors,
            affectedUnits,
            affectedCells,
            attackObstacle,
        };
    }

    private getCellsToPositions(positions: HoCMath.XY[]): Array<[HoCMath.XY, HoCMath.XY]> {
        const cells: Array<[HoCMath.XY, HoCMath.XY]> = [];
        const cellKeys: number[] = [];

        for (const position of positions) {
            const cell = GridMath.getCellForPosition(this.gridSettings, position);
            if (!cell) {
                continue;
            }
            const cellKey = (cell.x << 4) | cell.y;
            if (cellKeys.includes(cellKey)) {
                continue;
            }
            cells.push([cell, position]);
            cellKeys.push(cellKey);
        }
        return cells;
    }

    private getIntersectedPositions(start: HoCMath.XY, end: HoCMath.XY): HoCMath.XY[] {
        const positions: HoCMath.XY[] = [];

        // Convert world coordinates to grid coordinates
        const gridStart = start;
        const gridEnd = end;

        let x0 = Math.round(gridStart.x);
        let y0 = Math.round(gridStart.y);
        let x1 = Math.round(gridEnd.x);
        let y1 = Math.round(gridEnd.y);

        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            positions.push({ x: x0, y: y0 });

            if (x0 === x1 && y0 === y1) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }

        return positions;
    }

    public getRangeAttackDivisor(attackerUnit: Unit, attackPosition: HoCMath.XY): number {
        let rangeAttackDivisor = 1;

        if (!attackerUnit.hasAbilityActive("Sniper")) {
            const shotDistancePixels = Math.ceil(attackerUnit.getRangeShotDistance() * this.gridSettings.getStep());
            let distance = HoCMath.getDistance(attackerUnit.getPosition(), attackPosition);
            while (distance >= shotDistancePixels) {
                distance -= shotDistancePixels;
                rangeAttackDivisor *= 2;
            }
        }
        if (rangeAttackDivisor < 1) {
            rangeAttackDivisor = 1;
        }
        if (rangeAttackDivisor > 8) {
            rangeAttackDivisor = 8;
        }

        return Math.floor(rangeAttackDivisor);
    }

    public evaluateRangeAttack(
        allUnits: ReadonlyMap<string, Unit>,
        fromUnit: Unit,
        fromPosition: HoCMath.XY,
        toPosition: HoCMath.XY,
        isThroughShot = false,
        isSelection = false,
        isAOEShot = false,
    ): IRangeAttackEvaluation {
        const intersectedCellsToPositions = this.getCellsToPositions(
            this.getIntersectedPositions(fromPosition, toPosition),
        );

        return this.getAffectedUnitsAndObstacles(
            allUnits,
            intersectedCellsToPositions,
            fromUnit,
            isThroughShot,
            isSelection,
            isAOEShot,
        );
    }

    public canLandRangeAttack(unit: Unit, aggrMatrix?: number[][]): boolean {
        return (
            unit.getAttackType() === AttackType.RANGE &&
            !this.canBeAttackedByMelee(unit.getPosition(), unit.isSmallSize(), aggrMatrix) &&
            unit.getRangeShots() > 0 &&
            !unit.hasDebuffActive("Range Null Field Aura") &&
            !unit.hasDebuffActive("Rangebane")
        );
    }

    public canBeAttackedByMelee(unitPosition: HoCMath.XY, isSmallUnit: boolean, enemyAggrMatrix?: number[][]): boolean {
        let cells: HoCMath.XY[];
        if (isSmallUnit) {
            const cell = GridMath.getCellForPosition(this.gridSettings, unitPosition);
            if (cell) {
                cells = [cell];
            } else {
                cells = [];
            }
        } else {
            cells = GridMath.getCellsAroundPosition(this.gridSettings, unitPosition);
        }

        for (const cell of cells) {
            if (enemyAggrMatrix && enemyAggrMatrix[cell.x][cell.y] > 1) {
                return true;
            }
        }

        return false;
    }

    public handleMagicAttack(
        gridMatrix: number[][],
        unitsHolder: UnitsHolder,
        grid: Grid,
        currentActiveSpell?: Spell,
        attackerUnit?: Unit,
        targetUnit?: Unit,
        currentEnemiesCellsWithinMovementRange?: HoCMath.XY[],
    ): IAttackResult {
        const animationData: IAnimationData[] = [];
        const unitIdsDied: string[] = [];
        if (!currentActiveSpell || !attackerUnit) {
            return { completed: false, unitIdsDied, animationData };
        }

        if (
            targetUnit &&
            SpellHelper.canCastSpell(
                false,
                this.gridSettings,
                gridMatrix,
                attackerUnit,
                targetUnit,
                currentActiveSpell,
                attackerUnit.getSpells(),
                targetUnit.getBaseCell(),
                attackerUnit.getTarget(),
                attackerUnit.getTeam(),
                targetUnit.getTeam(),
                attackerUnit.getName(),
                targetUnit.getName(),
                targetUnit.getLevel(),
                targetUnit.getHp(),
                targetUnit.getMaxHp(),
                targetUnit.isSmallSize(),
                attackerUnit.getStackPower(),
                targetUnit.getMagicResist(),
                targetUnit.hasMindAttackResistance(),
                targetUnit.canBeHealed(),
                currentEnemiesCellsWithinMovementRange,
            )
        ) {
            let applied = true;
            let mirroredStr = "";
            const laps = currentActiveSpell.getLapsTotal();
            let clarifyingStr = `for ${HoCLib.getLapString(laps)}`;
            if (currentActiveSpell.isBuff()) {
                if (currentActiveSpell.getPowerType() === SpellPowerType.HEAL) {
                    if (currentActiveSpell.isGiftable()) {
                        const deletedAbility = attackerUnit.deleteAbility(currentActiveSpell.getName());
                        if (!targetUnit.hasAbilityActive(currentActiveSpell.getName()) && deletedAbility) {
                            targetUnit.addAbility(deletedAbility);
                        }
                        clarifyingStr = `=> gifted`;
                    } else {
                        const healPower = targetUnit.applyHeal(
                            Math.floor(currentActiveSpell.getPower() * attackerUnit.getAmountAlive()),
                        );
                        clarifyingStr = `for ${healPower} hp`;
                    }
                } else {
                    targetUnit.applyBuff(
                        currentActiveSpell,
                        attackerUnit.getMaxHp(),
                        attackerUnit.getBaseArmor(),
                        attackerUnit.getId() === targetUnit.getId(),
                    );
                }
            } else if (
                HoCLib.getRandomInt(0, 100) < Math.floor(targetUnit.getMagicResist()) ||
                (currentActiveSpell.getPowerType() === SpellPowerType.MIND && targetUnit.hasMindAttackResistance())
            ) {
                applied = false;
            } else {
                // effect can be absorbed
                let debuffTarget = targetUnit;

                const absorptionTarget = EffectHelper.getAbsorptionTarget(debuffTarget, grid, unitsHolder);
                if (absorptionTarget) {
                    debuffTarget = absorptionTarget;
                }

                const laps = currentActiveSpell.getLapsTotal();

                if (
                    !(
                        currentActiveSpell.getPowerType() === SpellPowerType.MIND &&
                        debuffTarget.hasMindAttackResistance()
                    )
                ) {
                    if (currentActiveSpell.getPowerType() === SpellPowerType.POSITION_CHANGE) {
                        const attackerUnitPosition = structuredClone(attackerUnit.getPosition());
                        const targetUnitPosition = structuredClone(debuffTarget.getPosition());
                        const attackerBaseCell = attackerUnit.getBaseCell();
                        const debuffTargetBaseCell = debuffTarget.getBaseCell();
                        if (attackerBaseCell && debuffTargetBaseCell) {
                            const initialAttackerCell = structuredClone(attackerBaseCell);
                            const initialTargetUnitCell = structuredClone(debuffTargetBaseCell);

                            this.grid.cleanupAll(
                                attackerUnit.getId(),
                                attackerUnit.getAttackRange(),
                                attackerUnit.isSmallSize(),
                            );
                            this.grid.cleanupAll(
                                debuffTarget.getId(),
                                debuffTarget.getAttackRange(),
                                debuffTarget.isSmallSize(),
                            );

                            const newAttackerPosition = GridMath.getPositionForCell(
                                initialTargetUnitCell,
                                this.gridSettings.getMinX(),
                                this.gridSettings.getStep(),
                                this.gridSettings.getHalfStep(),
                            );
                            attackerUnit.setPosition(newAttackerPosition.x, newAttackerPosition.y, false);
                            this.grid.occupyCell(
                                initialTargetUnitCell,
                                attackerUnit.getId(),
                                attackerUnit.getTeam(),
                                attackerUnit.getAttackRange(),
                            );

                            const newTargetUnitPosition = GridMath.getPositionForCell(
                                initialAttackerCell,
                                this.gridSettings.getMinX(),
                                this.gridSettings.getStep(),
                                this.gridSettings.getHalfStep(),
                            );
                            debuffTarget.setPosition(newTargetUnitPosition.x, newTargetUnitPosition.y, false);
                            this.grid.occupyCell(
                                initialAttackerCell,
                                debuffTarget.getId(),
                                debuffTarget.getTeam(),
                                debuffTarget.getAttackRange(),
                            );

                            animationData.push(
                                {
                                    toPosition: targetUnitPosition,
                                    affectedUnit: attackerUnit,
                                    bodyUnit: attackerUnit,
                                },
                                {
                                    toPosition: attackerUnitPosition,
                                    affectedUnit: debuffTarget,
                                    bodyUnit: debuffTarget,
                                },
                            );
                        }
                    } else {
                        debuffTarget.applyDebuff(
                            currentActiveSpell,
                            undefined,
                            undefined,
                            attackerUnit.getId() === targetUnit.getId(),
                        );
                    }
                }

                if (
                    currentActiveSpell.getPowerType() !== SpellPowerType.POSITION_CHANGE &&
                    SpellHelper.isMirrored(debuffTarget) &&
                    !SpellHelper.hasAlreadyAppliedSpell(debuffTarget, currentActiveSpell) &&
                    !(
                        currentActiveSpell.getPowerType() === SpellPowerType.MIND &&
                        attackerUnit.hasMindAttackResistance()
                    )
                ) {
                    attackerUnit.applyDebuff(
                        currentActiveSpell,
                        undefined,
                        undefined,
                        attackerUnit.getId() === targetUnit.getId(),
                    );
                    mirroredStr = `${debuffTarget.getName()} mirrored ${currentActiveSpell.getName()} to ${attackerUnit.getName()} for ${HoCLib.getLapString(
                        laps,
                    )}`;
                }
            }

            if (currentActiveSpell.isSelfDebuffApplicable()) {
                // effect can be absorbed
                let debuffTarget = attackerUnit;
                const absorptionTarget = EffectHelper.getAbsorptionTarget(debuffTarget, grid, unitsHolder);
                if (absorptionTarget) {
                    debuffTarget = absorptionTarget;
                }

                if (
                    !SpellHelper.hasAlreadyAppliedSpell(debuffTarget, currentActiveSpell) &&
                    !(
                        currentActiveSpell.getPowerType() === SpellPowerType.MIND &&
                        debuffTarget.hasMindAttackResistance()
                    )
                ) {
                    debuffTarget.applyDebuff(
                        currentActiveSpell,
                        attackerUnit.getMaxHp(),
                        attackerUnit.getBaseArmor(),
                        true,
                    );
                }
            }

            attackerUnit.useSpell(currentActiveSpell.getName());
            let newText = `${attackerUnit.getName()} cast ${currentActiveSpell.getName()}`;
            if (attackerUnit.getId() === targetUnit.getId()) {
                newText += ` on themselves ${clarifyingStr}`;
            } else {
                newText += ` on ${targetUnit.getName()} ${clarifyingStr}`;
            }
            this.sceneLog.updateLog(newText);
            if (!applied) {
                this.sceneLog.updateLog(`${targetUnit.getName()} resisted from ${currentActiveSpell.getName()}`);
            }
            this.sceneLog.updateLog(mirroredStr);

            return { completed: true, unitIdsDied, animationData };
        }

        return { completed: false, unitIdsDied, animationData };
    }

    public handleRangeAttack(
        unitsHolder: UnitsHolder,
        grid: Grid,
        hoverRangeAttackDivisors: number[],
        rangeResponseAttackDivisor: number,
        damageForAnimation: IVisibleDamage,
        attackerUnit?: Unit,
        targetUnits?: Array<Unit[]>,
        rangeResponseUnits?: Unit[],
        hoverRangeAttackPosition?: HoCMath.XY,
        isAOE = false,
    ): IAttackResult {
        const unitIdsDied: string[] = [];
        const animationData: IAnimationData[] = [];
        if (
            !attackerUnit ||
            attackerUnit.isDead() ||
            // AOE attack can have zero target units
            (!targetUnits?.length && !isAOE) ||
            !hoverRangeAttackDivisors.length ||
            !hoverRangeAttackPosition ||
            attackerUnit.getAttackTypeSelection() !== AttackType.RANGE ||
            !this.canLandRangeAttack(attackerUnit, grid.getEnemyAggrMatrixByUnitId(attackerUnit.getId()))
        ) {
            return { completed: false, unitIdsDied, animationData };
        }

        if (!targetUnits) {
            if (isAOE) {
                this.sceneLog.updateLog(`${attackerUnit.getName()} miss aoe`);
            }
            return { completed: isAOE, unitIdsDied, animationData };
        }

        if (targetUnits.length !== hoverRangeAttackDivisors.length) {
            return { completed: false, unitIdsDied, animationData };
        }

        let targetUnitUndex = 0;
        let affectedUnits = targetUnits.at(targetUnitUndex);
        if (!affectedUnits?.length) {
            return { completed: false, unitIdsDied, animationData };
        }

        let targetUnit = affectedUnits[0];

        if (!targetUnit && isAOE) {
            this.sceneLog.updateLog(`${attackerUnit.getName()} miss aoe`);
            return { completed: true, unitIdsDied, animationData };
        }

        // check if unit is forced to attack certain enemy only
        // if so, check if the forced target is still alive
        const forcedTargetUnitId = attackerUnit.getTarget();
        const forcedTargetUnit = unitsHolder.getAllUnits().get(forcedTargetUnitId);
        if (
            forcedTargetUnit &&
            !forcedTargetUnit.isDead() &&
            forcedTargetUnitId &&
            forcedTargetUnitId !== targetUnit.getId()
        ) {
            return { completed: false, unitIdsDied, animationData };
        }

        const throughShotResult = processThroughShotAbility(
            attackerUnit,
            targetUnits,
            attackerUnit,
            hoverRangeAttackDivisors,
            hoverRangeAttackPosition,
            unitsHolder,
            grid,
            this.sceneLog,
        );
        for (const uId of throughShotResult.unitIdsDied) {
            unitIdsDied.push(uId);
        }
        for (const ad of throughShotResult.animationData) {
            animationData.push(ad);
        }

        if (throughShotResult.landed) {
            unitsHolder.refreshStackPowerForAllUnits();
            return { completed: true, unitIdsDied, animationData };
        }

        if (
            !isAOE &&
            (!targetUnit ||
                (targetUnit.getTeam() === attackerUnit.getTeam() && !isAOE) ||
                targetUnit.isDead() ||
                (attackerUnit.hasDebuffActive("Cowardice") &&
                    attackerUnit.getCumulativeHp() < targetUnit.getCumulativeHp()))
        ) {
            return { completed: false, unitIdsDied, animationData };
        }

        let hoverRangeAttackDivisor: number | undefined = hoverRangeAttackDivisors.at(targetUnitUndex);
        if (!hoverRangeAttackDivisor) {
            return { completed: false, unitIdsDied, animationData };
        }

        targetUnitUndex++;

        animationData.push({
            fromPosition: attackerUnit.getPosition(),
            toPosition: hoverRangeAttackPosition,
            affectedUnit: targetUnit,
        });

        const isAttackMissed = HoCLib.getRandomInt(0, 100) < attackerUnit.calculateMissChance(targetUnit);
        let damageFromAttack = 0;

        const fightProperties = FightStateManager.getInstance().getFightProperties();
        let rangeResponseUnit = rangeResponseUnits?.length ? rangeResponseUnits[0] : undefined;

        // response starts here
        let damageFromResponse = 0;
        let isResponseMissed = false;
        if (
            rangeResponseUnit &&
            !attackerUnit.canSkipResponse() &&
            !fightProperties.hasAlreadyRepliedAttack(targetUnit.getId()) &&
            targetUnit.canRespond(AttackType.RANGE) &&
            this.canLandRangeAttack(targetUnit, grid.getEnemyAggrMatrixByUnitId(targetUnit.getId())) &&
            !(
                targetUnit.hasDebuffActive("Cowardice") &&
                targetUnit.getCumulativeHp() < rangeResponseUnit.getCumulativeHp()
            ) &&
            (!targetUnit.getTarget() || targetUnit.getTarget() === attackerUnit.getId())
        ) {
            isResponseMissed = HoCLib.getRandomInt(0, 100) < targetUnit.calculateMissChance(rangeResponseUnit);
            animationData.push({
                fromPosition: targetUnit.getPosition(),
                toPosition: attackerUnit.getPosition(),
                affectedUnit: rangeResponseUnit,
            });
        } else {
            rangeResponseUnit = undefined;
        }

        // handle attack damage
        let aoeRangeAttackResult = processRangeAOEAbility(
            attackerUnit,
            affectedUnits,
            attackerUnit,
            hoverRangeAttackDivisor,
            unitsHolder,
            grid,
            this.sceneLog,
            true,
        );
        let attackDamageApplied = true;
        if (aoeRangeAttackResult.landed) {
            damageFromAttack = processLuckyStrikeAbility(attackerUnit, aoeRangeAttackResult.maxDamage, this.sceneLog);
            for (const uId of aoeRangeAttackResult.unitIdsDied) {
                unitIdsDied.push(uId);
            }
        } else if (isAttackMissed) {
            this.sceneLog.updateLog(`${attackerUnit.getName()} misses attk ${targetUnit.getName()}`);
        } else {
            let abilityMultiplier = 1;
            const paralysisAttackerEffect = attackerUnit.getEffect("Paralysis");
            if (paralysisAttackerEffect) {
                abilityMultiplier *= (100 - paralysisAttackerEffect.getPower()) / 100;
            }
            damageFromAttack = processLuckyStrikeAbility(
                attackerUnit,
                attackerUnit.calculateAttackDamage(
                    targetUnit,
                    AttackType.RANGE,
                    hoverRangeAttackDivisor,
                    abilityMultiplier,
                ),
                this.sceneLog,
            );
            this.sceneLog.updateLog(`${attackerUnit.getName()} attk ${targetUnit.getName()} (${damageFromAttack})`);
            attackDamageApplied = false;
        }

        // handle response damage
        let aoeRangeResponseResult: IAOERangeAttackResult | undefined = undefined;
        if (rangeResponseUnit && rangeResponseUnits) {
            aoeRangeResponseResult = processRangeAOEAbility(
                targetUnit,
                rangeResponseUnits,
                targetUnit,
                rangeResponseAttackDivisor,
                unitsHolder,
                grid,
                this.sceneLog,
                false,
            );
            if (aoeRangeResponseResult.landed) {
                damageFromResponse = processLuckyStrikeAbility(
                    targetUnit,
                    aoeRangeResponseResult.maxDamage,
                    this.sceneLog,
                );
                for (const uId of aoeRangeResponseResult.unitIdsDied) {
                    unitIdsDied.push(uId);
                }
            } else if (isResponseMissed) {
                this.sceneLog.updateLog(`${targetUnit.getName()} misses resp ${rangeResponseUnit.getName()}`);
            } else {
                let abilityMultiplier = 1;
                const paralysisTargetUnitEffect = targetUnit.getEffect("Paralysis");
                if (paralysisTargetUnitEffect) {
                    abilityMultiplier *= (100 - paralysisTargetUnitEffect.getPower()) / 100;
                }

                damageFromResponse = processLuckyStrikeAbility(
                    targetUnit,
                    targetUnit.calculateAttackDamage(
                        rangeResponseUnit,
                        AttackType.RANGE,
                        rangeResponseAttackDivisor,
                        abilityMultiplier,
                    ),
                    this.sceneLog,
                );

                this.sceneLog.updateLog(
                    `${targetUnit.getName()} resp ${rangeResponseUnit.getName()} (${damageFromResponse})`,
                );

                rangeResponseUnit.applyDamage(damageFromResponse);
                DamageStatisticHolder.getInstance().add({
                    unitName: targetUnit.getName(),
                    damage: damageFromResponse,
                    team: targetUnit.getTeam(),
                });
                const pegasusLightEffect = rangeResponseUnit.getEffect("Pegasus Light");
                if (pegasusLightEffect) {
                    targetUnit.increaseMorale(pegasusLightEffect.getPower());
                }
            }

            processOneInTheFieldAbility(targetUnit);
        }

        let switchTargetUnit = false;
        if (!aoeRangeAttackResult?.landed || !isAOE) {
            if (!attackDamageApplied) {
                targetUnit.applyDamage(damageFromAttack);
                damageForAnimation.render = true;
                damageForAnimation.amount = damageFromAttack;
                damageForAnimation.unitPosition = targetUnit.getPosition();
                damageForAnimation.unitIsSmall = targetUnit.isSmallSize();

                DamageStatisticHolder.getInstance().add({
                    unitName: attackerUnit.getName(),
                    damage: damageFromAttack,
                    team: attackerUnit.getTeam(),
                });
                const pegasusLightEffect = targetUnit.getEffect("Pegasus Light");
                if (pegasusLightEffect) {
                    attackerUnit.increaseMorale(pegasusLightEffect.getPower());
                }
            }

            if (targetUnit.isDead()) {
                switchTargetUnit = true;
                if (!unitIdsDied.includes(targetUnit.getId())) {
                    this.sceneLog.updateLog(`${targetUnit.getName()} died`);
                    unitIdsDied.push(targetUnit.getId());
                    attackerUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
                    unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
                    attackerUnit.applyMoraleStepsModifier(
                        FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                    );
                }
            } else {
                processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processPetrifyingGazeAbility(attackerUnit, targetUnit, damageFromAttack, this.sceneLog);
                processSpitBallAbility(attackerUnit, targetUnit, attackerUnit, unitsHolder, grid, this.sceneLog);
            }
        }

        if (rangeResponseUnit) {
            if (aoeRangeResponseResult?.landed) {
                if (rangeResponseUnit.isDead() && attackerUnit.getId() === rangeResponseUnit.getId()) {
                    unitIdsDied.push(rangeResponseUnit.getId());
                    return { completed: true, unitIdsDied, animationData };
                }
            } else {
                if (rangeResponseUnit.isDead()) {
                    if (!unitIdsDied.includes(rangeResponseUnit.getId())) {
                        this.sceneLog.updateLog(`${rangeResponseUnit.getName()} died`);
                        unitIdsDied.push(rangeResponseUnit.getId());
                        unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(rangeResponseUnit);
                        if (!targetUnit.isDead()) {
                            targetUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
                            targetUnit.applyMoraleStepsModifier(
                                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                            );
                        }
                    }

                    if (attackerUnit.getId() === rangeResponseUnit.getId()) {
                        return { completed: true, unitIdsDied, animationData };
                    }
                } else {
                    processStunAbility(targetUnit, rangeResponseUnit, attackerUnit, this.sceneLog);
                    processPetrifyingGazeAbility(targetUnit, rangeResponseUnit, damageFromResponse, this.sceneLog);
                    processSpitBallAbility(
                        targetUnit,
                        rangeResponseUnit,
                        attackerUnit,
                        unitsHolder,
                        grid,
                        this.sceneLog,
                    );
                }
            }
        }

        unitsHolder.refreshStackPowerForAllUnits();

        if (switchTargetUnit) {
            while (targetUnitUndex < targetUnits.length) {
                affectedUnits = targetUnits.at(targetUnitUndex);
                if (!affectedUnits?.length) {
                    break;
                }

                let allDead = true;
                for (const au of affectedUnits) {
                    if (!au.isDead()) {
                        allDead = false;
                        break;
                    }
                }
                if (!allDead) {
                    break;
                }
                targetUnitUndex++;
            }

            if (!affectedUnits?.length) {
                return { completed: true, unitIdsDied, animationData };
            }

            targetUnit = affectedUnits[0];

            if (
                !targetUnit ||
                targetUnit.getTeam() === attackerUnit.getTeam() ||
                targetUnit.isDead() ||
                (attackerUnit.hasDebuffActive("Cowardice") &&
                    attackerUnit.getCumulativeHp() < targetUnit.getCumulativeHp())
            ) {
                if (targetUnit.isDead()) {
                    unitIdsDied.push(targetUnit.getId());
                }
                return { completed: true, unitIdsDied, animationData };
            }
            hoverRangeAttackDivisor = hoverRangeAttackDivisors.at(targetUnitUndex);
            if (!hoverRangeAttackDivisor) {
                return { completed: true, unitIdsDied, animationData };
            }
        }

        // second attack
        const secondShotResult = processDoubleShotAbility(
            attackerUnit,
            targetUnit,
            affectedUnits,
            this.sceneLog,
            unitsHolder,
            grid,
            hoverRangeAttackDivisor,
            hoverRangeAttackPosition,
            damageForAnimation,
            isAOE,
        );

        for (const ad of secondShotResult.animationData) {
            animationData.push(ad);
        }

        for (const uId of secondShotResult.unitIdsDied) {
            unitIdsDied.push(uId);
        }

        if (!secondShotResult.aoeRangeAttackLanded) {
            if (targetUnit.isDead() && !unitIdsDied.includes(targetUnit.getId())) {
                this.sceneLog.updateLog(`${targetUnit.getName()} died`);
                unitIdsDied.push(targetUnit.getId());
                attackerUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
                unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
                attackerUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
            } else if (secondShotResult.applied) {
                processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processPetrifyingGazeAbility(attackerUnit, targetUnit, secondShotResult.damage, this.sceneLog);
                processSpitBallAbility(attackerUnit, targetUnit, attackerUnit, unitsHolder, grid, this.sceneLog);
            }
        }

        unitsHolder.refreshStackPowerForAllUnits();

        return { completed: true, unitIdsDied, animationData };
    }

    public handleMeleeAttack(
        unitsHolder: UnitsHolder,
        grid: Grid,
        moveHandler: MoveHandler,
        damageForAnimation: IVisibleDamage,
        currentActiveKnownPaths?: Map<number, IWeightedRoute[]>,
        attackerUnit?: Unit,
        targetUnit?: Unit,
        attackFromCell?: HoCMath.XY,
    ): IAttackResult {
        const animationData: IAnimationData[] = [];
        const unitIdsDied: string[] = [];

        const updateUnitsDied = (updateBy: string[]): void => {
            for (const s of updateBy) {
                unitIdsDied.push(s);
            }
        };

        if (
            !attackerUnit ||
            attackerUnit.isDead() ||
            !targetUnit ||
            targetUnit.isDead() ||
            !attackFromCell ||
            (attackerUnit.getAttackTypeSelection() !== AttackType.MELEE &&
                attackerUnit.getAttackTypeSelection() !== AttackType.MELEE_MAGIC) ||
            attackerUnit.hasAbilityActive("No Melee") ||
            attackerUnit.getTeam() === targetUnit.getTeam() ||
            (attackerUnit.hasDebuffActive("Cowardice") && attackerUnit.getCumulativeHp() < targetUnit.getCumulativeHp())
        ) {
            return { completed: false, unitIdsDied, animationData };
        }

        // check if unit is forced to attack certain enemy only
        // if so, check if the forced target is still alive
        const forcedTargetUnitId = attackerUnit.getTarget();
        const forcedTargetUnit = unitsHolder.getAllUnits().get(forcedTargetUnitId);
        if (
            forcedTargetUnit &&
            !forcedTargetUnit.isDead() &&
            forcedTargetUnitId &&
            forcedTargetUnitId !== targetUnit.getId()
        ) {
            return { completed: false, unitIdsDied, animationData };
        }

        const currentCell = GridMath.getCellForPosition(this.gridSettings, attackerUnit.getPosition());

        if (!currentCell) {
            return { completed: false, unitIdsDied, animationData };
        }

        const attackFromCells = [attackFromCell];
        if (!attackerUnit.isSmallSize()) {
            attackFromCells.push(
                { x: attackFromCell.x, y: attackFromCell.y - 1 },
                { x: attackFromCell.x - 1, y: attackFromCell.y },
                { x: attackFromCell.x - 1, y: attackFromCell.y - 1 },
            );
        }

        if (!grid.areCellsAdjacent(attackFromCells, targetUnit.getCells())) {
            return { completed: false, unitIdsDied, animationData };
        }

        const stationaryAttack = currentCell.x === attackFromCell.x && currentCell.y === attackFromCell.y;

        if (attackerUnit.isSmallSize()) {
            if (
                grid.areAllCellsEmpty([attackFromCell], attackerUnit.getId()) &&
                (stationaryAttack || currentActiveKnownPaths?.get((attackFromCell.x << 4) | attackFromCell.y)?.length)
            ) {
                const position = GridMath.getPositionForCell(
                    attackFromCell,
                    this.gridSettings.getMinX(),
                    this.gridSettings.getStep(),
                    this.gridSettings.getHalfStep(),
                );

                const moveInitiated =
                    stationaryAttack ||
                    moveHandler.applyMoveModifiers(
                        attackFromCell,
                        FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                        attackerUnit,
                        currentActiveKnownPaths,
                    );
                if (!moveInitiated) {
                    return { completed: false, unitIdsDied, animationData };
                }

                attackerUnit.setPosition(position.x, position.y, false);
                grid.occupyCell(
                    attackFromCell,
                    attackerUnit.getId(),
                    attackerUnit.getTeam(),
                    attackerUnit.getAttackRange(),
                );

                animationData.push({
                    toPosition: attackerUnit.getPosition(),
                    affectedUnit: attackerUnit,
                    bodyUnit: attackerUnit,
                });
            } else {
                return { completed: false, unitIdsDied, animationData };
            }
        } else {
            const position = GridMath.getPositionForCell(
                attackFromCell,
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );
            const cells = GridMath.getCellsAroundPosition(this.gridSettings, {
                x: position.x - this.gridSettings.getHalfStep(),
                y: position.y - this.gridSettings.getHalfStep(),
            });
            if (
                grid.areAllCellsEmpty(cells, attackerUnit.getId()) &&
                (stationaryAttack || currentActiveKnownPaths?.get((attackFromCell.x << 4) | attackFromCell.y)?.length)
            ) {
                const moveInitiated =
                    stationaryAttack ||
                    moveHandler.applyMoveModifiers(
                        attackFromCell,
                        FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                        attackerUnit,
                        currentActiveKnownPaths,
                    );
                if (!moveInitiated) {
                    return { completed: false, unitIdsDied, animationData };
                }

                attackerUnit.setPosition(
                    position.x - this.gridSettings.getHalfStep(),
                    position.y - this.gridSettings.getHalfStep(),
                    false,
                );

                grid.occupyCells(cells, attackerUnit.getId(), attackerUnit.getTeam(), attackerUnit.getAttackRange());

                animationData.push({
                    toPosition: attackerUnit.getPosition(),
                    affectedUnit: attackerUnit,
                    bodyUnit: attackerUnit,
                });
            } else {
                return { completed: false, unitIdsDied, animationData };
            }
        }

        let abilityMultiplier = 1;
        let rapidChargeCellsNumber = 1;
        if (currentActiveKnownPaths) {
            const paths = currentActiveKnownPaths.get((attackFromCell.x << 4) | attackFromCell.y);
            if (paths?.length) {
                rapidChargeCellsNumber = paths[0].route.length;
            }
            abilityMultiplier = processRapidChargeAbility(attackerUnit, rapidChargeCellsNumber);
        }

        const paralysisAttackerEffect = attackerUnit.getEffect("Paralysis");
        if (paralysisAttackerEffect) {
            abilityMultiplier *= (100 - paralysisAttackerEffect.getPower()) / 100;
        }

        const abilitiesWithPositionCoeff = AbilityHelper.getAbilitiesWithPosisionCoefficient(
            attackerUnit.getAbilities(),
            attackFromCell,
            GridMath.getCellForPosition(this.gridSettings, targetUnit.getPosition()),
            targetUnit.isSmallSize(),
            attackerUnit.getTeam(),
        );

        if (abilitiesWithPositionCoeff.length) {
            for (const awpc of abilitiesWithPositionCoeff) {
                abilityMultiplier *= attackerUnit.calculateAbilityMultiplier(awpc);
            }
        }

        const deepWoundsTargetEffect = targetUnit.getEffect("Deep Wounds");
        if (
            deepWoundsTargetEffect &&
            (attackerUnit.hasAbilityActive("Deep Wounds Level 1") ||
                attackerUnit.hasAbilityActive("Deep Wounds Level 2") ||
                attackerUnit.hasAbilityActive("Deep Wounds Level 3"))
        ) {
            abilityMultiplier *= 1 + deepWoundsTargetEffect.getPower() / 100;
        }

        const isAttackMissed = HoCLib.getRandomInt(0, 100) < attackerUnit.calculateMissChance(targetUnit);

        attackerUnit.cleanupAttackModIncrease();
        attackerUnit.increaseAttackMod(unitsHolder.getUnitAuraAttackMod(attackerUnit));

        const damageFromAttack =
            processLuckyStrikeAbility(
                attackerUnit,
                attackerUnit.calculateAttackDamage(targetUnit, AttackType.MELEE, 1, abilityMultiplier),
                this.sceneLog,
            ) + processPenetratingBiteAbility(attackerUnit, targetUnit);

        const fightProperties = FightStateManager.getInstance().getFightProperties();

        const lightningSpinAttackResult = processLightningSpinAbility(
            attackerUnit,
            this.sceneLog,
            unitsHolder,
            rapidChargeCellsNumber,
            attackFromCell,
            true,
        );
        const hasLightningSpinAttackLanded = lightningSpinAttackResult.landed;
        updateUnitsDied(lightningSpinAttackResult.unitIdsDied);

        updateUnitsDied(
            processFireBreathAbility(
                attackerUnit,
                targetUnit,
                this.sceneLog,
                unitsHolder,
                grid,
                this.gridSettings,
                "attk",
                attackFromCell,
            ),
        );

        updateUnitsDied(
            processSkewerStrikeAbility(
                attackerUnit,
                targetUnit,
                this.sceneLog,
                unitsHolder,
                grid,
                this.gridSettings,
                attackFromCell,
                true,
            ),
        );

        if (isAttackMissed) {
            this.sceneLog.updateLog(`${attackerUnit.getName()} misses attk ${targetUnit.getName()}`);
        } else if (!hasLightningSpinAttackLanded) {
            // just log attack here,
            // to make sure that logs are in chronological order
            this.sceneLog.updateLog(`${attackerUnit.getName()} attk ${targetUnit.getName()} (${damageFromAttack})`);

            updateUnitsDied(
                processFireShieldAbility(targetUnit, attackerUnit, this.sceneLog, damageFromAttack, unitsHolder),
            );
        }

        let hasLightningSpinResponseLanded = false;

        const captureResponse = (): void => {
            hasLightningSpinResponseLanded = false;
            if (
                !fightProperties.hasAlreadyRepliedAttack(targetUnit.getId()) &&
                targetUnit.canRespond(AttackType.MELEE) &&
                !attackerUnit.canSkipResponse() &&
                !targetUnit.hasAbilityActive("No Melee") &&
                !(
                    targetUnit.hasDebuffActive("Cowardice") &&
                    targetUnit.getCumulativeHp() < attackerUnit.getCumulativeHp()
                ) &&
                (!targetUnit.getTarget() || targetUnit.getTarget() === attackerUnit.getId())
            ) {
                const isResponseMissed = HoCLib.getRandomInt(0, 100) < targetUnit.calculateMissChance(attackerUnit);

                updateUnitsDied(
                    processFireBreathAbility(
                        targetUnit,
                        attackerUnit,
                        this.sceneLog,
                        unitsHolder,
                        grid,
                        this.gridSettings,
                        "resp",
                        GridMath.getCellForPosition(this.gridSettings, targetUnit.getPosition()),
                    ),
                );

                updateUnitsDied(
                    processSkewerStrikeAbility(
                        targetUnit,
                        attackerUnit,
                        this.sceneLog,
                        unitsHolder,
                        grid,
                        this.gridSettings,
                        GridMath.getCellForPosition(this.gridSettings, targetUnit.getPosition()),
                        false,
                    ),
                );

                const lightningSpinResponseResult = processLightningSpinAbility(
                    targetUnit,
                    this.sceneLog,
                    unitsHolder,
                    1,
                    attackFromCell,
                    false,
                );
                hasLightningSpinResponseLanded = lightningSpinResponseResult.landed;
                updateUnitsDied(lightningSpinResponseResult.unitIdsDied);

                if (isResponseMissed) {
                    this.sceneLog.updateLog(`${targetUnit.getName()} misses resp ${attackerUnit.getName()}`);
                } else if (!hasLightningSpinResponseLanded) {
                    abilityMultiplier = 1;
                    const abilitiesWithPositionCoeffResp = AbilityHelper.getAbilitiesWithPosisionCoefficient(
                        targetUnit.getAbilities(),
                        GridMath.getCellForPosition(this.gridSettings, targetUnit.getPosition()),
                        attackFromCell,
                        attackerUnit.isSmallSize(),
                        targetUnit.getTeam(),
                    );

                    if (abilitiesWithPositionCoeffResp.length) {
                        for (const awpc of abilitiesWithPositionCoeffResp) {
                            abilityMultiplier *= targetUnit.calculateAbilityMultiplier(awpc);
                        }
                    }

                    const paralysisTargetUnitEffect = targetUnit.getEffect("Paralysis");
                    if (paralysisTargetUnitEffect) {
                        abilityMultiplier *= (100 - paralysisTargetUnitEffect.getPower()) / 100;
                    }

                    const deepWoundsAttackerEffect = attackerUnit.getEffect("Deep Wounds");
                    if (
                        deepWoundsAttackerEffect &&
                        (targetUnit.hasAbilityActive("Deep Wounds Level 1") ||
                            targetUnit.hasAbilityActive("Deep Wounds Level 2") ||
                            targetUnit.hasAbilityActive("Deep Wounds Level 3"))
                    ) {
                        abilityMultiplier *= 1 + deepWoundsAttackerEffect.getPower() / 100;
                    }

                    const damageFromResponse =
                        processLuckyStrikeAbility(
                            targetUnit,
                            targetUnit.calculateAttackDamage(attackerUnit, AttackType.MELEE, 1, abilityMultiplier),
                            this.sceneLog,
                        ) + processPenetratingBiteAbility(targetUnit, attackerUnit);

                    this.sceneLog.updateLog(
                        `${targetUnit.getName()} resp ${attackerUnit.getName()} (${damageFromResponse})`,
                    );

                    attackerUnit.applyDamage(damageFromResponse);
                    DamageStatisticHolder.getInstance().add({
                        unitName: targetUnit.getName(),
                        damage: damageFromResponse,
                        team: targetUnit.getTeam(),
                    });
                    const pegasusLightEffect = attackerUnit.getEffect("Pegasus Light");
                    if (pegasusLightEffect) {
                        targetUnit.increaseMorale(pegasusLightEffect.getPower());
                    }

                    processMinerAbility(targetUnit, attackerUnit, this.sceneLog);
                    updateUnitsDied(
                        processFireShieldAbility(
                            attackerUnit,
                            targetUnit,
                            this.sceneLog,
                            damageFromResponse,
                            unitsHolder,
                        ),
                    );
                    processStunAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                    processPetrifyingGazeAbility(targetUnit, attackerUnit, damageFromResponse, this.sceneLog);
                    processBoarSalivaAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                    processAggrAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                    processDeepWoundsAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                    processPegasusLightAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                    processParalysisAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                    processBlindnessAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                    updateUnitsDied(
                        processChainLightningAbility(
                            targetUnit,
                            attackerUnit,
                            damageFromResponse,
                            this.grid,
                            unitsHolder,
                            this.sceneLog,
                        ),
                    );
                }
                processOneInTheFieldAbility(targetUnit);
            }
        };

        // capture response
        captureResponse();

        if (!hasLightningSpinAttackLanded && !isAttackMissed) {
            // this code has to be here to make sure that respond damage has been applied as well
            targetUnit.applyDamage(damageFromAttack);
            damageForAnimation.render = true;
            damageForAnimation.amount = damageFromAttack;
            damageForAnimation.unitPosition = targetUnit.getPosition();
            damageForAnimation.unitIsSmall = targetUnit.isSmallSize();
            DamageStatisticHolder.getInstance().add({
                unitName: attackerUnit.getName(),
                damage: damageFromAttack,
                team: attackerUnit.getTeam(),
            });

            processMinerAbility(attackerUnit, targetUnit, this.sceneLog);
            processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processPetrifyingGazeAbility(attackerUnit, targetUnit, damageFromAttack, this.sceneLog);
            processBoarSalivaAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processAggrAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processDeepWoundsAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processPegasusLightAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processParalysisAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processShatterArmorAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            updateUnitsDied(
                processChainLightningAbility(
                    attackerUnit,
                    targetUnit,
                    damageFromAttack,
                    this.grid,
                    unitsHolder,
                    this.sceneLog,
                ),
            );
            const pegasusLightEffect = targetUnit.getEffect("Pegasus Light");
            if (pegasusLightEffect) {
                attackerUnit.increaseMorale(pegasusLightEffect.getPower());
            }
            // ~ already responded here
        }
        unitsHolder.refreshStackPowerForAllUnits();

        const secondPunchResult = processDoublePunchAbility(attackerUnit, targetUnit, this.sceneLog);

        if (!hasLightningSpinResponseLanded && attackerUnit.isDead() && !unitIdsDied.includes(attackerUnit.getId())) {
            this.sceneLog.updateLog(`${attackerUnit.getName()} died`);

            unitIdsDied.push(attackerUnit.getId());
            targetUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
            targetUnit.applyMoraleStepsModifier(
                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
            );
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(attackerUnit);
        }

        if (!hasLightningSpinAttackLanded && targetUnit.isDead() && !unitIdsDied.includes(targetUnit.getId())) {
            this.sceneLog.updateLog(`${targetUnit.getName()} died`);

            unitIdsDied.push(targetUnit.getId());
            attackerUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
            attackerUnit.applyMoraleStepsModifier(
                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
            );
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
        } else if (secondPunchResult.applied) {
            captureResponse();
            if (secondPunchResult.damage > 0) {
                targetUnit.applyDamage(secondPunchResult.damage);
            }
            updateUnitsDied(
                processFireShieldAbility(
                    targetUnit,
                    attackerUnit,
                    this.sceneLog,
                    secondPunchResult.damage,
                    unitsHolder,
                ),
            );
            if (!secondPunchResult.missed) {
                processMinerAbility(attackerUnit, targetUnit, this.sceneLog);
                processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processPetrifyingGazeAbility(attackerUnit, targetUnit, secondPunchResult.damage, this.sceneLog);
                processBoarSalivaAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processAggrAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processDeepWoundsAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processPegasusLightAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processParalysisAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processShatterArmorAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            }

            if (
                !hasLightningSpinResponseLanded &&
                attackerUnit.isDead() &&
                !unitIdsDied.includes(attackerUnit.getId())
            ) {
                this.sceneLog.updateLog(`${attackerUnit.getName()} eee2 ied`);

                unitIdsDied.push(attackerUnit.getId());
                targetUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
                targetUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
                unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(attackerUnit);
            }

            if (!hasLightningSpinAttackLanded && targetUnit.isDead() && !unitIdsDied.includes(targetUnit.getId())) {
                this.sceneLog.updateLog(`${targetUnit.getName()} died`);

                unitIdsDied.push(targetUnit.getId());
                attackerUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
                attackerUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
                unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
            }
        }

        unitsHolder.refreshStackPowerForAllUnits();

        return { completed: true, unitIdsDied, animationData };
    }
}
