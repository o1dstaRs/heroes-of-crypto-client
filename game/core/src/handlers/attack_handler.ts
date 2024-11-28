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
    GridType,
    IBoardObj,
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
import { processDullingDefenseAblity } from "../abilities/dulling_defense_ability";
import { processDevourEssenceAbility } from "../abilities/devour_essense_ability";

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

export class AttackTarget implements IBoardObj {
    private readonly position: HoCMath.XY;

    private readonly size: number;

    private renderPosition: HoCMath.XY;

    public constructor(position: HoCMath.XY, size: number) {
        this.position = position;
        this.size = size;
        this.renderPosition = structuredClone(position);
    }

    public getPosition(): HoCMath.XY {
        return this.position;
    }

    public getRenderPosition(): HoCMath.XY {
        return this.renderPosition;
    }

    public isSmallSize(): boolean {
        return this.size === 1;
    }

    public setRenderPosition(x: number, y: number): void {
        this.renderPosition.x = x;
        this.renderPosition.y = y;
    }
}

export class AttackHandler {
    public readonly gridSettings: GridSettings;

    public readonly grid: Grid;

    public readonly sceneLog: ISceneLog;

    public readonly damageStatisticHolder: DamageStatisticHolder;

    public constructor(gridSettings: GridSettings, grid: Grid, sceneLog: ISceneLog) {
        this.gridSettings = gridSettings;
        this.grid = grid;
        this.sceneLog = sceneLog;
        this.damageStatisticHolder = new DamageStatisticHolder();
    }

    public getDamageStatisticHolder(): DamageStatisticHolder {
        return this.damageStatisticHolder;
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

        if (targetUnit && targetUnit.getTeam() !== attackerUnit.getTeam() && targetUnit.hasBuffActive("Hidden")) {
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
                targetUnit.getBaseCell(),
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
                } else if (currentActiveSpell.getPowerType() === SpellPowerType.RESURRECT) {
                    const wasHp = targetUnit.getHp();
                    const resurrectedAmount = targetUnit.applyResurrection(attackerUnit.getCumulativeMaxHp());
                    if (resurrectedAmount) {
                        clarifyingStr = `for ${resurrectedAmount} units`;
                    } else {
                        clarifyingStr = `for ${targetUnit.getHp() - wasHp} hp`;
                    }
                    unitsHolder.refreshStackPowerForAllUnits();
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

                const absorptionTarget = EffectHelper.getAbsorptionTarget(debuffTarget, this.grid, unitsHolder);
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
                                attackerUnit.hasAbilityActive("Made of Fire"),
                                attackerUnit.hasAbilityActive("Made of Water"),
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
                                debuffTarget.hasAbilityActive("Made of Fire"),
                                debuffTarget.hasAbilityActive("Made of Water"),
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
                const absorptionTarget = EffectHelper.getAbsorptionTarget(debuffTarget, this.grid, unitsHolder);
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
        hoverRangeAttackDivisors: number[],
        rangeResponseAttackDivisor: number,
        damageForAnimation: IVisibleDamage,
        attackerUnit?: Unit,
        targetUnits?: Array<Unit[]>,
        rangeResponseUnits?: Unit[],
        hoverRangeAttackPosition?: HoCMath.XY,
        isAOE = false,
        decreaseNumberOfShots = true,
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
            !this.canLandRangeAttack(attackerUnit, this.grid.getEnemyAggrMatrixByUnitId(attackerUnit.getId()))
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

        if (targetUnits.length === 1 && targetUnit && targetUnit.hasBuffActive("Hidden")) {
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

        const throughShotResult = processThroughShotAbility(
            attackerUnit,
            targetUnits,
            attackerUnit,
            hoverRangeAttackDivisors,
            hoverRangeAttackPosition,
            unitsHolder,
            this.grid,
            this.sceneLog,
            this.damageStatisticHolder,
            decreaseNumberOfShots,
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

        const isAttackMissed =
            HoCLib.getRandomInt(0, 100) <
            attackerUnit.calculateMissChance(
                targetUnit,
                FightStateManager.getInstance()
                    .getFightProperties()
                    .getAdditionalAbilityPowerPerTeam(targetUnit.getTeam()),
            );
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
            this.canLandRangeAttack(targetUnit, this.grid.getEnemyAggrMatrixByUnitId(targetUnit.getId())) &&
            !(
                targetUnit.hasDebuffActive("Cowardice") &&
                targetUnit.getCumulativeHp() < rangeResponseUnit.getCumulativeHp()
            ) &&
            (!targetUnit.getTarget() || targetUnit.getTarget() === attackerUnit.getId())
        ) {
            isResponseMissed =
                HoCLib.getRandomInt(0, 100) <
                targetUnit.calculateMissChance(
                    rangeResponseUnit,
                    FightStateManager.getInstance()
                        .getFightProperties()
                        .getAdditionalAbilityPowerPerTeam(rangeResponseUnit.getTeam()),
                );
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
            this.grid,
            this.sceneLog,
            this.damageStatisticHolder,
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
                    FightStateManager.getInstance()
                        .getFightProperties()
                        .getAdditionalAbilityPowerPerTeam(attackerUnit.getTeam()),
                    hoverRangeAttackDivisor,
                    abilityMultiplier,
                    decreaseNumberOfShots,
                ),
                this.sceneLog,
            );
            this.sceneLog.updateLog(`${attackerUnit.getName()} attk ${targetUnit.getName()} (${damageFromAttack})`);
            attackDamageApplied = false;
        }

        // handle response damage
        let aoeRangeResponseResult: IAOERangeAttackResult | undefined = undefined;
        let targetUnitPlusMorale = 0;

        const increaseUnitMorale = (unitToIncreaseMoraleTo: Unit, increaseMoraleBy: number): void => {
            unitToIncreaseMoraleTo.increaseMorale(
                increaseMoraleBy,
                FightStateManager.getInstance()
                    .getFightProperties()
                    .getAdditionalMoralePerTeam(unitToIncreaseMoraleTo.getTeam()),
            );
        };

        if (rangeResponseUnit && rangeResponseUnits) {
            aoeRangeResponseResult = processRangeAOEAbility(
                targetUnit,
                rangeResponseUnits,
                targetUnit,
                rangeResponseAttackDivisor,
                unitsHolder,
                this.grid,
                this.sceneLog,
                this.damageStatisticHolder,
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
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalAbilityPowerPerTeam(targetUnit.getTeam()),
                        rangeResponseAttackDivisor,
                        abilityMultiplier,
                    ),
                    this.sceneLog,
                );

                this.sceneLog.updateLog(
                    `${targetUnit.getName()} resp ${rangeResponseUnit.getName()} (${damageFromResponse})`,
                );

                this.damageStatisticHolder.add({
                    unitName: targetUnit.getName(),
                    damage: rangeResponseUnit.applyDamage(
                        damageFromResponse,
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getBreakChancePerTeam(targetUnit.getTeam()),
                        this.sceneLog,
                        true,
                    ),
                    team: targetUnit.getTeam(),
                });
                const pegasusLightEffect = rangeResponseUnit.getEffect("Pegasus Light");
                if (pegasusLightEffect) {
                    targetUnitPlusMorale += pegasusLightEffect.getPower();
                }
            }

