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
    EffectHelper,
    HoCConstants,
    Grid,
    HoCMath,
    TeamType,
    Unit,
    ISceneLog,
    FightStateManager,
    UnitsHolder,
    IStatisticHolder,
    IDamageStatistic,
    SpellHelper,
} from "@heroesofcrypto/common";

interface ILayerImpact {
    cells: HoCMath.XY[];
    damage: number;
    moraleIncrease: number;
    enemyName: string;
    enemyMinusMorale: number;
    magicDamageReflection: number;
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
    sceneLog: ISceneLog,
    unitIdsDied: string[],
    damageStatisticHolder: IStatisticHolder<IDamageStatistic>,
): ILayerImpact[] {
    const fullLayerImpact: ILayerImpact[] = [];
    let magicDamageReflection = 0;
    for (const e1 of enemies) {
        let moraleIncrease = 0;
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

        alreadyAffectedIds.push(e1.getId());
        let enemyMinusMorale = 0;
        if (targetEnemyLightningDamage && !e1.isDead()) {
            damageStatisticHolder.add({
                unitName: fromUnit.getName(),
                damage: e1.applyDamage(targetEnemyLightningDamage, 0 /* magic attack */, sceneLog),
                team: fromUnit.getTeam(),
            });
            magicDamageReflection += (SpellHelper.getMagicMirrorPower(e1) / 100) * targetEnemyLightningDamage;
            sceneLog.updateLog(`${e1.getName()} got hit ${targetEnemyLightningDamage} by Chain Lightning`);

            if (e1.isDead() && !unitIdsDied.includes(e1.getId())) {
                sceneLog.updateLog(`${e1.getName()} died`);
                unitIdsDied.push(e1.getId());
                moraleIncrease += HoCConstants.MORALE_CHANGE_FOR_KILL;
                enemyMinusMorale = HoCConstants.MORALE_CHANGE_FOR_KILL;
            }
        }

        fullLayerImpact.push({
            cells: e1.getCells(),
            damage: targetEnemyLightningDamage,
            moraleIncrease,
            enemyName: e1.getName(),
            enemyMinusMorale,
            magicDamageReflection,
        });
    }

    return fullLayerImpact;
}

