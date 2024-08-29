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
import { AttackType, HoCLib, HoCMath, GridMath, GridSettings, Grid, HoCConstants } from "@heroesofcrypto/common";

import { getAbilitiesWithPosisionCoefficient } from "../abilities/abilities";
import { processDoublePunchAbility } from "../abilities/double_punch_ability";
import { processDoubleShotAbility } from "../abilities/double_shot_ability";
import { processFireBreathAbility } from "../abilities/fire_breath_ability";
import { processFireShieldAbility } from "../abilities/fire_shield_ability";
import { processLightningSpinAbility } from "../abilities/lightning_spin_ability";
import { processOneInTheFieldAbility } from "../abilities/one_in_the_field_ability";
import { processStunAbility } from "../abilities/stun_ability";
import { Drawer } from "../draw/drawer";
import { SceneLog } from "../menu/scene_log";
import { IWeightedRoute } from "../path/path_helper";
import { canBeCasted, Spell } from "../spells/spells";
import { FightStateManager } from "../state/fight_state_manager";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { MoveHandler } from "./move_handler";
import { processBlindnessAbility } from "../abilities/blindness_ability";
import { processBoarSalivaAbility } from "../abilities/boar_saliva_ability";
import { processSpitBallAbility } from "../abilities/spit_ball_ability";
import { processPetrifyingGazeAbility } from "../abilities/petrifying_gaze_ability";
import { SpellsFactory } from "../spells/spells_factory";
import { getAbsorptionTarget } from "../effects/effects_helper";
import { getLapString } from "../utils/strings";
import { alreadyApplied, isMirrored } from "../spells/spells_helper";
import { IAOERangeAttackResult, processRangeAOEAbility } from "../abilities/aoe_range_ability";

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

    public readonly spellsFactory: SpellsFactory;

    public constructor(gridSettings: GridSettings, grid: Grid, spellsFactory: SpellsFactory, sceneLog: SceneLog) {
        this.gridSettings = gridSettings;
        this.grid = grid;
        this.spellsFactory = spellsFactory;
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

    public canBeAttackedByMelee(unitPosition: XY, isSmallUnit: boolean, aggrMatrix?: number[][]): boolean {
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
            if (aggrMatrix && aggrMatrix[cell.x][cell.y] > 1) {
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
    ): boolean {
        if (!currentActiveSpell || !attackerUnit) {
            return false;
        }

        if (
            targetUnit &&
            canBeCasted(
                false,
                this.gridSettings,
                gridMatrix,
                targetUnit.getBuffs(),
                currentActiveSpell,
                attackerUnit.getSpells(),
                undefined,
                attackerUnit.getId(),
                targetUnit.getId(),
                attackerUnit.getTeam(),
                targetUnit.getTeam(),
                attackerUnit.getName(),
                targetUnit.getName(),
                attackerUnit.getStackPower(),
                targetUnit.getMagicResist(),
            )
        ) {
            let applied = true;
            let mirroredStr = "";
            if (currentActiveSpell.isBuff()) {
                targetUnit.applyBuff(
                    currentActiveSpell,
                    attackerUnit.getAllProperties().max_hp,
                    attackerUnit.getAllProperties().base_armor,
                    attackerUnit.getId() === targetUnit.getId(),
                );
            } else if (HoCLib.getRandomInt(0, 100) < Math.floor(targetUnit.getMagicResist())) {
                applied = false;
            } else {
                // effect can be absorbed
                let debuffTarget = targetUnit;
                const absorptionTarget = getAbsorptionTarget(debuffTarget, grid, unitsHolder);
                if (absorptionTarget) {
                    debuffTarget = absorptionTarget;
                }

                const laps = currentActiveSpell.getLapsTotal();

                debuffTarget.applyDebuff(
                    currentActiveSpell,
                    undefined,
                    undefined,
                    attackerUnit.getId() === targetUnit.getId(),
                );

                if (isMirrored(debuffTarget) && !alreadyApplied(debuffTarget, currentActiveSpell)) {
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

                if (!alreadyApplied(debuffTarget, currentActiveSpell)) {
                    debuffTarget.applyDebuff(
                        currentActiveSpell,
                        attackerUnit.getAllProperties().max_hp,
                        attackerUnit.getAllProperties().base_armor,
                        true,
                    );
                }
            }
            const laps = currentActiveSpell.getLapsTotal();
            attackerUnit.useSpell(currentActiveSpell);
            let newText = `${attackerUnit.getName()} cast ${currentActiveSpell.getName()}`;
            if (attackerUnit.getId() === targetUnit.getId()) {
                newText += ` on themselves for ${getLapString(laps)}`;
            } else {
                newText += ` on ${targetUnit.getName()} for ${getLapString(laps)}`;
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
        const rangeResponseUnit = rangeResponseUnits?.length ? rangeResponseUnits[0] : undefined;

        // response starts here
        let damageFromRespond = 0;
        let isResponseMissed = false;
        if (
            rangeResponseUnit &&
            !attackerUnit.canSkipResponse() &&
            !fightProperties.hasAlreadyRepliedAttack(targetUnit.getId()) &&
            targetUnit.canRespond() &&
            this.canLandRangeAttack(targetUnit, grid.getEnemyAggrMatrixByUnitId(targetUnit.getId())) &&
            !(
                targetUnit.hasDebuffActive("Cowardice") &&
                targetUnit.getCumulativeHp() < rangeResponseUnit.getCumulativeHp()
            )
        ) {
            isResponseMissed = HoCLib.getRandomInt(0, 100) < targetUnit.calculateMissChance(rangeResponseUnit);
            drawer.startBulletAnimation(targetUnit.getPosition(), attackerUnit.getPosition(), rangeResponseUnit);
        }

        // handle attack damage
        let largeCaliberAttackResult: IAOERangeAttackResult | undefined = undefined;
        if (isAttackMissed) {
            this.sceneLog.updateLog(`${attackerUnit.getName()} misses attk ${targetUnit.getName()}`);
        } else {
            largeCaliberAttackResult = processRangeAOEAbility(
                attackerUnit,
                affectedUnits,
                attackerUnit,
                hoverRangeAttackDivisor,
                sceneStepCount,
                this.spellsFactory,
                unitsHolder,
                grid,
                this.sceneLog,
                true,
            );
            if (largeCaliberAttackResult.landed) {
                damageFromAttack = largeCaliberAttackResult.maxDamage;
            } else {
                damageFromAttack = attackerUnit.calculateAttackDamage(
                    targetUnit,
                    AttackType.RANGE,
                    hoverRangeAttackDivisor,
                );
                this.sceneLog.updateLog(`${attackerUnit.getName()} attk ${targetUnit.getName()} (${damageFromAttack})`);
                targetUnit.applyDamage(damageFromAttack, sceneStepCount);
                DamageStatisticHolder.getInstance().add({
                    unitName: attackerUnit.getName(),
                    damage: damageFromAttack,
                    team: attackerUnit.getTeam(),
                });
            }
        }

        // handle response damage
        let largeCaliberResponseResult: IAOERangeAttackResult | undefined = undefined;
        if (rangeResponseUnit && rangeResponseUnits) {
            if (isResponseMissed) {
                this.sceneLog.updateLog(`${targetUnit.getName()} misses resp ${rangeResponseUnit.getName()}`);
            } else {
                largeCaliberResponseResult = processRangeAOEAbility(
                    targetUnit,
                    rangeResponseUnits,
                    targetUnit,
                    rangeResponseAttackDivisor,
                    sceneStepCount,
                    this.spellsFactory,
                    unitsHolder,
                    grid,
                    this.sceneLog,
                    false,
                );
                if (largeCaliberResponseResult.landed) {
                    damageFromRespond = largeCaliberResponseResult.maxDamage;
                } else {
                    damageFromRespond = targetUnit.calculateAttackDamage(
                        rangeResponseUnit,
                        AttackType.RANGE,
                        rangeResponseAttackDivisor,
                    );

                    this.sceneLog.updateLog(
                        `${targetUnit.getName()} resp ${rangeResponseUnit.getName()} (${damageFromRespond})`,
                    );

                    rangeResponseUnit.applyDamage(damageFromRespond, sceneStepCount);
                    DamageStatisticHolder.getInstance().add({
                        unitName: targetUnit.getName(),
                        damage: damageFromRespond,
                        team: targetUnit.getTeam(),
                    });
                }
            }

            processOneInTheFieldAbility(targetUnit);
        }

        let switchTargetUnit = false;
        if (targetUnit.isDead()) {
            switchTargetUnit = true;
        }
        if (!largeCaliberAttackResult?.landed) {
            if (targetUnit.isDead()) {
                this.sceneLog.updateLog(`${targetUnit.getName()} died`);
                unitsHolder.deleteUnitById(grid, targetUnit.getId());
                attackerUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
                unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
                attackerUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
            } else {
                processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processPetrifyingGazeAbility(attackerUnit, targetUnit, damageFromAttack, sceneStepCount, this.sceneLog);
                processSpitBallAbility(
                    attackerUnit,
                    targetUnit,
                    attackerUnit,
                    this.spellsFactory,
                    unitsHolder,
                    grid,
                    this.sceneLog,
                );
            }
        }

        if (rangeResponseUnit) {
            if (largeCaliberResponseResult?.landed) {
                if (rangeResponseUnit.isDead() && attackerUnit.getId() === rangeResponseUnit.getId()) {
                    return true;
                }
            } else {
                if (rangeResponseUnit.isDead()) {
                    this.sceneLog.updateLog(`${rangeResponseUnit.getName()} died`);
                    unitsHolder.deleteUnitById(grid, rangeResponseUnit.getId());
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
                        damageFromRespond,
                        sceneStepCount,
                        this.sceneLog,
                    );
                    processSpitBallAbility(
                        targetUnit,
                        rangeResponseUnit,
                        attackerUnit,
                        this.spellsFactory,
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
            this.spellsFactory,
            grid,
            hoverRangeAttackDivisor,
            hoverRangeAttackPosition,
            sceneStepCount,
        );

        if (!secondShotResult.largeCaliberLanded) {
            if (targetUnit.isDead()) {
                this.sceneLog.updateLog(`${targetUnit.getName()} died`);
                unitsHolder.deleteUnitById(grid, targetUnit.getId());
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
                processSpitBallAbility(
                    attackerUnit,
                    targetUnit,
                    attackerUnit,
                    this.spellsFactory,
                    unitsHolder,
                    grid,
                    this.sceneLog,
                );
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
        currentActiveSpell?: Spell,
        attackerUnit?: Unit,
        targetUnit?: Unit,
        attackerBody?: b2Body,
        attackFromCell?: XY,
    ): boolean {
        if (
            currentActiveSpell ||
            !attackerUnit ||
            attackerUnit.isDead() ||
            !targetUnit ||
            targetUnit.isDead() ||
            !attackFromCell ||
            !attackerBody ||
            !currentActiveKnownPaths ||
            attackerUnit.getAttackTypeSelection() !== AttackType.MELEE ||
            attackerUnit.hasAbilityActive("No Melee") ||
            attackerUnit.getTeam() === targetUnit.getTeam() ||
            (attackerUnit.hasDebuffActive("Cowardice") && attackerUnit.getCumulativeHp() < targetUnit.getCumulativeHp())
        ) {
            return false;
        }

        const currentCell = GridMath.getCellForPosition(this.gridSettings, attackerUnit.getPosition());

        if (!currentCell) {
            return false;
        }

        const stationaryAttack = currentCell.x === attackFromCell.x && currentCell.y === attackFromCell.y;
        if (attackerUnit.isSmallSize()) {
            if (
                grid.areAllCellsEmpty([attackFromCell], attackerUnit.getId()) &&
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

                const position = GridMath.getPositionForCell(
                    attackFromCell,
                    this.gridSettings.getMinX(),
                    this.gridSettings.getStep(),
                    this.gridSettings.getHalfStep(),
                );
                attackerUnit.setPosition(position.x, position.y);
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
                );

                grid.occupyCells(cells, attackerUnit.getId(), attackerUnit.getTeam(), attackerUnit.getAttackRange());
            } else {
                return false;
            }
        }

        let abilityMultiplier = 1;
        const abilitiesWithPositionCoeff = getAbilitiesWithPosisionCoefficient(
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

        const isAttackMissed = HoCLib.getRandomInt(0, 100) < attackerUnit.calculateMissChance(targetUnit);
        const damageFromAttack = attackerUnit.calculateAttackDamage(targetUnit, AttackType.MELEE, 1, abilityMultiplier);

        const fightProperties = FightStateManager.getInstance().getFightProperties();
        const hasLightningSpinAttackLanded = processLightningSpinAbility(
            attackerUnit,
            this.sceneLog,
            unitsHolder,
            sceneStepCount,
            grid,
            this.gridSettings,
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
            targetUnit.canRespond() &&
            !attackerUnit.canSkipResponse() &&
            !targetUnit.hasAbilityActive("No Melee") &&
            !(targetUnit.hasDebuffActive("Cowardice") && targetUnit.getCumulativeHp() < attackerUnit.getCumulativeHp())
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

            hasLightningSpinResponseLanded = processLightningSpinAbility(
                targetUnit,
                this.sceneLog,
                unitsHolder,
                sceneStepCount,
                grid,
                this.gridSettings,
                attackFromCell,
                false,
            );

            if (isResponseMissed) {
                this.sceneLog.updateLog(`${targetUnit.getName()} misses resp ${attackerUnit.getName()}`);
            } else if (!hasLightningSpinResponseLanded) {
                abilityMultiplier = 1;
                const abilitiesWithPositionCoeffResp = getAbilitiesWithPosisionCoefficient(
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
                const damageFromRespond = targetUnit.calculateAttackDamage(
                    attackerUnit,
                    AttackType.MELEE,
                    1,
                    abilityMultiplier,
                );

                this.sceneLog.updateLog(
                    `${targetUnit.getName()} resp ${attackerUnit.getName()} (${damageFromRespond})`,
                );

                attackerUnit.applyDamage(damageFromRespond, sceneStepCount);
                DamageStatisticHolder.getInstance().add({
                    unitName: targetUnit.getName(),
                    damage: damageFromRespond,
                    team: targetUnit.getTeam(),
                });

                processFireShieldAbility(
                    attackerUnit,
                    targetUnit,
                    this.sceneLog,
                    unitsHolder,
                    damageFromRespond,
                    sceneStepCount,
                );

                processStunAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                processPetrifyingGazeAbility(
                    targetUnit,
                    attackerUnit,
                    damageFromRespond,
                    sceneStepCount,
                    this.sceneLog,
                );
                processBoarSalivaAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                processBlindnessAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
            }
            processOneInTheFieldAbility(targetUnit);
        }

        if (!hasLightningSpinAttackLanded && !isAttackMissed) {
            // check for the stun here
            processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processPetrifyingGazeAbility(attackerUnit, targetUnit, damageFromAttack, sceneStepCount, this.sceneLog);
            processBoarSalivaAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);

            // this code has to be here to make sure that respond damage has been applied as well
            targetUnit.applyDamage(damageFromAttack, sceneStepCount);
            DamageStatisticHolder.getInstance().add({
                unitName: attackerUnit.getName(),
                damage: damageFromAttack,
                team: attackerUnit.getTeam(),
            });
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

            unitsHolder.deleteUnitById(grid, attackerUnit.getId());
            targetUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
            targetUnit.applyMoraleStepsModifier(
                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
            );
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(attackerUnit);
        }

        if (!hasLightningSpinAttackLanded && targetUnit.isDead()) {
            this.sceneLog.updateLog(`${targetUnit.getName()} died`);

            unitsHolder.deleteUnitById(grid, targetUnit.getId());
            attackerUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
            attackerUnit.applyMoraleStepsModifier(
                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
            );
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
        } else if (secondPunchResult.applied) {
            processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processPetrifyingGazeAbility(
                attackerUnit,
                targetUnit,
                secondPunchResult.damage,
                sceneStepCount,
                this.sceneLog,
            );
            processBoarSalivaAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
        }

        return true;
    }
}
