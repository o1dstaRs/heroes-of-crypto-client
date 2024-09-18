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

import { b2Body, b2Fixture, b2Vec2, b2World, XY } from "@box2d/core";
import {
    AppliedSpell,
    AppliedAuraEffectProperties,
    FactionType,
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
import {
    BASE_UNIT_STACK_TO_SPAWN_EXP,
    DOUBLE_STEP,
    HALF_STEP,
    MAX_X,
    MAX_Y,
    SHIFT_UNITS_POSITION_Y,
    STEP,
    UNIT_SIZE_DELTA,
} from "../statics";
import { IUnitPropertiesProvider, Unit } from "./units";
import { UnitsFactory } from "./units_factory";

export class UnitsHolder {
    private readonly world: b2World;

    private readonly grid: Grid;

    private readonly unitsFactory: UnitsFactory;

    private readonly allUnits: Map<string, Unit> = new Map();

    private readonly allBodies: Map<string, b2Body>;

    private readonly gridSettings: GridSettings;

    private readonly unitIdToBodyFixtures: Map<string, b2Fixture[]>;

    private teamsAuraEffects: Map<TeamType, Map<number, AppliedAuraEffectProperties[]>>;

    public constructor(world: b2World, grid: Grid, unitsFactory: UnitsFactory) {
        this.world = world;
        this.grid = grid;
        this.gridSettings = grid.getSettings();
        this.unitsFactory = unitsFactory;
        this.unitIdToBodyFixtures = new Map();
        this.allBodies = new Map();
        this.teamsAuraEffects = new Map();
    }

    public refreshBarFixtures(unit: Unit, body?: b2Body): void {
        let bodyToUse = body;
        if (!bodyToUse) {
            bodyToUse = this.allBodies.get(unit.getId());
        }
        if (!bodyToUse) {
            return;
        }

        this.destroyBodyFixtures(unit.getId(), bodyToUse);
        for (const f of unit.getHpBarBoundFixtureDefs()) {
            if (GridMath.isPositionWithinGrid(this.gridSettings, bodyToUse.GetPosition())) {
                this.addBodyFixture(unit.getId(), bodyToUse.CreateFixture(f));
            }
        }
        for (const f of unit.getHpBarFixtureDefs()) {
            if (GridMath.isPositionWithinGrid(this.gridSettings, bodyToUse.GetPosition())) {
                this.addBodyFixture(unit.getId(), bodyToUse.CreateFixture(f));
            }
        }
    }

    public getUnitBody(unitId: string): b2Body | undefined {
        return this.allBodies.get(unitId);
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
                teamUnitCanFly.set(unit.getId(), unit.getCanFly());
            }
        }

        return teamUnitCanFly;
    }

    public getAllEnemyUnitsCanFly(teamType: TeamType): Map<string, boolean> {
        const enemyTeamUnitCanFly: Map<string, boolean> = new Map();
        for (const unit of this.allUnits.values()) {
            if (unit.getTeam() !== teamType) {
                enemyTeamUnitCanFly.set(unit.getId(), unit.getCanFly());
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

    public deleteUnitById(unitId: string, checkForResurrection = false): void {
        if (!unitId) {
            return;
        }

        const unitToDelete = this.allUnits.get(unitId);
        let considerResurrection = checkForResurrection && unitToDelete?.hasAbilityActive("Resurrection");

        if (considerResurrection) {
            if (unitToDelete) {
                const newAmountAlive = Math.floor((unitToDelete.getAmountDied() ?? 0) / 2);
                if (newAmountAlive > 0) {
                    unitToDelete.increaseAmountAlive(newAmountAlive);
                    unitToDelete.decreaseAmountDied(newAmountAlive);
                    unitToDelete.enqueueResurrectionAnimation();
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
            for (let b = this.world.GetBodyList(); b; b = b.GetNext()) {
                if (!b) {
                    continue;
                }
                const unitProperties = b.GetUserData();
                if (unitProperties && unitProperties.id === unitId) {
                    this.world.DestroyBody(b);
                    break;
                }
            }

            if (unitToDelete) {
                this.allUnits.delete(unitId);
                this.grid.cleanupAll(unitId, unitToDelete.getAttackRange(), unitToDelete.isSmallSize());
            }

            this.allBodies.delete(unitId);
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
        }
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

    public getDistanceToClosestEnemy(unitProperties: UnitProperties, position: XY): number {
        let closestDistance = Number.MAX_SAFE_INTEGER;
        for (const u of this.getAllUnitsIterator()) {
            if (u.getTeam() !== unitProperties.team) {
                closestDistance = Math.min(closestDistance, b2Vec2.Distance(position, u.getPosition()));
            }
        }

        return closestDistance;
    }

    public allEnemiesAroundUnit(attacker: Unit, isAttack: boolean, attackFromCell?: XY): Unit[] {
        const enemyList: Unit[] = [];
        const firstCheckCell = isAttack ? attackFromCell : attacker.getBaseCell();

        if (!firstCheckCell) {
            return enemyList;
        }

        let checkCells: XY[];

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

            this.refreshBarFixtures(u);
        }
    }

    public getUnitAuraAttackMod(unit: Unit, cells?: XY[]): number {
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
        enemyTeamType: TeamType,
        lowerLeftPlacement: SquarePlacement,
        upperRightPlacement: SquarePlacement,
        body: b2Body,
        lowerRightPlacement?: SquarePlacement,
        upperLeftPlacement?: SquarePlacement,
    ): void {
        if (
            (enemyTeamType === TeamType.LOWER &&
                (lowerLeftPlacement.isAllowed(body.GetPosition()) ||
                    (lowerRightPlacement && lowerRightPlacement.isAllowed(body.GetPosition())))) ||
            (enemyTeamType === TeamType.UPPER &&
                (upperRightPlacement.isAllowed(body.GetPosition()) ||
                    (upperLeftPlacement && upperLeftPlacement.isAllowed(body.GetPosition())))) ||
            !GridMath.isPositionWithinGrid(this.gridSettings, body.GetPosition())
        ) {
            this.deleteUnitById(body.GetUserData().id);
            this.world.DestroyBody(body);
        }
    }

    public spawnSelected(
        unitPropertiesProvider: IUnitPropertiesProvider,
        cell: XY,
        summoned: boolean,
        newAmount?: number,
    ): boolean {
        if (unitPropertiesProvider.getSize() === 1) {
            if (!this.grid.getOccupantUnitId(cell)) {
                const cloned = this.unitsFactory.makeCreature(
                    unitPropertiesProvider.getFaction(),
                    unitPropertiesProvider.getName(),
                    unitPropertiesProvider.getTeam(),
                    newAmount ? newAmount : unitPropertiesProvider.getAmountAlive(),
                    0,
                    summoned,
                );
                const position = GridMath.getPositionForCell(
                    cell,
                    this.gridSettings.getMinX(),
                    this.gridSettings.getStep(),
                    this.gridSettings.getHalfStep(),
                );
                cloned.setPosition(position.x, position.y);
                this.positionBody(cloned);

                return this.grid.occupyCell(cell, cloned.getId(), cloned.getTeam(), cloned.getAttackRange());
            }
        } else {
            const cells = [
                { x: cell.x - 1, y: cell.y },
                { x: cell.x, y: cell.y },
                { x: cell.x - 1, y: cell.y - 1 },
                { x: cell.x, y: cell.y - 1 },
            ];
            const allCellsAreEmpty = this.grid.areAllCellsEmpty(cells);
            if (!allCellsAreEmpty) {
                return false;
            }

            const cloned = this.unitsFactory.makeCreature(
                unitPropertiesProvider.getFaction(),
                unitPropertiesProvider.getName(),
                unitPropertiesProvider.getTeam(),
                newAmount ? newAmount : unitPropertiesProvider.getAmountAlive(),
                0,
                summoned,
            );

            const position = GridMath.getPositionForCell(
                cell,
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );
            cloned.setPosition(position.x - HALF_STEP, position.y - HALF_STEP);
            this.positionBody(cloned);

            return this.grid.occupyCells(cells, cloned.getId(), cloned.getTeam(), cloned.getAttackRange());
        }

        return false;
    }

    public spawn(team: TeamType, faction?: FactionType) {
        const units: Unit[] = [];
        const heroes: Unit[] = [];

        if (faction === FactionType.LIFE) {
            units.push(
                this.unitsFactory.makeCreature(FactionType.LIFE, "Squire", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.LIFE, "Peasant", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.LIFE, "Arbalester", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.LIFE, "Pikeman", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.LIFE, "Valkyrie", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.LIFE, "Healer", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.LIFE, "Crusader", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.LIFE, "Griffin", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.LIFE, "Tsar Cannon", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.LIFE, "Angel", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
        } else if (faction === FactionType.NATURE) {
            // heroes.push(this.unitsFactory.makeHero(FactionType.NATURE, team, HeroType.MAGICIAN, HeroGender.MALE));
            // heroes.push(this.unitsFactory.makeHero(FactionType.NATURE, team, HeroType.MAGICIAN, HeroGender.MALE));
            // heroes.push(this.unitsFactory.makeHero(FactionType.NATURE, team, HeroType.MAGICIAN, HeroGender.MALE));
            units.push(
                this.unitsFactory.makeCreature(FactionType.NATURE, "Fairy", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.NATURE, "Wolf", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.NATURE, "Leprechaun", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(
                    FactionType.NATURE,
                    "White Tiger",
                    team,
                    0,
                    BASE_UNIT_STACK_TO_SPAWN_EXP,
                ),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.NATURE, "Elf", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.NATURE, "Satyr", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.NATURE, "Unicorn", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.NATURE, "Mantis", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            // units.push(
            //     this.unitsFactory.makeCreature(
            //         FactionType.NATURE,
            //         "Faerie Dragon",
            //         team,
            //         0,
            //         BASE_UNIT_STACK_TO_SPAWN_EXP,
            //     ),
            // );
            units.push(
                this.unitsFactory.makeCreature(FactionType.NATURE, "Gargantuan", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.NATURE, "Pegasus", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
        } else if (faction === FactionType.CHAOS) {
            units.push(
                this.unitsFactory.makeCreature(FactionType.CHAOS, "Scavenger", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(this.unitsFactory.makeCreature(FactionType.CHAOS, "Orc", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(
                this.unitsFactory.makeCreature(FactionType.CHAOS, "Troglodyte", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.CHAOS, "Medusa", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.CHAOS, "Troll", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.CHAOS, "Beholder", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.CHAOS, "Efreet", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(
                    FactionType.CHAOS,
                    "Goblin Knight",
                    team,
                    0,
                    BASE_UNIT_STACK_TO_SPAWN_EXP,
                ),
            );
            units.push(
                this.unitsFactory.makeCreature(
                    FactionType.CHAOS,
                    "Black Dragon",
                    team,
                    0,
                    BASE_UNIT_STACK_TO_SPAWN_EXP,
                ),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.CHAOS, "Hydra", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            // units.push(
            //     this.unitsFactory.makeCreature(FactionType.CHAOS, "Abomination", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            // );
        } else if (faction === FactionType.DEATH) {
            units.push(
                this.unitsFactory.makeCreature(FactionType.DEATH, "Skeleton", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(this.unitsFactory.makeCreature(FactionType.DEATH, "Imp", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP));
            units.push(
                this.unitsFactory.makeCreature(FactionType.DEATH, "Zombie", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(
                    FactionType.DEATH,
                    "Dark Champion",
                    team,
                    0,
                    BASE_UNIT_STACK_TO_SPAWN_EXP,
                ),
            );
        } else if (faction === FactionType.MIGHT) {
            units.push(
                this.unitsFactory.makeCreature(FactionType.MIGHT, "Berserker", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.MIGHT, "Centaur", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.MIGHT, "Wolf Rider", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.MIGHT, "Nomad", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.MIGHT, "Harpy", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.MIGHT, "Hyena", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.MIGHT, "Ogre Mage", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(FactionType.MIGHT, "Cyclops", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            // units.push(
            //     this.unitsFactory.makeCreature(FactionType.MIGHT, "Thunderbird", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            // );
            units.push(
                this.unitsFactory.makeCreature(FactionType.MIGHT, "Behemoth", team, 0, BASE_UNIT_STACK_TO_SPAWN_EXP),
            );
            units.push(
                this.unitsFactory.makeCreature(
                    FactionType.MIGHT,
                    "Frenzied Boar",
                    team,
                    0,
                    BASE_UNIT_STACK_TO_SPAWN_EXP,
                ),
            );
        }

        let posIndex = SHIFT_UNITS_POSITION_Y;

        // spawn small units
        let subtrahend = 0;
        let foundSomeSmallUnits = false;
        let prevUnitLevel = 0;
        let j = 0;
        let yDiff = 0;
        for (let i = 0; i < units.length; i++) {
            const u = units[i];
            if (!u.isSmallSize()) {
                subtrahend++;
                continue;
            }

            if (prevUnitLevel === u.getLevel()) {
                if (j > 1) {
                    j -= 2;
                    yDiff -= 1;
                }
            } else {
                if (prevUnitLevel && j === 2) {
                    yDiff -= 1;
                }
                j = 0;
            }

            posIndex = i - subtrahend + yDiff - j + SHIFT_UNITS_POSITION_Y;
            if (team === TeamType.LOWER) {
                u.setPosition(-MAX_X - HALF_STEP - STEP * j, posIndex * STEP + HALF_STEP);
            } else {
                u.setPosition(
                    MAX_X + HALF_STEP - UNIT_SIZE_DELTA + STEP * j,
                    MAX_Y - posIndex * STEP - UNIT_SIZE_DELTA - HALF_STEP,
                );
            }
            foundSomeSmallUnits = true;
            this.positionBody(u);
            prevUnitLevel = u.getLevel();
            j++;
        }

        if (foundSomeSmallUnits) {
            posIndex++;
        }

        let heroPosIndex = 0;
        for (const h of heroes) {
            if (team === TeamType.LOWER) {
                h.setPosition(-MAX_X - STEP * heroPosIndex - HALF_STEP, DOUBLE_STEP + HALF_STEP);
            } else {
                h.setPosition(MAX_X + STEP * heroPosIndex + HALF_STEP, MAX_Y - DOUBLE_STEP - HALF_STEP);
            }
            heroPosIndex++;

            this.positionBody(h);
        }

        for (const u of units) {
            if (u.isSmallSize()) {
                continue;
            }

            if (team === TeamType.LOWER) {
                u.setPosition(-MAX_X - STEP, posIndex * STEP + STEP);
            } else {
                u.setPosition(MAX_X + STEP, MAX_Y - posIndex * STEP - STEP);
            }
            posIndex += 2;

            this.positionBody(u);
        }
    }

    private addBodyFixture(unitId: string, fixture: b2Fixture): void {
        const fixtures = this.unitIdToBodyFixtures.get(unitId);
        if (fixtures) {
            fixtures.push(fixture);
        } else {
            this.unitIdToBodyFixtures.set(unitId, [fixture]);
        }
    }

    private destroyBodyFixtures(unitId: string, body: b2Body) {
        const fixtures = this.unitIdToBodyFixtures.get(unitId);
        if (fixtures) {
            for (const f of fixtures) {
                body.DestroyFixture(f);
            }
        }
        this.unitIdToBodyFixtures.delete(unitId);
    }

    private positionBody(unit: Unit): void {
        if (this.allBodies.get(unit.getId())) {
            return;
        }

        const body = this.world.CreateBody(unit.getBodyDef());
        body.CreateFixture(unit.getFixtureDef());
        this.refreshBarFixtures(unit, body);
        this.allUnits.set(unit.getId(), unit);
        this.allBodies.set(unit.getId(), body);
    }
}