export function processChainLightningAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    attackDamage: number,
    grid: Grid,
    unitsHolder: UnitsHolder,
    sceneLog: ISceneLog,
    damageStatisticHolder: IStatisticHolder<IDamageStatistic>,
): string[] {
    const unitIdsDied: string[] = [];
    const chainLightningAbility = fromUnit.getAbility("Chain Lightning");
    if (!chainLightningAbility || !attackDamage) {
        return unitIdsDied;
    }

    const targetMagicResist = targetUnit.getMagicResist();
    if (targetMagicResist === 100 || targetUnit.hasAbilityActive("Wind Element")) {
        sceneLog.updateLog(`${targetUnit.getName()} resisted from Chain Lightning`);
        return unitIdsDied;
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

    const abilityMultiplier = fromUnit.calculateAbilityMultiplier(
        chainLightningAbility,
        FightStateManager.getInstance().getFightProperties().getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
    );
    let totalMagicDamageReflection = 0;
    const targetEnemyLightningDamage =
        Math.floor(abilityMultiplier * attackDamage * (1 - targetMagicResist / 100)) * heavyArmorMultiplierTarget;
    if (targetEnemyLightningDamage && !targetUnit.isDead()) {
        damageStatisticHolder.add({
            unitName: fromUnit.getName(),
            damage: targetUnit.applyDamage(targetEnemyLightningDamage, 0 /* magic attack */, sceneLog),
            team: fromUnit.getTeam(),
        });
        totalMagicDamageReflection += (SpellHelper.getMagicMirrorPower(targetUnit) / 100) * targetEnemyLightningDamage;
        sceneLog.updateLog(`${targetUnit.getName()} got hit ${targetEnemyLightningDamage} by Chain Lightning`);
    }

    const moraleDecreaseForTheUnitTeam: Record<string, number> = {};
    let totalMoraleIncrease = 0;

    if (targetUnit.isDead()) {
        sceneLog.updateLog(`${targetUnit.getName()} died`);
        unitIdsDied.push(targetUnit.getId());
        totalMoraleIncrease += HoCConstants.MORALE_CHANGE_FOR_KILL;
        moraleDecreaseForTheUnitTeam[`${targetUnit.getName()}:${targetUnit.getTeam()}`] =
            HoCConstants.MORALE_CHANGE_FOR_KILL;
    }

    const affectedEnemiesIds: string[] = [targetUnit.getId()];

    const enemiesLayer1: Unit[] = getEnemiesForCells(
        targetUnit.getCells(),
        targetUnit.getTeam(),
        grid,
        unitsHolder,
        affectedEnemiesIds,
    );
    if (!enemiesLayer1.length) {
        return unitIdsDied;
    }

    const layer1Impact = attackEnemiesAndGetLayerImpact(
        fromUnit,
        enemiesLayer1,
        attackDamage,
        7,
        abilityMultiplier,
        affectedEnemiesIds,
        unitsHolder,
        sceneLog,
        unitIdsDied,
        damageStatisticHolder,
    );

    for (const impact of layer1Impact) {
        totalMoraleIncrease += impact.moraleIncrease;
        const enemiesLayer2: Unit[] = getEnemiesForCells(
            impact.cells,
            targetUnit.getTeam(),
            grid,
            unitsHolder,
            affectedEnemiesIds,
        );

        totalMagicDamageReflection += impact.magicDamageReflection;

        const unitNameKeyL1 = `${impact.enemyName}:${fromUnit.getOppositeTeam()}`;
        moraleDecreaseForTheUnitTeam[unitNameKeyL1] =
            (moraleDecreaseForTheUnitTeam[unitNameKeyL1] || 0) + impact.enemyMinusMorale;

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
            sceneLog,
            unitIdsDied,
            damageStatisticHolder,
        );

        for (const impact2 of layer2Impact) {
            totalMoraleIncrease += impact2.moraleIncrease;
            const enemiesLayer3: Unit[] = getEnemiesForCells(
                impact2.cells,
                targetUnit.getTeam(),
                grid,
                unitsHolder,
                affectedEnemiesIds,
            );
            totalMagicDamageReflection += impact2.magicDamageReflection;

            const unitNameKeyL2 = `${impact2.enemyName}:${fromUnit.getOppositeTeam()}`;
            moraleDecreaseForTheUnitTeam[unitNameKeyL2] =
                (moraleDecreaseForTheUnitTeam[unitNameKeyL2] || 0) + impact2.enemyMinusMorale;

            if (!enemiesLayer2.length) {
                continue;
            }

            const layer3Impact = attackEnemiesAndGetLayerImpact(
                fromUnit,
                enemiesLayer3,
                attackDamage,
                5,
                abilityMultiplier,
                affectedEnemiesIds,
                unitsHolder,
                sceneLog,
                unitIdsDied,
                damageStatisticHolder,
            );

            for (const impact3 of layer3Impact) {
                totalMoraleIncrease += impact3.moraleIncrease;
                totalMagicDamageReflection += impact3.magicDamageReflection;
                const unitNameKeyL3 = `${impact3.enemyName}:${fromUnit.getOppositeTeam()}`;
                moraleDecreaseForTheUnitTeam[unitNameKeyL3] =
                    (moraleDecreaseForTheUnitTeam[unitNameKeyL3] || 0) + impact3.enemyMinusMorale;
            }
        }
    }

    if (totalMagicDamageReflection && !fromUnit.hasAbilityActive("Wind Element")) {
        fromUnit.applyDamage(totalMagicDamageReflection, 0 /* magic attack */, sceneLog);
        sceneLog.updateLog(`${fromUnit.getName()} got hit ${totalMagicDamageReflection} by Magic Mirror reflection`);
        if (fromUnit.isDead()) {
            sceneLog.updateLog(`${fromUnit.getName()} died`);
            unitIdsDied.push(fromUnit.getId());
            const unitFromKey = `${fromUnit.getName()}:${fromUnit.getOppositeTeam()}`;
            moraleDecreaseForTheUnitTeam[unitFromKey] =
                (moraleDecreaseForTheUnitTeam[unitFromKey] || 0) + HoCConstants.MORALE_CHANGE_FOR_KILL;
        }
    }

    fromUnit.increaseMorale(
        totalMoraleIncrease,
        FightStateManager.getInstance().getFightProperties().getAdditionalMoralePerTeam(fromUnit.getTeam()),
    );
    unitsHolder.decreaseMoraleForTheSameUnitsOfTheTeam(moraleDecreaseForTheUnitTeam);

    return unitIdsDied;
}
