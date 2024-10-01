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

import { EffectHelper, HoCConstants, Grid, HoCMath, TeamType } from "@heroesofcrypto/common";

import { SceneLog } from "../menu/scene_log";
import { FightStateManager } from "../state/fight_state_manager";
import { DamageStatisticHolder } from "../stats/damage_stats";
import { Unit } from "../units/units";
import { UnitsHolder } from "../units/units_holder";

interface ILayerImpact {
    cells: HoCMath.XY[];
    damage: number;
}

function getEnemiesForCells(
    cells: HoCMath.XY[],
    enemyTeam: TeamType,
    grid: Grid,
    unitsHolder: UnitsHolder,
    alreadyAffectedIds: string[],
): Unit[] {
    const enemies: Unit[] = [];
    for (const c of cells) {
        const auraCells = EffectHelper.getAuraCells(grid.getSettings(), c, 1);
        for (const ac of auraCells) {
            const occupantId = grid.getOccupantUnitId(ac);
            if (!occupantId || alreadyAffectedIds.includes(occupantId)) {
                continue;
            }

            const occupantUnit = unitsHolder.getAllUnits().get(occupantId);
            if (!occupantUnit || enemyTeam !== occupantUnit.getTeam()) {
                continue;
            }

            if (!enemies.includes(occupantUnit)) {
                enemies.push(occupantUnit);
            }
        }
    }

    return enemies;
}

function attackEnemiesAndGetLayerImpact(
    fromUnit: Unit,
    enemies: Unit[],
    attackDamage: number,
    multiplier: number,
    abilityMultiplier: number,
    alreadyAffectedIds: string[],
    unitsHolder: UnitsHolder,
    sceneStepCount: number,
    sceneLog: SceneLog,
): ILayerImpact[] {
    const fullLayerImpact: ILayerImpact[] = [];
    for (const e1 of enemies) {
        const enemyMagicResist = e1.getMagicResist();
        if (enemyMagicResist === 100 || e1.hasAbilityActive("Wind Element")) {
            continue;
        }

        const heavyArmorAbilityEnemy = e1.getAbility("Heavy Armor");
        let heavyArmorMultiplierEnemy = 1;
        if (heavyArmorAbilityEnemy) {
            heavyArmorMultiplierEnemy = Number(
                (
                    ((heavyArmorAbilityEnemy.getPower() + e1.getLuck()) / 100 / HoCConstants.MAX_UNIT_STACK_POWER) *
                        e1.getStackPower() +
                    1
                ).toFixed(2),
            );
        }

        const targetEnemyLightningDamage = Math.floor(
            ((abilityMultiplier * multiplier) / 8) *
                attackDamage *
                (1 - enemyMagicResist / 100) *
                heavyArmorMultiplierEnemy,
        );

        fullLayerImpact.push({
            cells: e1.getCells(),
            damage: targetEnemyLightningDamage,
        });
        alreadyAffectedIds.push(e1.getId());
        if (targetEnemyLightningDamage && !e1.isDead()) {
            e1.applyDamage(targetEnemyLightningDamage, sceneStepCount);
            DamageStatisticHolder.getInstance().add({
                unitName: fromUnit.getName(),
                damage: targetEnemyLightningDamage,
                team: fromUnit.getTeam(),
            });
            sceneLog.updateLog(`${e1.getName()} got hit ${targetEnemyLightningDamage} by Chain Lightning`);

            if (e1.isDead()) {
                sceneLog.updateLog(`${e1.getName()} died`);
                unitsHolder.deleteUnitById(e1.getId(), true);
                fromUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
                fromUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
                unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(e1);
            }
        }
    }

    return fullLayerImpact;
}

