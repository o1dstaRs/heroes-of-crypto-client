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

import { b2Body, b2Fixture, b2TestOverlap, b2Vec2, b2World, XY } from "@box2d/core";
import { AttackType, HoCConstants, UnitProperties, GridMath, GridSettings, Grid } from "@heroesofcrypto/common";

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
import { MORALE_CHANGE_FOR_KILL } from "../statics";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { IUnitDistance, Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";
import { MoveHandler } from "./move_handler";
import { processBlindnessAbility } from "../abilities/blindness_ability";

export interface IRangeAttackEvaluation {
    rangeAttackDivisor: number;
    targetUnits: Unit[];
    attackObstacle?: IAttackObstacle;
}

export interface IAttackObstacle {
    position: XY;
    size: number;
    distance: number;
}

export class AttackHandler {
    public readonly world: b2World;

    public readonly gridSettings: GridSettings;

    public readonly sceneLog: SceneLog;

    public constructor(world: b2World, gridSettings: GridSettings, sceneLog: SceneLog) {
        this.world = world;
        this.gridSettings = gridSettings;
        this.sceneLog = sceneLog;
    }

    public evaluateRangeAttack(
        allUnits: Map<string, Unit>,
        hoverRangeAttackLine: b2Fixture,
        fromUnit: Unit,
        toUnit: Unit,
    ): IRangeAttackEvaluation {
        const unitIdsAffected: string[] = [];
        // store units in array sorted by distance
        // just to make sure we can process multiple shots in the future
        const targetUnits: Unit[] = [];
        let attackObstacle: IAttackObstacle | undefined;
        let closestBlockDistance = Number.MAX_SAFE_INTEGER;

        this.world.QueryAABB(hoverRangeAttackLine.GetAABB(0), (fixture: b2Fixture): boolean => {
            const body = fixture.GetBody();
            if (hoverRangeAttackLine) {
                const overlap = b2TestOverlap(
                    fixture.GetShape(),
                    0,
                    hoverRangeAttackLine.GetShape(),
                    0,
                    body.GetTransform(),
                    hoverRangeAttackLine.GetBody().GetTransform(),
                );

                if (overlap) {
                    const userData = body.GetUserData();
                    if (userData?.id && userData?.size) {
                        if (userData.id === "BLOCK") {
                            const currentDistance = b2Vec2.Distance(fromUnit.getPosition(), body.GetPosition());
                            if (currentDistance < closestBlockDistance) {
                                closestBlockDistance = currentDistance;
                                attackObstacle = {
                                    position: body.GetPosition(),
                                    size: userData.size,
                                    distance: closestBlockDistance,
                                };
                            }
                        } else {
                            const unitData = body.GetUserData() as UnitProperties;
                            if (unitData.id !== fromUnit.getId() && !unitIdsAffected.includes(unitData.id)) {
                                unitIdsAffected.push(unitData.id);
                            }
                        }
                    }
                }
            }
            return true;
        });

        const unitsSortedByDistance: IUnitDistance[] = new Array(unitIdsAffected.length + 1);
        let idx = 0;
        for (const uId of unitIdsAffected) {
            const unitAffected = allUnits.get(uId);
            if (!unitAffected) {
                continue;
            }

            unitsSortedByDistance[idx++] = {
                unit: unitAffected,
                distance: b2Vec2.Distance(fromUnit.getPosition(), unitAffected.getPosition()),
            };
        }

        unitsSortedByDistance[idx] = {
            unit: toUnit,
            distance: b2Vec2.Distance(fromUnit.getPosition(), toUnit.getPosition()),
        };

        unitsSortedByDistance.sort((a: IUnitDistance, b: IUnitDistance) => {
            if (a.distance < b.distance) {
                return -1;
            }
            if (a.distance > b.distance) {
                return 1;
            }
            return 0;
        });

        let rangeAttackDivisor = 1;
        const shotDistancePixels = Math.ceil(fromUnit.getRangeShotDistance() * this.gridSettings.getStep());

        for (const ud of unitsSortedByDistance) {
            if (ud.distance >= closestBlockDistance) {
                break;
            }

            if (ud.unit.getTeam() === fromUnit.getTeam()) {
                if (HoCConstants.PENALTY_ON_RANGE_SHOT_THROUGH_TEAMMATES) {
                    rangeAttackDivisor *= 2;
                }
            } else {
                while (ud.distance >= shotDistancePixels) {
                    ud.distance -= shotDistancePixels;
                    rangeAttackDivisor *= 2;
                }
                targetUnits.push(ud.unit);
                attackObstacle = undefined;
            }
        }
        if (rangeAttackDivisor > 8) {
            rangeAttackDivisor = 8;
        }

        if (fromUnit.hasAbilityActive("Sniper")) {
            rangeAttackDivisor = 1;
        }

        return {
            rangeAttackDivisor,
            targetUnits,
            attackObstacle,
        };
    }

    public canLandRangeAttack(unit: Unit, aggrMatrix?: number[][]): boolean {
        return (
            unit.getAttackType() === AttackType.RANGE &&
            !this.canBeAttackedByMelee(unit.getPosition(), unit.isSmallSize(), aggrMatrix) &&
            unit.getRangeShots() > 0 &&
            !unit.hasDebuffActive("Range Null Field Aura")
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
                targetUnit.getMagicResist(),
            )
        ) {
            targetUnit.applyBuff(
                currentActiveSpell,
                attackerUnit.getAllProperties().max_hp,
                attackerUnit.getAllProperties().base_armor,
            );
            if (currentActiveSpell.isSelfDebuffApplicable()) {
                attackerUnit.applyDebuff(
                    currentActiveSpell,
                    attackerUnit.getAllProperties().max_hp,
                    attackerUnit.getAllProperties().base_armor,
                    true,
                );
            }
            attackerUnit.useSpell(currentActiveSpell);
            let newText = `${attackerUnit.getName()} cast ${currentActiveSpell.getName()}`;
            if (attackerUnit.getId() === targetUnit.getId()) {
                newText += " on themselves";
            } else {
                newText += ` on ${targetUnit.getName()}`;
            }
            this.sceneLog.updateLog(newText);

            return true;
        }

        return false;
    }

    public handleRangeAttack(
        unitsHolder: UnitsHolder,
        drawer: Drawer,
        grid: Grid,
        hoverRangeAttackDivisor: number,
        rangeResponseAttackDivisor: number,
        sceneStepCount: number,
        attackerUnit?: Unit,
        targetUnits?: Unit[],
        rangeResponseUnit?: Unit,
        hoverRangeAttackPosition?: XY,
    ): boolean {
        if (
            !attackerUnit ||
            !targetUnits?.length ||
            !hoverRangeAttackPosition ||
            attackerUnit.getAttackTypeSelection() !== AttackType.RANGE ||
            !this.canLandRangeAttack(attackerUnit, grid.getEnemyAggrMatrixByUnitId(attackerUnit.getId()))
        ) {
            return false;
        }

        let targetUnit: Unit | undefined = targetUnits.shift();
        if (!targetUnit) {
            return false;
        }

        drawer.startBulletAnimation(attackerUnit.getPosition(), hoverRangeAttackPosition, targetUnit);

        // let abilityMultiplier = currentActiveUnit.calculateAbilityMultiplier();
        const damageFromAttack = attackerUnit.calculateAttackDamage(
            targetUnit,
            AttackType.RANGE,
            hoverRangeAttackDivisor,
            // abilityMultiplier,
        );

        const fightState = FightStateManager.getInstance().getFightState();

        // response starts here
        if (
            rangeResponseUnit &&
            !attackerUnit.canSkipResponse() &&
            !fightState.alreadyRepliedAttack.has(targetUnit.getId()) &&
            targetUnit.canRespond() &&
            this.canLandRangeAttack(targetUnit, grid.getEnemyAggrMatrixByUnitId(targetUnit.getId()))
        ) {
            drawer.startBulletAnimation(targetUnit.getPosition(), attackerUnit.getPosition(), rangeResponseUnit);
            const damageFromRespond = targetUnit.calculateAttackDamage(
                rangeResponseUnit,
                AttackType.RANGE,
                rangeResponseAttackDivisor,
            );

            this.sceneLog.updateLog(`${attackerUnit.getName()} attk ${targetUnit.getName()} (${damageFromAttack})`);

            if (damageFromRespond) {
                this.sceneLog.updateLog(
                    `${targetUnit.getName()} resp ${rangeResponseUnit.getName()} (${damageFromRespond})`,
                );
            }

            rangeResponseUnit.applyDamage(damageFromRespond, sceneStepCount);
            DamageStatisticHolder.getInstance().add({
                unitName: targetUnit.getName(),
                damage: damageFromRespond,
                team: targetUnit.getTeam(),
            });

            processStunAbility(targetUnit, rangeResponseUnit, attackerUnit, this.sceneLog);
            processOneInTheFieldAbility(targetUnit);
        } else {
            this.sceneLog.updateLog(`${attackerUnit.getName()} attk ${targetUnit.getName()} (${damageFromAttack})`);
        }

        targetUnit.applyDamage(damageFromAttack, sceneStepCount);
        DamageStatisticHolder.getInstance().add({
            unitName: attackerUnit.getName(),
            damage: damageFromAttack,
            team: attackerUnit.getTeam(),
        });

        let switchTargetUnit = false;
        if (targetUnit.isDead()) {
            this.sceneLog.updateLog(`${targetUnit.getName()} died`);
            unitsHolder.deleteUnitById(grid, targetUnit.getId());
            attackerUnit.increaseMorale(MORALE_CHANGE_FOR_KILL);
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
            attackerUnit.applyMoraleStepsModifier(FightStateManager.getInstance().getStepsMoraleMultiplier());
            switchTargetUnit = true;
        } else {
            processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
        }

        if (rangeResponseUnit?.isDead()) {
            this.sceneLog.updateLog(`${rangeResponseUnit.getName()} died`);
            unitsHolder.deleteUnitById(grid, rangeResponseUnit.getId());
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(rangeResponseUnit);
            if (!switchTargetUnit) {
                targetUnit.increaseMorale(MORALE_CHANGE_FOR_KILL);
                targetUnit.applyMoraleStepsModifier(FightStateManager.getInstance().getStepsMoraleMultiplier());
            }

            if (rangeResponseUnit && attackerUnit.getId() === rangeResponseUnit.getId()) {
                return true;
            }
        }

        if (switchTargetUnit) {
            targetUnit = targetUnits.shift();
            if (!targetUnit) {
                return true;
            }
        }

        // second attack
        const secondShotLanded = processDoubleShotAbility(
            attackerUnit,
            targetUnit,
            this.sceneLog,
            drawer,
            unitsHolder,
            hoverRangeAttackDivisor,
            hoverRangeAttackPosition,
            sceneStepCount,
        );

        if (targetUnit.isDead()) {
            this.sceneLog.updateLog(`${targetUnit.getName()} died`);
            unitsHolder.deleteUnitById(grid, targetUnit.getId());
            attackerUnit.increaseMorale(MORALE_CHANGE_FOR_KILL);
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
            attackerUnit.applyMoraleStepsModifier(FightStateManager.getInstance().getStepsMoraleMultiplier());
        } else if (secondShotLanded) {
            processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processBlindnessAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
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
            !targetUnit ||
            !attackFromCell ||
            !attackerBody ||
            !currentActiveKnownPaths ||
            attackerUnit.getAttackTypeSelection() !== AttackType.MELEE ||
            attackerUnit.hasAbilityActive("No Melee")
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
                        FightStateManager.getInstance().getStepsMoraleMultiplier(),
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
                        FightStateManager.getInstance().getStepsMoraleMultiplier(),
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

            console.log(`abilityMultiplier: ${abilityMultiplier}`);
        }

        const damageFromAttack = attackerUnit.calculateAttackDamage(targetUnit, AttackType.MELEE, 1, abilityMultiplier);

        const fightState = FightStateManager.getInstance().getFightState();
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

        if (!hasLightningSpinAttackLanded) {
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
            !fightState.alreadyRepliedAttack.has(targetUnit.getId()) &&
            targetUnit.canRespond() &&
            !attackerUnit.canSkipResponse() &&
            !targetUnit.hasAbilityActive("No Melee")
        ) {
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

            if (!hasLightningSpinResponseLanded) {
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

                    console.log(`response abilityMultiplier: ${abilityMultiplier}`);
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
                processBlindnessAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                processOneInTheFieldAbility(targetUnit);
            }
        }

        if (!hasLightningSpinAttackLanded) {
            // check for the stun here
            processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);

            // this code has to be here to make sure that respond damage has been applied as well
            targetUnit.applyDamage(damageFromAttack, sceneStepCount);
            DamageStatisticHolder.getInstance().add({
                unitName: attackerUnit.getName(),
                damage: damageFromAttack,
                team: attackerUnit.getTeam(),
            });
            // ~ already responded here
        }

        const secondPunchLanded = processDoublePunchAbility(
            attackerUnit,
            targetUnit,
            this.sceneLog,
            unitsHolder,
            sceneStepCount,
        );

        if (!hasLightningSpinResponseLanded && attackerUnit.isDead()) {
            this.sceneLog.updateLog(`${attackerUnit.getName()} died`);

            unitsHolder.deleteUnitById(grid, attackerUnit.getId());
            targetUnit.increaseMorale(MORALE_CHANGE_FOR_KILL);
            targetUnit.applyMoraleStepsModifier(FightStateManager.getInstance().getStepsMoraleMultiplier());
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(attackerUnit);
        }

        if (!hasLightningSpinAttackLanded && targetUnit.isDead()) {
            this.sceneLog.updateLog(`${targetUnit.getName()} died`);

            unitsHolder.deleteUnitById(grid, targetUnit.getId());
            attackerUnit.increaseMorale(MORALE_CHANGE_FOR_KILL);
            attackerUnit.applyMoraleStepsModifier(FightStateManager.getInstance().getStepsMoraleMultiplier());
            unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
        } else if (secondPunchLanded) {
            processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
        }

        return true;
    }
}
