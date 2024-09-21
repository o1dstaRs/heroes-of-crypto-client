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

import { b2Body, XY } from "@box2d/core";
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
} from "@heroesofcrypto/common";

import { processDoublePunchAbility } from "../abilities/double_punch_ability";
import { processDoubleShotAbility } from "../abilities/double_shot_ability";
import { processFireBreathAbility } from "../abilities/fire_breath_ability";
import { processFireShieldAbility } from "../abilities/fire_shield_ability";
import { processLightningSpinAbility } from "../abilities/lightning_spin_ability";
import { processOneInTheFieldAbility } from "../abilities/one_in_the_field_ability";
import { processStunAbility } from "../abilities/stun_ability";
import { Drawer } from "../draw/drawer";
import { SceneLog } from "../menu/scene_log";
import { FightStateManager } from "../state/fight_state_manager";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { MoveHandler } from "./move_handler";
import { processBlindnessAbility } from "../abilities/blindness_ability";
import { processBoarSalivaAbility } from "../abilities/boar_saliva_ability";
import { processSpitBallAbility } from "../abilities/spit_ball_ability";
import { processPetrifyingGazeAbility } from "../abilities/petrifying_gaze_ability";
import { getAbsorptionTarget } from "../effects/effects_helper";
import { getLapString } from "../utils/strings";
import { hasAlreadyAppliedSpell, isMirrored } from "../spells/spells_helper";
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

export interface IRangeAttackEvaluation {
    rangeAttackDivisors: number[];
    affectedUnits: Array<Unit[]>;
    affectedCells: Array<XY[]>;
    attackObstacle?: IAttackObstacle;
}

export interface IAttackObstacle {
    position: XY;
    size: number;
    distance: number;
}

export class AttackHandler {
    public readonly gridSettings: GridSettings;

    public readonly grid: Grid;

    public readonly sceneLog: SceneLog;

    public constructor(gridSettings: GridSettings, grid: Grid, sceneLog: SceneLog) {
        this.gridSettings = gridSettings;
        this.grid = grid;
        this.sceneLog = sceneLog;
    }