            processOneInTheFieldAbility(targetUnit);
        }

        let attackerUnitPlusMorale = 0;
        const moraleDecreaseForTheUnitTeam: Record<string, number> = {};

        let switchTargetUnit = false;
        if (!aoeRangeAttackResult?.landed || !isAOE) {
            if (!attackDamageApplied) {
                damageForAnimation.render = true;
                damageForAnimation.amount = damageFromAttack;
                damageForAnimation.unitPosition = targetUnit.getPosition();
                damageForAnimation.unitIsSmall = targetUnit.isSmallSize();

                this.damageStatisticHolder.add({
                    unitName: attackerUnit.getName(),
                    damage: targetUnit.applyDamage(
                        damageFromAttack,
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getBreakChancePerTeam(attackerUnit.getTeam()),
                        this.sceneLog,
                    ),
                    team: attackerUnit.getTeam(),
                });
                const pegasusLightEffect = targetUnit.getEffect("Pegasus Light");
                if (pegasusLightEffect) {
                    attackerUnitPlusMorale += pegasusLightEffect.getPower();
                }
            }

            if (targetUnit.isDead()) {
                switchTargetUnit = true;
                if (!unitIdsDied.includes(targetUnit.getId())) {
                    this.sceneLog.updateLog(`${targetUnit.getName()} died`);
                    unitIdsDied.push(targetUnit.getId());
                    attackerUnitPlusMorale += HoCConstants.MORALE_CHANGE_FOR_KILL;
                    this.updateMoraleDecreaseForTheUnitTeam(moraleDecreaseForTheUnitTeam, {
                        [`${targetUnit.getName()}:${targetUnit.getTeam()}`]: HoCConstants.MORALE_CHANGE_FOR_KILL,
                    });
                }
            } else {
                processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processPetrifyingGazeAbility(
                    attackerUnit,
                    targetUnit,
                    damageFromAttack,
                    this.sceneLog,
                    this.damageStatisticHolder,
                );
                processSpitBallAbility(attackerUnit, targetUnit, attackerUnit, unitsHolder, this.grid, this.sceneLog);
            }
        }

        if (rangeResponseUnit) {
            if (aoeRangeResponseResult?.landed) {
                if (rangeResponseUnit.isDead() && attackerUnit.getId() === rangeResponseUnit.getId()) {
                    unitIdsDied.push(rangeResponseUnit.getId());
                    increaseUnitMorale(attackerUnit, attackerUnitPlusMorale);
                    increaseUnitMorale(targetUnit, targetUnitPlusMorale);
                    unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(moraleDecreaseForTheUnitTeam);
                    return { completed: true, unitIdsDied, animationData };
                }
            } else {
                if (rangeResponseUnit.isDead()) {
                    if (!unitIdsDied.includes(rangeResponseUnit.getId())) {
                        this.sceneLog.updateLog(`${rangeResponseUnit.getName()} died`);
                        unitIdsDied.push(rangeResponseUnit.getId());
                        this.updateMoraleDecreaseForTheUnitTeam(moraleDecreaseForTheUnitTeam, {
                            [`${rangeResponseUnit.getName()}:${rangeResponseUnit.getTeam()}`]:
                                HoCConstants.MORALE_CHANGE_FOR_KILL,
                        });
                        if (!targetUnit.isDead()) {
                            targetUnitPlusMorale += HoCConstants.MORALE_CHANGE_FOR_KILL;
                        }
                    }

                    if (attackerUnit.getId() === rangeResponseUnit.getId()) {
                        increaseUnitMorale(attackerUnit, attackerUnitPlusMorale);
                        increaseUnitMorale(targetUnit, targetUnitPlusMorale);
                        unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(moraleDecreaseForTheUnitTeam);
                        return { completed: true, unitIdsDied, animationData };
                    }
                } else {
                    processStunAbility(targetUnit, rangeResponseUnit, attackerUnit, this.sceneLog);
                    processPetrifyingGazeAbility(
                        targetUnit,
                        rangeResponseUnit,
                        damageFromResponse,
                        this.sceneLog,
                        this.damageStatisticHolder,
                    );
                    processSpitBallAbility(
                        targetUnit,
                        rangeResponseUnit,
                        attackerUnit,
                        unitsHolder,
                        this.grid,
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
                increaseUnitMorale(attackerUnit, attackerUnitPlusMorale);
                increaseUnitMorale(targetUnit, targetUnitPlusMorale);
                unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(moraleDecreaseForTheUnitTeam);
                return { completed: true, unitIdsDied, animationData };
            }

            const previousTargetUnit = targetUnit;
            targetUnit = affectedUnits[0];

            if (previousTargetUnit !== targetUnit) {
                // last chance to increase morale as we just switched target unit
                increaseUnitMorale(targetUnit, targetUnitPlusMorale);
            }

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
                increaseUnitMorale(attackerUnit, attackerUnitPlusMorale);
                unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(moraleDecreaseForTheUnitTeam);
                return { completed: true, unitIdsDied, animationData };
            }
            hoverRangeAttackDivisor = hoverRangeAttackDivisors.at(targetUnitUndex);
            if (!hoverRangeAttackDivisor) {
                increaseUnitMorale(attackerUnit, attackerUnitPlusMorale);
                unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(moraleDecreaseForTheUnitTeam);
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
            this.grid,
            hoverRangeAttackDivisor,
            hoverRangeAttackPosition,
            damageForAnimation,
            this.damageStatisticHolder,
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
                attackerUnitPlusMorale += HoCConstants.MORALE_CHANGE_FOR_KILL;
                this.updateMoraleDecreaseForTheUnitTeam(moraleDecreaseForTheUnitTeam, {
                    [`${targetUnit.getName()}:${targetUnit.getTeam()}`]: HoCConstants.MORALE_CHANGE_FOR_KILL,
                });
            } else if (secondShotResult.applied) {
                processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processPetrifyingGazeAbility(
                    attackerUnit,
                    targetUnit,
                    secondShotResult.damage,
                    this.sceneLog,
                    this.damageStatisticHolder,
                );
                processSpitBallAbility(attackerUnit, targetUnit, attackerUnit, unitsHolder, this.grid, this.sceneLog);
            }
        }

        attackerUnit.increaseMorale(
            attackerUnitPlusMorale + secondShotResult.moraleIncrease,
            FightStateManager.getInstance().getFightProperties().getAdditionalMoralePerTeam(attackerUnit.getTeam()),
        );
        unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(moraleDecreaseForTheUnitTeam);

        unitsHolder.refreshStackPowerForAllUnits();

        return { completed: true, unitIdsDied, animationData };
    }

    public handleMeleeAttack(
        unitsHolder: UnitsHolder,
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

        if (targetUnit && targetUnit.hasBuffActive("Hidden")) {
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

        if (!this.grid.areCellsAdjacent(attackFromCells, targetUnit.getCells())) {
            return { completed: false, unitIdsDied, animationData };
        }

        const stationaryAttack = currentCell.x === attackFromCell.x && currentCell.y === attackFromCell.y;

        if (!stationaryAttack && !attackerUnit.canMove()) {
            return { completed: false, unitIdsDied, animationData };
        }

        let attackerUnitPlusMorale = 0;
        let targetUnitPlusMorale = 0;
        const moraleDecreaseForTheUnitTeam: Record<string, number> = {};

        if (attackerUnit.isSmallSize()) {
            const attackFromCells = [attackFromCell];
            if (
                (this.grid.areAllCellsEmpty(attackFromCells, attackerUnit.getId()) ||
                    this.grid.canOccupyCells(
                        attackFromCells,
                        attackerUnit.hasAbilityActive("Made of Fire"),
                        attackerUnit.hasAbilityActive("Made of Water"),
                    )) &&
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
                        attackerUnit,
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalAbilityPowerPerTeam(attackerUnit.getTeam()),
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalMoralePerTeam(attackerUnit.getTeam()),
                        currentActiveKnownPaths,
                    );
                if (!moveInitiated) {
                    return { completed: false, unitIdsDied, animationData };
                }

                attackerUnit.setPosition(position.x, position.y, false);
                this.grid.occupyCell(
                    attackFromCell,
                    attackerUnit.getId(),
                    attackerUnit.getTeam(),
                    attackerUnit.getAttackRange(),
                    attackerUnit.hasAbilityActive("Made of Fire"),
                    attackerUnit.hasAbilityActive("Made of Water"),
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
                (this.grid.areAllCellsEmpty(cells, attackerUnit.getId()) ||
                    this.grid.canOccupyCells(
                        attackFromCells,
                        attackerUnit.hasAbilityActive("Made of Fire"),
                        attackerUnit.hasAbilityActive("Made of Water"),
                    )) &&
                (stationaryAttack || currentActiveKnownPaths?.get((attackFromCell.x << 4) | attackFromCell.y)?.length)
            ) {
                const moveInitiated =
                    stationaryAttack ||
                    moveHandler.applyMoveModifiers(
                        attackFromCell,
                        attackerUnit,
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalAbilityPowerPerTeam(attackerUnit.getTeam()),
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalMoralePerTeam(attackerUnit.getTeam()),
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

                this.grid.occupyCells(
                    cells,
                    attackerUnit.getId(),
                    attackerUnit.getTeam(),
                    attackerUnit.getAttackRange(),
                    attackerUnit.hasAbilityActive("Made of Fire"),
                    attackerUnit.hasAbilityActive("Made of Water"),
                );

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
                abilityMultiplier *= attackerUnit.calculateAbilityMultiplier(
                    awpc,
                    FightStateManager.getInstance()
                        .getFightProperties()
                        .getAdditionalAbilityPowerPerTeam(attackerUnit.getTeam()),
                );
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

        const isAttackMissed =
            HoCLib.getRandomInt(0, 100) <
            attackerUnit.calculateMissChance(
                targetUnit,
                FightStateManager.getInstance()
                    .getFightProperties()
                    .getAdditionalAbilityPowerPerTeam(targetUnit.getTeam()),
            );

        attackerUnit.cleanupAttackModIncrease();
        attackerUnit.increaseAttackMod(unitsHolder.getUnitAuraAttackMod(attackerUnit));

        const damageFromAttack =
            processLuckyStrikeAbility(
                attackerUnit,
                attackerUnit.calculateAttackDamage(
                    targetUnit,
                    AttackType.MELEE,
                    FightStateManager.getInstance()
                        .getFightProperties()
                        .getAdditionalAbilityPowerPerTeam(attackerUnit.getTeam()),
                    1,
                    abilityMultiplier,
                ),
                this.sceneLog,
            ) + processPenetratingBiteAbility(attackerUnit, targetUnit);

        const fightProperties = FightStateManager.getInstance().getFightProperties();

        const lightningSpinAttackResult = processLightningSpinAbility(
            attackerUnit,
            this.sceneLog,
            unitsHolder,
            rapidChargeCellsNumber,
            this.damageStatisticHolder,
            attackFromCell,
            true,
        );
        const hasLightningSpinAttackLanded = lightningSpinAttackResult.landed;
        updateUnitsDied(lightningSpinAttackResult.unitIdsDied);

        const fireBreathAttackResult = processFireBreathAbility(
            attackerUnit,
            targetUnit,
            this.sceneLog,
            unitsHolder,
            this.grid,
            "attk",
            this.damageStatisticHolder,
            attackFromCell,
        );
        updateUnitsDied(fireBreathAttackResult.unitIdsDied);
        this.updateMoraleDecreaseForTheUnitTeam(
            moraleDecreaseForTheUnitTeam,
            fireBreathAttackResult.moraleDecreaseForTheUnitTeam,
        );
        attackerUnitPlusMorale += fireBreathAttackResult.increaseMorale;

        const skewerStrikeAttackResult = processSkewerStrikeAbility(
            attackerUnit,
            targetUnit,
            this.sceneLog,
            unitsHolder,
            this.grid,
            this.damageStatisticHolder,
            attackFromCell,
            true,
        );
        updateUnitsDied(skewerStrikeAttackResult.unitIdsDied);
        this.updateMoraleDecreaseForTheUnitTeam(
            moraleDecreaseForTheUnitTeam,
            skewerStrikeAttackResult.moraleDecreaseForTheUnitTeam,
        );
        attackerUnitPlusMorale += skewerStrikeAttackResult.increaseMorale;

        if (isAttackMissed) {
            this.sceneLog.updateLog(`${attackerUnit.getName()} misses attk ${targetUnit.getName()}`);
        } else if (!hasLightningSpinAttackLanded) {
            // just log attack here,
            // to make sure that logs are in chronological order
            this.sceneLog.updateLog(`${attackerUnit.getName()} attk ${targetUnit.getName()} (${damageFromAttack})`);

            const fireShieldReflectResult = processFireShieldAbility(
                targetUnit,
                attackerUnit,
                this.sceneLog,
                damageFromAttack,
                unitsHolder,
                this.damageStatisticHolder,
            );

            updateUnitsDied(fireShieldReflectResult.unitIdsDied);
            this.updateMoraleDecreaseForTheUnitTeam(
                moraleDecreaseForTheUnitTeam,
                fireShieldReflectResult.moraleDecreaseForTheUnitTeam,
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
                const isResponseMissed =
                    HoCLib.getRandomInt(0, 100) <
                    targetUnit.calculateMissChance(
                        attackerUnit,
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalAbilityPowerPerTeam(attackerUnit.getTeam()),
                    );

                const fireBreathResponseResult = processFireBreathAbility(
                    targetUnit,
                    attackerUnit,
                    this.sceneLog,
                    unitsHolder,
                    this.grid,
                    "resp",
                    this.damageStatisticHolder,
                    GridMath.getCellForPosition(this.gridSettings, targetUnit.getPosition()),
                );
                updateUnitsDied(fireBreathResponseResult.unitIdsDied);
                this.updateMoraleDecreaseForTheUnitTeam(
                    moraleDecreaseForTheUnitTeam,
                    fireBreathResponseResult.moraleDecreaseForTheUnitTeam,
                );

                const skewerStrikeResponseResult = processSkewerStrikeAbility(
                    targetUnit,
                    attackerUnit,
                    this.sceneLog,
                    unitsHolder,
                    this.grid,
                    this.damageStatisticHolder,
                    GridMath.getCellForPosition(this.gridSettings, targetUnit.getPosition()),
                    false,
                );
                updateUnitsDied(skewerStrikeResponseResult.unitIdsDied);
                this.updateMoraleDecreaseForTheUnitTeam(
                    moraleDecreaseForTheUnitTeam,
                    skewerStrikeResponseResult.moraleDecreaseForTheUnitTeam,
                );

                const lightningSpinResponseResult = processLightningSpinAbility(
                    targetUnit,
                    this.sceneLog,
                    unitsHolder,
                    1,
                    this.damageStatisticHolder,
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
                            abilityMultiplier *= targetUnit.calculateAbilityMultiplier(
                                awpc,
                                FightStateManager.getInstance()
                                    .getFightProperties()
                                    .getAdditionalAbilityPowerPerTeam(targetUnit.getTeam()),
                            );
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
                            targetUnit.calculateAttackDamage(
                                attackerUnit,
                                AttackType.MELEE,
                                FightStateManager.getInstance()
                                    .getFightProperties()
                                    .getAdditionalAbilityPowerPerTeam(targetUnit.getTeam()),
                                1,
                                abilityMultiplier,
                            ),
                            this.sceneLog,
                        ) + processPenetratingBiteAbility(targetUnit, attackerUnit);

                    this.sceneLog.updateLog(
                        `${targetUnit.getName()} resp ${attackerUnit.getName()} (${damageFromResponse})`,
                    );

                    this.damageStatisticHolder.add({
                        unitName: targetUnit.getName(),
                        damage: attackerUnit.applyDamage(
                            damageFromResponse,
                            FightStateManager.getInstance()
                                .getFightProperties()
                                .getBreakChancePerTeam(targetUnit.getTeam()),
                            this.sceneLog,
                            true,
                        ),
                        team: targetUnit.getTeam(),
                    });
                    const pegasusLightEffect = attackerUnit.getEffect("Pegasus Light");
                    if (pegasusLightEffect) {
                        targetUnitPlusMorale += pegasusLightEffect.getPower();
                    }

                    processMinerAbility(targetUnit, attackerUnit, this.sceneLog);
                    const fireShieldFromAttackerResult = processFireShieldAbility(
                        attackerUnit,
                        targetUnit,
                        this.sceneLog,
                        damageFromResponse,
                        unitsHolder,
                        this.damageStatisticHolder,
                    );
                    updateUnitsDied(fireShieldFromAttackerResult.unitIdsDied);
                    this.updateMoraleDecreaseForTheUnitTeam(
                        moraleDecreaseForTheUnitTeam,
                        fireShieldFromAttackerResult.moraleDecreaseForTheUnitTeam,
                    );
                    processStunAbility(targetUnit, attackerUnit, attackerUnit, this.sceneLog);
                    processDullingDefenseAblity(attackerUnit, targetUnit, this.sceneLog);
                    processPetrifyingGazeAbility(
                        targetUnit,
                        attackerUnit,
                        damageFromResponse,
                        this.sceneLog,
                        this.damageStatisticHolder,
                    );
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
                            this.damageStatisticHolder,
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
            damageForAnimation.render = true;
            damageForAnimation.amount = damageFromAttack;
            damageForAnimation.unitPosition = targetUnit.getPosition();
            damageForAnimation.unitIsSmall = targetUnit.isSmallSize();
            this.damageStatisticHolder.add({
                unitName: attackerUnit.getName(),
                damage: targetUnit.applyDamage(
                    damageFromAttack,
                    FightStateManager.getInstance().getFightProperties().getBreakChancePerTeam(attackerUnit.getTeam()),
                    this.sceneLog,
                ),
                team: attackerUnit.getTeam(),
            });

            processMinerAbility(attackerUnit, targetUnit, this.sceneLog);
            processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
            processDullingDefenseAblity(targetUnit, attackerUnit, this.sceneLog);
            processPetrifyingGazeAbility(
                attackerUnit,
                targetUnit,
                damageFromAttack,
                this.sceneLog,
                this.damageStatisticHolder,
            );
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
                    this.damageStatisticHolder,
                ),
            );
            const pegasusLightEffect = targetUnit.getEffect("Pegasus Light");
            if (pegasusLightEffect) {
                attackerUnitPlusMorale += pegasusLightEffect.getPower();
            }
            // ~ already responded here
        }
        unitsHolder.refreshStackPowerForAllUnits();

        const secondPunchResult = processDoublePunchAbility(attackerUnit, targetUnit, this.sceneLog);

        if (!hasLightningSpinResponseLanded && attackerUnit.isDead() && !unitIdsDied.includes(attackerUnit.getId())) {
            this.sceneLog.updateLog(`${attackerUnit.getName()} died`);

            unitIdsDied.push(attackerUnit.getId());
            targetUnitPlusMorale += HoCConstants.MORALE_CHANGE_FOR_KILL;
            this.updateMoraleDecreaseForTheUnitTeam(moraleDecreaseForTheUnitTeam, {
                [`${attackerUnit.getName()}:${attackerUnit.getTeam()}`]: HoCConstants.MORALE_CHANGE_FOR_KILL,
            });
        }

        if (!hasLightningSpinAttackLanded && targetUnit.isDead() && !unitIdsDied.includes(targetUnit.getId())) {
            this.sceneLog.updateLog(`${targetUnit.getName()} died`);

            unitIdsDied.push(targetUnit.getId());
            attackerUnitPlusMorale += HoCConstants.MORALE_CHANGE_FOR_KILL;
            this.updateMoraleDecreaseForTheUnitTeam(moraleDecreaseForTheUnitTeam, {
                [`${targetUnit.getName()}:${targetUnit.getTeam()}`]: HoCConstants.MORALE_CHANGE_FOR_KILL,
            });
        } else if (secondPunchResult.applied) {
            captureResponse();
            if (secondPunchResult.damage > 0) {
                this.damageStatisticHolder.add({
                    unitName: attackerUnit.getName(),
                    damage: targetUnit.applyDamage(
                        secondPunchResult.damage,
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getBreakChancePerTeam(attackerUnit.getTeam()),
                        this.sceneLog,
                    ),
                    team: attackerUnit.getTeam(),
                });
            }

            const secondFireShieldResult = processFireShieldAbility(
                targetUnit,
                attackerUnit,
                this.sceneLog,
                secondPunchResult.damage,
                unitsHolder,
                this.damageStatisticHolder,
            );
            updateUnitsDied(secondFireShieldResult.unitIdsDied);
            this.updateMoraleDecreaseForTheUnitTeam(
                moraleDecreaseForTheUnitTeam,
                secondFireShieldResult.moraleDecreaseForTheUnitTeam,
            );

            if (!secondPunchResult.missed) {
                processMinerAbility(attackerUnit, targetUnit, this.sceneLog);
                processStunAbility(attackerUnit, targetUnit, attackerUnit, this.sceneLog);
                processDullingDefenseAblity(targetUnit, attackerUnit, this.sceneLog);
                processPetrifyingGazeAbility(
                    attackerUnit,
                    targetUnit,
                    secondPunchResult.damage,
                    this.sceneLog,
                    this.damageStatisticHolder,
                );
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
                this.sceneLog.updateLog(`${attackerUnit.getName()} died`);

                unitIdsDied.push(attackerUnit.getId());
                targetUnitPlusMorale += HoCConstants.MORALE_CHANGE_FOR_KILL;
                this.updateMoraleDecreaseForTheUnitTeam(moraleDecreaseForTheUnitTeam, {
                    [`${attackerUnit.getName()}:${attackerUnit.getTeam()}`]: HoCConstants.MORALE_CHANGE_FOR_KILL,
                });
            }

            if (!hasLightningSpinAttackLanded && targetUnit.isDead() && !unitIdsDied.includes(targetUnit.getId())) {
                this.sceneLog.updateLog(`${targetUnit.getName()} died`);

                unitIdsDied.push(targetUnit.getId());
                attackerUnitPlusMorale += HoCConstants.MORALE_CHANGE_FOR_KILL;
                this.updateMoraleDecreaseForTheUnitTeam(moraleDecreaseForTheUnitTeam, {
                    [`${targetUnit.getName()}:${targetUnit.getTeam()}`]: HoCConstants.MORALE_CHANGE_FOR_KILL,
                });
            }
        }

        targetUnit.increaseMorale(
            targetUnitPlusMorale,
            FightStateManager.getInstance().getFightProperties().getAdditionalMoralePerTeam(attackerUnit.getTeam()),
        );

        attackerUnit.increaseMorale(
            attackerUnitPlusMorale + secondPunchResult.moraleIncrease,
            FightStateManager.getInstance().getFightProperties().getAdditionalMoralePerTeam(attackerUnit.getTeam()),
        );
        unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(moraleDecreaseForTheUnitTeam);
        unitsHolder.refreshStackPowerForAllUnits();

        processDevourEssenceAbility(attackerUnit, unitIdsDied, unitsHolder, this.sceneLog);
        processDevourEssenceAbility(targetUnit, unitIdsDied, unitsHolder, this.sceneLog);

        return { completed: true, unitIdsDied, animationData };
    }

    public handleObstacleAttack(
        targetPosition: HoCMath.XY,
        unitsHolder: UnitsHolder,
        moveHandler: MoveHandler,
        attackerUnit?: Unit,
        attackFromCell?: HoCMath.XY,
        currentActiveKnownPaths?: Map<number, IWeightedRoute[]>,
    ): IAttackResult {
        const targetCell = GridMath.getCellForPosition(this.gridSettings, targetPosition);
        const animationData: IAnimationData[] = [];
        if (
            this.grid.getGridType() !== GridType.BLOCK_CENTER ||
            FightStateManager.getInstance().getFightProperties().getGridType() !== GridType.BLOCK_CENTER ||
            FightStateManager.getInstance().getFightProperties().getObstacleHitsLeft() <= 0 ||
            !attackerUnit ||
            attackerUnit.isDead() ||
            !GridMath.isPositionWithinGrid(this.gridSettings, targetPosition) ||
            !GridMath.isPositionWithinGrid(this.gridSettings, attackerUnit.getPosition())
        ) {
            return { completed: false, unitIdsDied: [], animationData };
        }

        // check if unit is forced to attack certain enemy only
        // if so, check if the forced target is still alive
        const forcedTargetUnitId = attackerUnit.getTarget();
        const forcedTargetUnit = unitsHolder.getAllUnits().get(forcedTargetUnitId);
        if (forcedTargetUnit && !forcedTargetUnit.isDead()) {
            return { completed: false, unitIdsDied: [], animationData };
        }

        const centerCells = this.grid.getCenterCells();
        let foundTargetCell = false;
        for (const c of centerCells) {
            if (c.x === targetCell.x && c.y === targetCell.y) {
                foundTargetCell = true;
                break;
            }
        }

        if (!foundTargetCell) {
            return { completed: false, unitIdsDied: [], animationData };
        }

        // range attack
        let rangeLanded = false;
        if (
            attackerUnit.getAttackTypeSelection() === AttackType.RANGE &&
            this.canLandRangeAttack(attackerUnit, this.grid.getEnemyAggrMatrixByUnitId(attackerUnit.getId()))
        ) {
            animationData.push({
                fromPosition: attackerUnit.getPosition(),
                toPosition: targetPosition,
                affectedUnit: new AttackTarget(targetPosition, 1),
            });
            FightStateManager.getInstance().getFightProperties().encointerObstacleHit();
            attackerUnit.decreaseNumberOfShots();
            this.sceneLog.updateLog(`${attackerUnit.getName()} hit mountain`);
            rangeLanded = true;
        }

        // range second attack
        if (FightStateManager.getInstance().getFightProperties().getObstacleHitsLeft()) {
            const doubleShotAbility = attackerUnit.getAbility("Double Shot");
            if (
                doubleShotAbility &&
                attackerUnit.getAttackTypeSelection() === AttackType.RANGE &&
                this.canLandRangeAttack(attackerUnit, this.grid.getEnemyAggrMatrixByUnitId(attackerUnit.getId()))
            ) {
                animationData.push({
                    fromPosition: attackerUnit.getPosition(),
                    toPosition: targetPosition,
                    affectedUnit: new AttackTarget(targetPosition, 1),
                });
                FightStateManager.getInstance().getFightProperties().encointerObstacleHit();
                attackerUnit.decreaseNumberOfShots();
                this.sceneLog.updateLog(`${attackerUnit.getName()} hit mountain`);
                rangeLanded = true;
            }
        }

        // land melee attack
        if (!rangeLanded && attackFromCell) {
            let isAdjacentToCenter = false;
            const excludeCells: number[] = [];
            excludeCells.push(
                ((this.gridSettings.getGridSize() / 2) << 4) | (this.gridSettings.getGridSize() / 2),
                ((this.gridSettings.getGridSize() / 2 - 1) << 4) | (this.gridSettings.getGridSize() / 2 - 1),
                ((this.gridSettings.getGridSize() / 2) << 4) | (this.gridSettings.getGridSize() / 2 - 1),
                ((this.gridSettings.getGridSize() / 2 - 1) << 4) | (this.gridSettings.getGridSize() / 2),
            );

            const currentCell = GridMath.getCellForPosition(this.gridSettings, attackerUnit.getPosition());

            if (!currentCell) {
                return { completed: rangeLanded, unitIdsDied: [], animationData };
            }

            const attackFromCells = [attackFromCell];
            if (!attackerUnit.isSmallSize()) {
                attackFromCells.push(
                    { x: attackFromCell.x, y: attackFromCell.y - 1 },
                    { x: attackFromCell.x - 1, y: attackFromCell.y },
                    { x: attackFromCell.x - 1, y: attackFromCell.y - 1 },
                );
            }

            for (const c of attackFromCells) {
                if (excludeCells.includes((c.x << 4) | c.y)) {
                    break;
                }

                let centerCells = this.grid.getCenterCells(true);
                for (const centerCell of centerCells) {
                    if (Math.abs(c.x - centerCell.x) <= 1 && Math.abs(c.y - centerCell.y) <= 1) {
                        isAdjacentToCenter = true;
                        break;
                    }
                }

                if (isAdjacentToCenter) {
                    break;
                }
            }

            if (!isAdjacentToCenter) {
                return { completed: rangeLanded, unitIdsDied: [], animationData };
            }

            const stationaryAttack = currentCell.x === attackFromCell.x && currentCell.y === attackFromCell.y;

            if (attackerUnit.isSmallSize()) {
                if (
                    (this.grid.areAllCellsEmpty(attackFromCells, attackerUnit.getId()) ||
                        this.grid.canOccupyCells(
                            attackFromCells,
                            attackerUnit.hasAbilityActive("Made of Fire"),
                            attackerUnit.hasAbilityActive("Made of Water"),
                        )) &&
                    (stationaryAttack ||
                        currentActiveKnownPaths?.get((attackFromCell.x << 4) | attackFromCell.y)?.length)
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
                            attackerUnit,
                            FightStateManager.getInstance()
                                .getFightProperties()
                                .getAdditionalAbilityPowerPerTeam(attackerUnit.getTeam()),
                            FightStateManager.getInstance()
                                .getFightProperties()
                                .getAdditionalMoralePerTeam(attackerUnit.getTeam()),
                            currentActiveKnownPaths,
                        );
                    if (!moveInitiated) {
                        return { completed: rangeLanded, unitIdsDied: [], animationData };
                    }

                    attackerUnit.setPosition(position.x, position.y, false);
                    this.grid.occupyCell(
                        attackFromCell,
                        attackerUnit.getId(),
                        attackerUnit.getTeam(),
                        attackerUnit.getAttackRange(),
                        attackerUnit.hasAbilityActive("Made of Fire"),
                        attackerUnit.hasAbilityActive("Made of Water"),
                    );

                    animationData.push({
                        toPosition: attackerUnit.getPosition(),
                        affectedUnit: attackerUnit,
                        bodyUnit: attackerUnit,
                    });

                    FightStateManager.getInstance().getFightProperties().encointerObstacleHit();
                    this.sceneLog.updateLog(`${attackerUnit.getName()} hit mountain`);
                    if (
                        FightStateManager.getInstance().getFightProperties().getObstacleHitsLeft() &&
                        attackerUnit.getAbility("Double Punch")
                    ) {
                        FightStateManager.getInstance().getFightProperties().encointerObstacleHit();
                        this.sceneLog.updateLog(`${attackerUnit.getName()} hit mountain`);
                    }
                } else {
                    return { completed: rangeLanded, unitIdsDied: [], animationData };
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
                    (this.grid.areAllCellsEmpty(cells, attackerUnit.getId()) ||
                        this.grid.canOccupyCells(
                            cells,
                            attackerUnit.hasAbilityActive("Made of Fire"),
                            attackerUnit.hasAbilityActive("Made of Water"),
                        )) &&
                    (stationaryAttack ||
                        currentActiveKnownPaths?.get((attackFromCell.x << 4) | attackFromCell.y)?.length)
                ) {
                    const moveInitiated =
                        stationaryAttack ||
                        moveHandler.applyMoveModifiers(
                            attackFromCell,
                            attackerUnit,
                            FightStateManager.getInstance()
                                .getFightProperties()
                                .getAdditionalAbilityPowerPerTeam(attackerUnit.getTeam()),
                            FightStateManager.getInstance()
                                .getFightProperties()
                                .getAdditionalMoralePerTeam(attackerUnit.getTeam()),
                            currentActiveKnownPaths,
                        );
                    if (!moveInitiated) {
                        return { completed: rangeLanded, unitIdsDied: [], animationData };
                    }

                    attackerUnit.setPosition(
                        position.x - this.gridSettings.getHalfStep(),
                        position.y - this.gridSettings.getHalfStep(),
                        false,
                    );

                    this.grid.occupyCells(
                        cells,
                        attackerUnit.getId(),
                        attackerUnit.getTeam(),
                        attackerUnit.getAttackRange(),
                        attackerUnit.hasAbilityActive("Made of Fire"),
                        attackerUnit.hasAbilityActive("Made of Water"),
                    );

                    animationData.push({
                        toPosition: attackerUnit.getPosition(),
                        affectedUnit: attackerUnit,
                        bodyUnit: attackerUnit,
                    });

                    FightStateManager.getInstance().getFightProperties().encointerObstacleHit();
                    this.sceneLog.updateLog(`${attackerUnit.getName()} hit mountain`);

                    if (
                        FightStateManager.getInstance().getFightProperties().getObstacleHitsLeft() &&
                        attackerUnit.getAbility("Double Punch")
                    ) {
                        FightStateManager.getInstance().getFightProperties().encointerObstacleHit();
                        this.sceneLog.updateLog(`${attackerUnit.getName()} hit mountain`);
                    }
                } else {
                    return { completed: rangeLanded, unitIdsDied: [], animationData };
                }
            }
        }

        return { completed: true, unitIdsDied: [], animationData };
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
                if (possibleUnitId === "L" || possibleUnitId === "W") {
                    affectedCells.push([cell]);
                }
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

            if (
                (attackerUnit.hasAbilityActive("Large Caliber") || attackerUnit.hasAbilityActive("Area Throw")) &&
                !possibleUnit.hasAbilityActive("Arrows Wingshield Aura")
            ) {
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

    private updateMoraleDecreaseForTheUnitTeam(
        initialRecord: Record<string, number>,
        updateBy: Record<string, number>,
    ): void {
        for (const updateByKey of Object.keys(updateBy)) {
            const updateByValue = updateBy[updateByKey];
            if (updateByValue > 0) {
                initialRecord[updateByKey] = (initialRecord[updateByKey] || 0) + updateByValue;
            }
        }
    }
}
