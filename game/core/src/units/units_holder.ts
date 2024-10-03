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
    AppliedSpell,
    AppliedAuraEffectProperties,
    HoCMath,
    TeamType,
    UnitProperties,
    Grid,
    GridSettings,
    GridMath,
    EffectHelper,
    HoCLib,
    SquarePlacement,
    HoCConstants,
} from "@heroesofcrypto/common";

import { FightStateManager } from "../state/fight_state_manager";
import { RenderableUnit } from "./renderable_unit";
import { Unit } from "./units";

export class UnitsHolder {
    private readonly grid: Grid;

    private readonly allUnits: Map<string, Unit> = new Map();

    private readonly gridSettings: GridSettings;

    private teamsAuraEffects: Map<TeamType, Map<number, AppliedAuraEffectProperties[]>>;

    public constructor(grid: Grid) {
        this.grid = grid;
        this.gridSettings = grid.getSettings();
        this.teamsAuraEffects = new Map();
    }

    public getAllUnitsIterator(): IterableIterator<Unit> {
        return this.allUnits.values();
    }

    public getAllUnits(): Map<string, Unit> {
        return this.allUnits;
    }

    public getAllEnemyUnits(myTeamType: TeamType): Unit[] {
        const enemyUnits: Unit[] = [];
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() !== myTeamType) {
                enemyUnits.push(unit);
            }
        }

        return enemyUnits;
    }

    public getAllAllies(teamType: TeamType): Unit[] {
        const allies: Unit[] = [];
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() === teamType) {
                allies.push(unit);
            }
        }

        return allies;
    }

    public getAllAlliesPlaced(
        teamType: TeamType,
        lowerLeftPlacement: SquarePlacement,
        upperRightPlacement: SquarePlacement,
        lowerRightPlacement?: SquarePlacement,
        upperLeftPlacement?: SquarePlacement,
    ): Unit[] {
        const allies: Unit[] = [];
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() === teamType) {
                if (
                    ((teamType === TeamType.LOWER &&
                        (lowerLeftPlacement.isAllowed(unit.getPosition()) ||
                            (lowerRightPlacement && lowerRightPlacement.isAllowed(unit.getPosition())))) ||
                        (teamType === TeamType.UPPER &&
                            (upperRightPlacement.isAllowed(unit.getPosition()) ||
                                (upperLeftPlacement && upperLeftPlacement.isAllowed(unit.getPosition()))))) &&
                    GridMath.isPositionWithinGrid(this.gridSettings, unit.getPosition())
                ) {
                    allies.push(unit);
                }
            }
        }

        return allies;
    }

    public getAllTeamUnitsBuffs(teamType: TeamType): Map<string, AppliedSpell[]> {
        const teamUnitBuffs: Map<string, AppliedSpell[]> = new Map();
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() === teamType) {
                teamUnitBuffs.set(unit.getId(), unit.getBuffs());
            }
        }

        return teamUnitBuffs;
    }

    public getAllEnemyUnitsBuffs(myTeamType: TeamType): Map<string, AppliedSpell[]> {
        const enemyTeamUnitBuffs: Map<string, AppliedSpell[]> = new Map();
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() !== myTeamType) {
                enemyTeamUnitBuffs.set(unit.getId(), unit.getBuffs());
            }
        }

        return enemyTeamUnitBuffs;
    }

    public getAllEnemyUnitsDebuffs(myTeamType: TeamType): Map<string, AppliedSpell[]> {
        const teamUnitBuffs: Map<string, AppliedSpell[]> = new Map();
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() !== myTeamType) {
                teamUnitBuffs.set(unit.getId(), unit.getDebuffs());
            }
        }

        return teamUnitBuffs;
    }

    public getAllTeamUnitsCanFly(teamType: TeamType): Map<string, boolean> {
        const teamUnitCanFly: Map<string, boolean> = new Map();
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() === teamType) {
                teamUnitCanFly.set(unit.getId(), unit.canFly());
            }
        }

        return teamUnitCanFly;
    }

    public getAllEnemyUnitsCanFly(teamType: TeamType): Map<string, boolean> {
        const enemyTeamUnitCanFly: Map<string, boolean> = new Map();
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() !== teamType) {
                enemyTeamUnitCanFly.set(unit.getId(), unit.canFly());
            }
        }

        return enemyTeamUnitCanFly;
    }

    public getAllTeamUnitsMagicResist(teamType: TeamType): Map<string, number> {
        const teamUnitMagicResist: Map<string, number> = new Map();
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() === teamType) {
                teamUnitMagicResist.set(unit.getId(), unit.getMagicResist());
            }
        }

        return teamUnitMagicResist;
    }

    public getAllTeamUnitsHp(teamType: TeamType): Map<string, number> {
        const teamUnitHp: Map<string, number> = new Map();
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() === teamType) {
                teamUnitHp.set(unit.getId(), unit.getHp());
            }
        }

        return teamUnitHp;
    }

    public getAllTeamUnitsMaxHp(teamType: TeamType): Map<string, number> {
        const teamUnitMaxHp: Map<string, number> = new Map();
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() === teamType) {
                teamUnitMaxHp.set(unit.getId(), unit.getMaxHp());
            }
        }

        return teamUnitMaxHp;
    }

    public getAllEnemyUnitsMagicResist(myTeamType: TeamType): Map<string, number> {
        const enemyUnitMagicResist: Map<string, number> = new Map();
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() !== myTeamType) {
                enemyUnitMagicResist.set(unit.getId(), unit.getMagicResist());
            }
        }

        return enemyUnitMagicResist;
    }

    public getUnitByStats(unitProperties: UnitProperties): Unit | undefined {
        if (!unitProperties) {
            return undefined;
        }

        const unitId = unitProperties.id;
        if (!unitId) {
            return undefined;
        }

        return this.allUnits.get(unitId);
    }

    public refreshUnitsForAllTeams(): Unit[][] {
        const unitForAllTeams: Unit[][] = new Array((Object.keys(TeamType).length - 2) >> 1);
        for (const unit of this.allUnits.values()) {
            const teamId = unit.getTeam() - 1;
            if (!(teamId in unitForAllTeams)) {
                unitForAllTeams[teamId] = [];
            }
            unitForAllTeams[teamId].push(unit);
        }
        return unitForAllTeams;
    }

    public deleteUnitById(unitId: string, checkForResurrection = false): boolean {
        if (!unitId) {
            return false;
        }

        const unitToDelete = this.allUnits.get(unitId);
        let considerResurrection = checkForResurrection && unitToDelete?.hasAbilityActive("Resurrection");

        if (considerResurrection) {
            if (unitToDelete) {
                const newAmountAlive = Math.floor((unitToDelete.getAmountDied() ?? 0) / 2);
                if (newAmountAlive > 0) {
                    unitToDelete.increaseAmountAlive(newAmountAlive);
                    unitToDelete.decreaseAmountDied(newAmountAlive);
                    (unitToDelete as RenderableUnit).enqueueResurrectionAnimation();
                    unitToDelete.deleteAllEffects();
                    unitToDelete.deleteAllBuffs();
                    unitToDelete.deleteAllDebuffs();
                    unitToDelete.resetTarget();
                    unitToDelete.deleteAbility("Resurrection");
                } else {
                    considerResurrection = false;
                }
            } else {
                considerResurrection = false;
            }
        }

        if (!considerResurrection) {
            if (unitToDelete) {
                this.allUnits.delete(unitId);
                this.grid.cleanupAll(unitId, unitToDelete.getAttackRange(), unitToDelete.isSmallSize());
            }

            FightStateManager.getInstance().getFightProperties().removeFromHourGlassQueue(unitId);
            FightStateManager.getInstance().getFightProperties().removeFromMoraleMinusQueue(unitId);
            FightStateManager.getInstance().getFightProperties().removeFromMoralePlusQueue(unitId);

            if (FightStateManager.getInstance().getFightProperties().removeFromUpNext(unitId)) {
                const unitsUpper: Unit[] = [];
                const unitsLower: Unit[] = [];
                for (const u of this.getAllUnitsIterator()) {
                    if (u.getTeam() === TeamType.LOWER) {
                        unitsLower.push(u);
                    } else {
                        unitsUpper.push(u);
                    }
                }
                HoCLib.shuffle(unitsUpper);
                HoCLib.shuffle(unitsLower);
                FightStateManager.getInstance().prefetchNextUnitsToTurn(this.allUnits, unitsUpper, unitsLower);
            }

            return true;
        }

        return false;
    }

    public getSummonedUnitByName(teamType: TeamType, unitName: string): Unit | undefined {
        if (!unitName) {
            return undefined;
        }

        for (const u of this.getAllUnitsIterator()) {
            if (u.isSummoned() && u.getName() === unitName && u.getTeam() === teamType) {
                return u;
            }
        }

        return undefined;
    }

    public getDistanceToClosestEnemy(enemyTeam: TeamType, position: HoCMath.XY): number {
        let closestDistance = Number.MAX_SAFE_INTEGER;
        for (const u of this.getAllUnitsIterator()) {
            if (u.getTeam() === enemyTeam) {
                closestDistance = Math.min(closestDistance, HoCMath.getDistance(position, u.getPosition()));
            }
        }

        return closestDistance;
    }

    public allEnemiesAroundUnit(attacker: Unit, isAttack: boolean, attackFromCell?: HoCMath.XY): Unit[] {
        const enemyList: Unit[] = [];
        const firstCheckCell = isAttack ? attackFromCell : attacker.getBaseCell();

        if (!firstCheckCell) {
            return enemyList;
        }

        let checkCells: HoCMath.XY[];

        if (attacker.isSmallSize()) {
            // use either target move position on current
            // depending on the action type (attack vs response)
            checkCells = GridMath.getCellsAroundCell(this.gridSettings, firstCheckCell);
        } else {
            checkCells = [];
            for (let i = -2; i <= 1; i++) {
                for (let j = -2; j <= 1; j++) {
                    checkCells.push({ x: firstCheckCell.x + i, y: firstCheckCell.y + j });
                }
            }
        }

        for (const c of checkCells) {
            const checkUnitId = this.grid.getOccupantUnitId(c);
            if (checkUnitId) {
                const addUnit = this.getAllUnits().get(checkUnitId);
                if (
                    addUnit &&
                    checkUnitId !== attacker.getId() &&
                    !enemyList.includes(addUnit) &&
                    !(attacker.getTeam() === addUnit.getTeam())
                ) {
                    enemyList.push(addUnit);
                }
            }
        }

        return enemyList;
    }

    public refreshStackPowerForAllUnits(): void {
        FightStateManager.getInstance().setUnitsCalculatedStacksPower(this.gridSettings, this.allUnits);
        for (const u of this.getAllUnitsIterator()) {
            if (!GridMath.isCellWithinGrid(this.gridSettings, u.getBaseCell())) {
                continue;
            }
            u.adjustBaseStats(FightStateManager.getInstance().getFightProperties().getCurrentLap());
            u.increaseAttackMod(this.getUnitAuraAttackMod(u));
        }
    }

    public getUnitAuraAttackMod(unit: Unit, cells?: HoCMath.XY[]): number {
        let auraAttackMod = 0;
        const warAngerAuraEffect = unit.getAuraEffect("War Anger");
        if (warAngerAuraEffect) {
            const enemyIdsSpotted: string[] = [];
            const enemyIds: string[] = [];
            for (const e of this.getAllEnemyUnits(unit.getTeam())) {
                enemyIds.push(e.getId());
            }

            const unitCells = cells?.length ? cells : unit.getCells();

            for (const c of unitCells) {
                const auraCells = EffectHelper.getAuraCells(this.gridSettings, c, warAngerAuraEffect.getRange());
                for (const ac of auraCells) {
                    const occupantId = this.grid.getOccupantUnitId(ac);
                    if (!occupantId) {
                        continue;
                    }

                    if (enemyIds.includes(occupantId) && !enemyIdsSpotted.includes(occupantId)) {
                        enemyIdsSpotted.push(occupantId);
                    }
                }
            }

            return unit.getBaseAttack() * ((warAngerAuraEffect.getPower() * enemyIdsSpotted.length) / 100);
        }

        return auraAttackMod;
    }

    public refreshAuraEffectsForAllUnits(): void {
        // setup the initial empty maps
        this.teamsAuraEffects = new Map();
        for (let i = 0; i < (Object.keys(TeamType).length - 2) >> 1; i++) {
            this.teamsAuraEffects.set(i + 1, new Map());
        }

        // fill the maps with the aura effects, duplicate auras allowed
        for (const u of this.getAllUnitsIterator()) {
            if (!GridMath.isCellWithinGrid(this.gridSettings, u.getBaseCell())) {
                continue;
            }

            u.cleanAuraEffects();

            const unitAuraEffects = u.getAuraEffects();
            for (const uae of unitAuraEffects) {
                for (const c of u.getCells()) {
                    uae.toDefault();
                    const unitAuraEffectProperties = uae.getProperties();
                    if (unitAuraEffectProperties.power) {
                        unitAuraEffectProperties.power = u.calculateAuraPower(uae);
                    }

                    if (unitAuraEffectProperties.range < 0) {
                        continue;
                    }

                    const teamAuraEffects = this.teamsAuraEffects.get(
                        unitAuraEffectProperties.is_buff ? u.getTeam() : u.getOppositeTeam(),
                    );

                    if (!teamAuraEffects) {
                        continue;
                    }

                    const affectedCellKeys = EffectHelper.getAuraCellKeys(
                        this.gridSettings,
                        c,
                        unitAuraEffectProperties.range,
                    );
                    for (const ack of affectedCellKeys) {
                        if (!teamAuraEffects.has(ack)) {
                            teamAuraEffects.set(ack, []);
                        }

                        const teamAuraEffectsPerCell = teamAuraEffects.get(ack);
                        if (!teamAuraEffectsPerCell) {
                            continue;
                        }

                        const baseCell = u.getBaseCell();
                        if (!baseCell) {
                            continue;
                        }

                        teamAuraEffectsPerCell.push(
                            new AppliedAuraEffectProperties(unitAuraEffectProperties, baseCell),
                        );
                    }
                }
            }
        }

        // within the same team, squash aura effects where for the same auras, the one with bigger power will be applied
        for (const [team, cells] of this.teamsAuraEffects) {
            const newValue = new Map<number, AppliedAuraEffectProperties[]>();
            for (const [cellKey, appliedAuraEffects] of cells) {
                const auraEffectsMap = new Map<string, AppliedAuraEffectProperties>();
                for (const aae of appliedAuraEffects) {
                    const auraEffectProperties = aae.getAuraEffectProperties();
                    if (!auraEffectsMap.has(auraEffectProperties.name)) {
                        auraEffectsMap.set(auraEffectProperties.name, aae);
                    } else {
                        const existingAppliedAuraEffect = auraEffectsMap.get(auraEffectProperties.name);
                        if (!existingAppliedAuraEffect) {
                            continue;
                        }
                        const existingAuraEffectProperties = existingAppliedAuraEffect.getAuraEffectProperties();

                        if (auraEffectProperties.power > existingAuraEffectProperties.power) {
                            auraEffectsMap.set(auraEffectProperties.name, aae);
                        }
                    }
                }
                newValue.set(cellKey, Array.from(auraEffectsMap.values()));
            }
            this.teamsAuraEffects.set(team, newValue);
        }

        // apply aura effects to the units
        for (const u of this.getAllUnitsIterator()) {
            const teamAuraEffects = this.teamsAuraEffects.get(u.getTeam());
            if (!teamAuraEffects) {
                continue;
            }

            let unitAuraNamesToApply: string[] = [];
            let unitAppliedAuraEffectProperties: AppliedAuraEffectProperties[] = [];
            for (const c of u.getCells()) {
                const cellKey = (c.x << 4) | c.y;
                const appliedAuraEffects = teamAuraEffects.get(cellKey);
                if (!appliedAuraEffects || !appliedAuraEffects.length) {
                    continue;
                }

                for (const aae of appliedAuraEffects) {
                    const auraEffectProperties = aae.getAuraEffectProperties();
                    if (!unitAuraNamesToApply.includes(auraEffectProperties.name)) {
                        unitAuraNamesToApply.push(`${auraEffectProperties.name} Aura`);
                        unitAppliedAuraEffectProperties.push(aae);
                    }
                }
            }

            for (let i = 0; i < unitAppliedAuraEffectProperties.length; i++) {
                const appliedAuraEffectProperties = unitAppliedAuraEffectProperties[i];
                const auraEffectProperties = appliedAuraEffectProperties.getAuraEffectProperties();
                if (EffectHelper.canApplyAuraEffect(u.getAttackType(), auraEffectProperties)) {
                    u.applyAuraEffect(
                        `${auraEffectProperties.name} Aura`,
                        auraEffectProperties.desc.replace(/\{\}/g, auraEffectProperties.power.toString()),
                        auraEffectProperties.is_buff,
                        auraEffectProperties.power,
                        appliedAuraEffectProperties.getSourceCellAsString(),
                    );
                }
            }
        }
    }

    public addUnit(unit: Unit): void {
        this.allUnits.set(unit.getId(), unit);
    }

    public decreaseMoraleForTheSameUnitsOfTheTeam(unit: Unit): void {
        for (const u of this.getAllUnitsIterator()) {
            if (u.getTeam() === unit.getTeam() && u.getName() === unit.getName()) {
                u.decreaseMorale(HoCConstants.MORALE_CHANGE_FOR_KILL);
                u.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
            }
        }
    }

    public deleteUnitIfNotAllowed(
        teamType: TeamType,
        enemyTeamType: TeamType,
        unitProperties: UnitProperties,
        unitPosition: HoCMath.XY,
        lowerLeftPlacement?: SquarePlacement,
        upperRightPlacement?: SquarePlacement,
        lowerRightPlacement?: SquarePlacement,
        upperLeftPlacement?: SquarePlacement,
        verifyWithinGridPosition = true,
    ): boolean {
        const isLargeUnit = unitProperties.size === 2;
        const bodyPosition =
            isLargeUnit && teamType === TeamType.UPPER
                ? { x: unitPosition.x - 1, y: unitPosition.y - 1 }
                : unitPosition;
        const isWithinGrid = GridMath.isPositionWithinGrid(this.gridSettings, unitPosition);
        if (
            (enemyTeamType === TeamType.LOWER &&
                ((lowerLeftPlacement && lowerLeftPlacement.isAllowed(bodyPosition)) ||
                    (lowerRightPlacement && lowerRightPlacement.isAllowed(bodyPosition)))) ||
            (enemyTeamType === TeamType.UPPER &&
                ((upperRightPlacement && upperRightPlacement.isAllowed(bodyPosition)) ||
                    (upperLeftPlacement && upperLeftPlacement.isAllowed(bodyPosition)))) ||
            (isWithinGrid &&
                teamType === TeamType.LOWER &&
                !lowerLeftPlacement?.isAllowed(bodyPosition) &&
                !lowerRightPlacement?.isAllowed(bodyPosition)) ||
            (isWithinGrid &&
                teamType === TeamType.UPPER &&
                !upperRightPlacement?.isAllowed(bodyPosition) &&
                !upperLeftPlacement?.isAllowed(bodyPosition)) ||
            (verifyWithinGridPosition && !isWithinGrid)
        ) {
            return this.deleteUnitById(unitProperties.id);
        }

        return false;
    }
}