    private getAffectedUnitsAndObstacles(
        allUnits: Map<string, Unit>,
        cellsToPositions: [XY, XY][],
        attackerUnit: Unit,
    ): IRangeAttackEvaluation {
        const affectedUnitIds: string[] = [];
        const affectedUnits: Array<Unit[]> = [];
        const affectedCells: Array<XY[]> = [];
        const rangeAttackDivisors: number[] = [];
        let attackObstacle: IAttackObstacle | undefined;

        for (const cellToPosition of cellsToPositions) {
            const cell = cellToPosition[0];
            const position = cellToPosition[1];

            const possibleUnitId = this.grid.getOccupantUnitId(cell);
            if (possibleUnitId === "B") {
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

            affectedUnits.push(unitsThisShot);
            rangeAttackDivisors.push(this.getRangeAttackDivisor(attackerUnit, position));
        }

        // if (!isAttackBlocked && !affectedUnitIds.includes(targetUnit.getId())) {
        // affectedUnits.push(targetUnit);
        // }

        return {
            rangeAttackDivisors,
            affectedUnits,
            affectedCells,
            attackObstacle,
        };
    }

    private getCellsToPositions(positions: XY[]): Array<[XY, XY]> {
        const cells: Array<[XY, XY]> = [];
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

    private getIntersectedPositions(start: XY, end: XY): XY[] {
        const positions: XY[] = [];

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

    public getRangeAttackDivisor(attackerUnit: Unit, attackPosition: XY): number {
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
        allUnits: Map<string, Unit>,
        fromUnit: Unit,
        fromPosition: XY,
        toPosition: XY,
    ): IRangeAttackEvaluation {
        const intersectedCellsToPositions = this.getCellsToPositions(
            this.getIntersectedPositions(fromPosition, toPosition),
        );

        return this.getAffectedUnitsAndObstacles(allUnits, intersectedCellsToPositions, fromUnit);
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

    public canBeAttackedByMelee(unitPosition: XY, isSmallUnit: boolean, enemyAggrMatrix?: number[][]): boolean {
        let cells: XY[];
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
        drawer: Drawer,
        unitsHolder: UnitsHolder,
        grid: Grid,
        moveHandler: MoveHandler,
        currentActiveSpell?: Spell,
        attackerUnit?: Unit,
        targetUnit?: Unit,
        currentEnemiesCellsWithinMovementRange?: XY[],
    ): boolean {
        if (!currentActiveSpell || !attackerUnit) {
            return false;
        }

        if (
            targetUnit &&
            SpellHelper.canCastSpell(
                false,
                this.gridSettings,
                gridMatrix,
                targetUnit.getBuffs(),
                currentActiveSpell,
                attackerUnit.getSpells(),
                targetUnit.getSpells(),
                targetUnit.getBaseCell(),
                attackerUnit.getId(),
                targetUnit.getId(),
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
            let clarifyingStr = `for ${getLapString(laps)}`;
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

                const absorptionTarget = getAbsorptionTarget(debuffTarget, grid, unitsHolder);
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
                        const attackerBody = unitsHolder.getUnitBody(attackerUnit.getId());
                        const targetBody = unitsHolder.getUnitBody(debuffTarget.getId());
                        const attackerBaseCell = attackerUnit.getBaseCell();
                        const debuffTargetBaseCell = debuffTarget.getBaseCell();
                        if (attackerBody && targetBody && attackerBaseCell && debuffTargetBaseCell) {
                            const initialAttackerCell = structuredClone(attackerBaseCell);
                            const initialTargetUnitCell = structuredClone(debuffTargetBaseCell);

                            const flyAttackerStarted = moveHandler.startFlying(
                                structuredClone(debuffTarget.getPosition()),
                                drawer,
                                attackerBody,
                            );
                            const flyTargetStarted = moveHandler.startFlying(
                                structuredClone(attackerUnit.getPosition()),
                                drawer,
                                targetBody,
                            );

                            if (flyAttackerStarted && flyTargetStarted) {
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
                            }
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
                    isMirrored(debuffTarget) &&
                    !hasAlreadyAppliedSpell(debuffTarget, currentActiveSpell) &&
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
                    mirroredStr = `${debuffTarget.getName()} mirrored ${currentActiveSpell.getName()} to ${attackerUnit.getName()} for ${getLapString(
                        laps,
                    )}`;
                }
            }

            if (currentActiveSpell.isSelfDebuffApplicable()) {
                // effect can be absorbed
                let debuffTarget = attackerUnit;
                const absorptionTarget = getAbsorptionTarget(debuffTarget, grid, unitsHolder);
                if (absorptionTarget) {
                    debuffTarget = absorptionTarget;
                }

                if (
                    !hasAlreadyAppliedSpell(debuffTarget, currentActiveSpell) &&
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

            return true;
        }

        return false;
    }

    public handleRangeAttack(
        unitsHolder: UnitsHolder,
        drawer: Drawer,
        grid: Grid,
        hoverRangeAttackDivisors: number[],
        rangeResponseAttackDivisor: number,
        sceneStepCount: number,
        attackerUnit?: Unit,
        targetUnits?: Array<Unit[]>,
        rangeResponseUnits?: Unit[],
        hoverRangeAttackPosition?: XY,
        isAOE = false,
    ): boolean {
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
            return false;
        }

        if (!targetUnits) {
            if (isAOE) {
                this.sceneLog.updateLog(`${attackerUnit.getName()} miss aoe`);
            }
            return isAOE;
        }

        if (targetUnits.length !== hoverRangeAttackDivisors.length) {
            return false;
        }

        let targetUnitUndex = 0;
        const affectedUnits = targetUnits.at(targetUnitUndex);
        if (!affectedUnits?.length) {
            return false;
        }

        let targetUnit = affectedUnits[0];

        if (!targetUnit && isAOE) {
            this.sceneLog.updateLog(`${attackerUnit.getName()} miss aoe`);
            return true;
        }

        // check if unit is forced to attack certain enemy only
        const forcedTargetUnitId = attackerUnit.getTarget();
        if (targetUnit && forcedTargetUnitId && forcedTargetUnitId !== targetUnit.getId()) {
            return false;
        }

        const throughShotLanded = processThroughShotAbility(
            attackerUnit,
            targetUnits,
            attackerUnit,
            hoverRangeAttackDivisors,
            hoverRangeAttackPosition,
            unitsHolder,
            grid,
            drawer,
            sceneStepCount,
            this.sceneLog,
        );
        if (throughShotLanded) {
            return true;
        }

        if (
            !isAOE &&
            (!targetUnit ||
                (targetUnit.getTeam() === attackerUnit.getTeam() && !isAOE) ||
                targetUnit.isDead() ||
                (attackerUnit.hasDebuffActive("Cowardice") &&
                    attackerUnit.getCumulativeHp() < targetUnit.getCumulativeHp()))
        ) {
            return false;
        }

        let hoverRangeAttackDivisor: number | undefined = hoverRangeAttackDivisors.at(targetUnitUndex);
        if (!hoverRangeAttackDivisor) {
            return false;
        }

        targetUnitUndex++;

        drawer.startBulletAnimation(attackerUnit.getPosition(), hoverRangeAttackPosition, targetUnit);

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
            drawer.startBulletAnimation(targetUnit.getPosition(), attackerUnit.getPosition(), rangeResponseUnit);
        } else {
            rangeResponseUnit = undefined;
        }

        // handle attack damage
        let aoeRangeAttackResult = processRangeAOEAbility(
            attackerUnit,
            affectedUnits,
            attackerUnit,
            hoverRangeAttackDivisor,
            sceneStepCount,
            unitsHolder,
            grid,
            this.sceneLog,
            true,
        );
        let attackDamageApplied = true;
        if (aoeRangeAttackResult.landed) {
            damageFromAttack = processLuckyStrikeAbility(attackerUnit, aoeRangeAttackResult.maxDamage, this.sceneLog);
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
                sceneStepCount,
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

                rangeResponseUnit.applyDamage(damageFromResponse, sceneStepCount);
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
        if (targetUnit.isDead()) {
            switchTargetUnit = true;
        }
        if (!aoeRangeAttackResult?.landed) {
            if (!attackDamageApplied) {
                targetUnit.applyDamage(damageFromAttack, sceneStepCount);
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
                this.sceneLog.updateLog(`${targetUnit.getName()} died`);
                unitsHolder.deleteUnitById(targetUnit.getId(), true);
                attackerUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
                unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
                attackerUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
            } else {
                processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processPetrifyingGazeAbility(attackerUnit, targetUnit, damageFromAttack, sceneStepCount, this.sceneLog);
                processSpitBallAbility(attackerUnit, targetUnit, attackerUnit, unitsHolder, grid, this.sceneLog);
            }
        }

        if (rangeResponseUnit) {
            if (aoeRangeResponseResult?.landed) {
                if (rangeResponseUnit.isDead() && attackerUnit.getId() === rangeResponseUnit.getId()) {
                    return true;
                }
            } else {
                if (rangeResponseUnit.isDead()) {
                    this.sceneLog.updateLog(`${rangeResponseUnit.getName()} died`);
                    unitsHolder.deleteUnitById(rangeResponseUnit.getId(), true);
                    unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(rangeResponseUnit);
                    if (!targetUnit.isDead()) {
                        targetUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
                        targetUnit.applyMoraleStepsModifier(
                            FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                        );
                    }

                    if (attackerUnit.getId() === rangeResponseUnit.getId()) {
                        return true;
                    }
                } else {
                    processStunAbility(targetUnit, rangeResponseUnit, attackerUnit, this.sceneLog);
                    processPetrifyingGazeAbility(
                        targetUnit,
                        attackerUnit,
                        damageFromResponse,
                        sceneStepCount,
                        this.sceneLog,
                    );
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

        if (switchTargetUnit) {
            const affectedUnits = targetUnits.at(targetUnitUndex);
            if (!affectedUnits?.length) {
                return true;
            }

            targetUnit = affectedUnits[0];

            if (
                !targetUnit ||
                targetUnit.getTeam() === attackerUnit.getTeam() ||
                targetUnit.isDead() ||
                (attackerUnit.hasDebuffActive("Cowardice") &&
                    attackerUnit.getCumulativeHp() < targetUnit.getCumulativeHp())
            ) {
                return true;
            }
            hoverRangeAttackDivisor = hoverRangeAttackDivisors.at(targetUnitUndex);
            if (!hoverRangeAttackDivisor) {
                return true;
            }
        }

        // second attack
        const secondShotResult = processDoubleShotAbility(
            attackerUnit,
            targetUnit,
            affectedUnits,
            this.sceneLog,
            drawer,
            unitsHolder,
            grid,
            hoverRangeAttackDivisor,
            hoverRangeAttackPosition,
            sceneStepCount,
            isAOE,
        );

        if (!secondShotResult.aoeRangeAttackLanded) {
            if (targetUnit.isDead()) {
                this.sceneLog.updateLog(`${targetUnit.getName()} died`);
                unitsHolder.deleteUnitById(targetUnit.getId(), true);
                attackerUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
                unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
                attackerUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
            } else if (secondShotResult.applied) {
                processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processPetrifyingGazeAbility(
                    attackerUnit,
                    targetUnit,
                    secondShotResult.damage,
                    sceneStepCount,
                    this.sceneLog,
                );
                processSpitBallAbility(attackerUnit, targetUnit, attackerUnit, unitsHolder, grid, this.sceneLog);
            }
        }

        return true;
    }

    public handleMeleeAttack(
        unitsHolder: UnitsHolder,
        drawer: Drawer,
        grid: Grid,
        moveHandler: MoveHandler,
        sceneStepCount: number,
        currentActiveKnownPaths?: Map<number, IWeightedRoute[]>,
        attackerUnit?: Unit,
        targetUnit?: Unit,
        attackerBody?: b2Body,
        attackFromCell?: XY,
    ): boolean {
        if (
            !attackerUnit ||
            attackerUnit.isDead() ||
            !targetUnit ||
            targetUnit.isDead() ||
            !attackFromCell ||
            !attackerBody ||
            attackerUnit.getAttackTypeSelection() !== AttackType.MELEE ||
            attackerUnit.hasAbilityActive("No Melee") ||
            attackerUnit.getTeam() === targetUnit.getTeam() ||
            (attackerUnit.hasDebuffActive("Cowardice") && attackerUnit.getCumulativeHp() < targetUnit.getCumulativeHp())
        ) {
            return false;
        }

        // check if unit is forced to attack certain enemy only
        const forcedTargetUnitId = attackerUnit.getTarget();
        if (forcedTargetUnitId && forcedTargetUnitId !== targetUnit.getId()) {
            return false;
        }

        const currentCell = GridMath.getCellForPosition(this.gridSettings, attackerUnit.getPosition());

        if (!currentCell) {
            return false;
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
            return false;
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

                const moveStarted =
                    stationaryAttack ||
                    moveHandler.startMoving(
                        attackFromCell,
                        drawer,
                        FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                        attackerBody,
                        currentActiveKnownPaths,
                    );
                if (!moveStarted) {
                    return false;
                }

                attackerUnit.setPosition(position.x, position.y, false);
                grid.occupyCell(
                    attackFromCell,
                    attackerUnit.getId(),
                    attackerUnit.getTeam(),
                    attackerUnit.getAttackRange(),
                );
            } else {
                return false;
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
                const moveStarted =
                    stationaryAttack ||
                    moveHandler.startMoving(
                        attackFromCell,
                        drawer,
                        FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                        attackerBody,
                        currentActiveKnownPaths,
                    );
                if (!moveStarted) {
                    return false;
                }

                attackerUnit.setPosition(
                    position.x - this.gridSettings.getHalfStep(),
                    position.y - this.gridSettings.getHalfStep(),
                    false,
                );

                grid.occupyCells(cells, attackerUnit.getId(), attackerUnit.getTeam(), attackerUnit.getAttackRange());
            } else {
                return false;
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
        const hasLightningSpinAttackLanded = processLightningSpinAbility(
            attackerUnit,
            this.sceneLog,
            unitsHolder,
            sceneStepCount,
            rapidChargeCellsNumber,
            attackFromCell,
            true,
        );

        processFireBreathAbility(
            attackerUnit,
            targetUnit,
            this.sceneLog,
            unitsHolder,
            sceneStepCount,
            grid,
            this.gridSettings,
            "attk",
            attackFromCell,
        );

        processSkewerStrikeAbility(
            attackerUnit,
            targetUnit,
            this.sceneLog,
            unitsHolder,
            sceneStepCount,
            grid,
            this.gridSettings,
            attackFromCell,
            true,
        );

        if (isAttackMissed) {
            this.sceneLog.updateLog(`${attackerUnit.getName()} misses attk ${targetUnit.getName()}`);
        } else if (!hasLightningSpinAttackLanded) {
            // just log attack here,
            // to make sure that logs are in chronological order
            this.sceneLog.updateLog(`${attackerUnit.getName()} attk ${targetUnit.getName()} (${damageFromAttack})`);

            processFireShieldAbility(
                targetUnit,
                attackerUnit,
                this.sceneLog,
                unitsHolder,
                damageFromAttack,
                sceneStepCount,
            );
        }

        let hasLightningSpinResponseLanded = false;

        // capture response
        if (
            !fightProperties.hasAlreadyRepliedAttack(targetUnit.getId()) &&
            targetUnit.canRespond(AttackType.MELEE) &&
            !attackerUnit.canSkipResponse() &&
            !targetUnit.hasAbilityActive("No Melee") &&
            !(
                targetUnit.hasDebuffActive("Cowardice") && targetUnit.getCumulativeHp() < attackerUnit.getCumulativeHp()
            ) &&
            (!targetUnit.getTarget() || targetUnit.getTarget() === attackerUnit.getId())
        ) {
            const isResponseMissed = HoCLib.getRandomInt(0, 100) < targetUnit.calculateMissChance(attackerUnit);

            processFireBreathAbility(
                targetUnit,
                attackerUnit,
                this.sceneLog,
                unitsHolder,
                sceneStepCount,
                grid,
                this.gridSettings,
                "resp",
                GridMath.getCellForPosition(this.gridSettings, targetUnit.getPosition()),
            );

            processSkewerStrikeAbility(
                targetUnit,
                attackerUnit,
                this.sceneLog,
                unitsHolder,
                sceneStepCount,
                grid,
                this.gridSettings,
                GridMath.getCellForPosition(this.gridSettings, targetUnit.getPosition()),
                false,
            );

            hasLightningSpinResponseLanded = processLightningSpinAbility(
                targetUnit,
                this.sceneLog,
                unitsHolder,
                sceneStepCount,
                1,
                attackFromCell,
                false,
            );

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

                attackerUnit.applyDamage(damageFromResponse, sceneStepCount);
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
                processFireShieldAbility(
                    attackerUnit,
                    targetUnit,
                    this.sceneLog,
                    unitsHolder,
                    damageFromResponse,
                    sceneStepCount,
                );
                processStunAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                processPetrifyingGazeAbility(
                    targetUnit,
                    attackerUnit,
                    damageFromResponse,
                    sceneStepCount,
                    this.sceneLog,
                );
                processBoarSalivaAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                processAggrAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                processDeepWoundsAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                processPegasusLightAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                processParalysisAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                processBlindnessAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
            }
            processOneInTheFieldAbility(targetUnit);
        }

        if (!hasLightningSpinAttackLanded && !isAttackMissed) {
            // this code has to be here to make sure that respond damage has been applied as well
            targetUnit.applyDamage(damageFromAttack, sceneStepCount);
            DamageStatisticHolder.getInstance().add({
                unitName: attackerUnit.getName(),
                damage: damageFromAttack,
                team: attackerUnit.getTeam(),
            });

            processMinerAbility(attackerUnit, targetUnit, this.sceneLog);
            processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processPetrifyingGazeAbility(attackerUnit, targetUnit, damageFromAttack, sceneStepCount, this.sceneLog);
            processBoarSalivaAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processAggrAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processDeepWoundsAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processPegasusLightAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processParalysisAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processShatterArmorAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            const pegasusLightEffect = targetUnit.getEffect("Pegasus Light");
            if (pegasusLightEffect) {
                attackerUnit.increaseMorale(pegasusLightEffect.getPower());
            }
            // ~ already responded here
        }

        const secondPunchResult = processDoublePunchAbility(
            attackerUnit,
            targetUnit,
            this.sceneLog,
            unitsHolder,
            sceneStepCount,
        );

        if (!hasLightningSpinResponseLanded && attackerUnit.isDead()) {
            this.sceneLog.updateLog(`${attackerUnit.getName()} died`);

            unitsHolder.deleteUnitById(attackerUnit.getId(), true);
            targetUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
            targetUnit.applyMoraleStepsModifier(
                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
            );
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(attackerUnit);
        }

        if (!hasLightningSpinAttackLanded && targetUnit.isDead()) {
            this.sceneLog.updateLog(`${targetUnit.getName()} died`);

            unitsHolder.deleteUnitById(targetUnit.getId(), true);
            attackerUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
            attackerUnit.applyMoraleStepsModifier(
                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
            );
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
        } else if (secondPunchResult.applied) {
            processMinerAbility(attackerUnit, targetUnit, this.sceneLog);
            processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processPetrifyingGazeAbility(
                attackerUnit,
                targetUnit,
                secondPunchResult.damage,
                sceneStepCount,
                this.sceneLog,
            );
            processBoarSalivaAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processAggrAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processDeepWoundsAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processPegasusLightAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processParalysisAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processShatterArmorAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
        }

        return true;
    }
}