export function processChainLightingAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    attackDamage: number,
    grid: Grid,
    unitsHolder: UnitsHolder,
    sceneStepCount: number,
    sceneLog: SceneLog,
): void {
    const chainLightingAbility = fromUnit.getAbility("Chain Lightning");
    if (!chainLightingAbility || !attackDamage) {
        return;
    }

    const targetMagicResist = targetUnit.getMagicResist();
    if (targetMagicResist === 100 || targetUnit.hasAbilityActive("Wind Element")) {
        sceneLog.updateLog(`${targetUnit.getName()} resisted from Chain Lightning`);
        return;
    }

    const heavyArmorAbilityTarget = targetUnit.getAbility("Heavy Armor");
    let heavyArmorMultiplierTarget = 1;
    if (heavyArmorAbilityTarget) {
        heavyArmorMultiplierTarget = Number(
            (
                ((heavyArmorAbilityTarget.getPower() + targetUnit.getLuck()) /
                    100 /
                    HoCConstants.MAX_UNIT_STACK_POWER) *
                    targetUnit.getStackPower() +
                1
            ).toFixed(2),
        );
    }

    const abilityMultiplier = fromUnit.calculateAbilityMultiplier(chainLightingAbility);
    const targetEnemyLightningDamage =
        Math.floor(abilityMultiplier * attackDamage * (1 - targetMagicResist / 100)) * heavyArmorMultiplierTarget;
    if (targetEnemyLightningDamage && !targetUnit.isDead()) {
        targetUnit.applyDamage(targetEnemyLightningDamage, sceneStepCount);
        DamageStatisticHolder.getInstance().add({
            unitName: fromUnit.getName(),
            damage: targetEnemyLightningDamage,
            team: fromUnit.getTeam(),
        });
        sceneLog.updateLog(`${targetUnit.getName()} got hit ${targetEnemyLightningDamage} by Chain Lightning`);
    }

    if (targetUnit.isDead()) {
        sceneLog.updateLog(`${targetUnit.getName()} died`);
        unitsHolder.deleteUnitById(targetUnit.getId(), true);
        fromUnit.increaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
        fromUnit.applyMoraleStepsModifier(
            FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
        );
        unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(targetUnit);
    }

    const affectedEnemiesIds: string[] = [targetUnit.getId()];

    unitsHolder.refreshStackPowerForAllUnits();

    const enemiesLayer1: Unit[] = getEnemiesForCells(
        targetUnit.getCells(),
        targetUnit.getTeam(),
        grid,
        unitsHolder,
        affectedEnemiesIds,
    );
    if (!enemiesLayer1.length) {
        return;
    }

    const layer1Impact = attackEnemiesAndGetLayerImpact(
        fromUnit,
        enemiesLayer1,
        attackDamage,
        7,
        abilityMultiplier,
        affectedEnemiesIds,
        unitsHolder,
        sceneStepCount,
        sceneLog,
    );
    unitsHolder.refreshStackPowerForAllUnits();

    for (const impact of layer1Impact) {
        const enemiesLayer2: Unit[] = getEnemiesForCells(
            impact.cells,
            targetUnit.getTeam(),
            grid,
            unitsHolder,
            affectedEnemiesIds,
        );
        if (!enemiesLayer2.length) {
            continue;
        }

        const layer2Impact = attackEnemiesAndGetLayerImpact(
            fromUnit,
            enemiesLayer2,
            attackDamage,
            6,
            abilityMultiplier,
            affectedEnemiesIds,
            unitsHolder,
            sceneStepCount,
            sceneLog,
        );
        unitsHolder.refreshStackPowerForAllUnits();

        for (const impact2 of layer2Impact) {
            const enemiesLayer3: Unit[] = getEnemiesForCells(
                impact2.cells,
                targetUnit.getTeam(),
                grid,
                unitsHolder,
                affectedEnemiesIds,
            );
            if (!enemiesLayer2.length) {
                continue;
            }

            attackEnemiesAndGetLayerImpact(
                fromUnit,
                enemiesLayer3,
                attackDamage,
                5,
                abilityMultiplier,
                affectedEnemiesIds,
                unitsHolder,
                sceneStepCount,
                sceneLog,
            );
            unitsHolder.refreshStackPowerForAllUnits();
        }
    }
}
