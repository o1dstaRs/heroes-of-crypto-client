import { createHash } from "node:crypto";

import {
    AI,
    AttackVals,
    GridMath,
    SpellHelper,
    SpellPowerType,
    SpellTargetType,
    type AttackHandler,
    type FightProperties,
    type GameAction,
    type Grid,
    type IWeightedRoute,
    type PathHelper,
    type Spell,
    type Unit,
    type UnitsHolder,
} from "@heroesofcrypto/common";

import { teamToName } from "./serializers";
import type { LegalAction } from "./types";

const actionId = (matchId: string, stateVersion: number, action: GameAction): string => {
    const hash = createHash("sha256");
    hash.update(matchId);
    hash.update(":");
    hash.update(String(stateVersion));
    hash.update(":");
    hash.update(JSON.stringify(action));
    return hash.digest("hex").slice(0, 16);
};

const hasAttackType = (unit: Unit, attackType: number): boolean => unit.getPossibleAttackTypes().includes(attackType);

const cellKey = (cell: { x: number; y: number }): number => (cell.x << 4) | cell.y;

const createAction = (
    matchId: string,
    stateVersion: number,
    unit: Unit,
    summary: string,
    action: GameAction,
    tacticalTags: string[] = [],
    risks: string[] = [],
    evaluation?: LegalAction["evaluation"],
): LegalAction => ({
    id: actionId(matchId, stateVersion, action),
    kind: action.type,
    team: teamToName(unit.getTeam()),
    unitId: unit.getId(),
    summary,
    action,
    tacticalTags,
    risks,
    evaluation,
});

const addUniqueAction = (
    actions: LegalAction[],
    action: LegalAction,
    knownPathsByActionId: Map<string, Map<number, IWeightedRoute[]>>,
    knownPaths?: Map<number, IWeightedRoute[]>,
): void => {
    if (actions.some((candidate) => candidate.id === action.id)) {
        return;
    }
    actions.push(action);
    if (knownPaths) {
        knownPathsByActionId.set(action.id, knownPaths);
    }
};

const getRouteForCell = (
    knownPaths: Map<number, IWeightedRoute[]>,
    cell: { x: number; y: number },
): IWeightedRoute | undefined => knownPaths.get(cellKey(cell))?.[0];

const getTargetCells = (
    unit: Unit,
    grid: Grid,
    destination: { x: number; y: number },
): Array<{ x: number; y: number }> => {
    if (unit.isSmallSize()) {
        return [{ ...destination }];
    }

    const gridSettings = grid.getSettings();
    const position = GridMath.getPositionForCell(
        destination,
        gridSettings.getMinX(),
        gridSettings.getStep(),
        gridSettings.getHalfStep(),
    );
    position.x -= gridSettings.getHalfStep();
    position.y -= gridSettings.getHalfStep();
    return GridMath.getCellsAroundPosition(gridSettings, position);
};

const estimateUnitValue = (unit: Unit): number =>
    Math.round(
        unit.getStackPower() +
            unit.getLevel() * 12 +
            unit.getSpeed() * 4 +
            unit.getAttack() * 0.5 +
            unit.getAttackDamageMax() * 2 +
            unit.getRangeShots() * 2 +
            unit.getSpells().length * 18 +
            unit.getAbilities().length * 6,
    );

const getTargetTotalHp = (unit: Unit): number => (unit.getAmountAlive() - 1) * unit.getMaxHp() + unit.getHp();

const enumName = (enumLike: Record<string, string | number>, value: number): string => {
    const name = enumLike[value];
    return typeof name === "string" ? name : String(value);
};

const isMassSpell = (spell: Spell): boolean =>
    spell.getSpellTargetType() === SpellTargetType.ALL_FLYING ||
    spell.getSpellTargetType() === SpellTargetType.ALL_ALLIES ||
    spell.getSpellTargetType() === SpellTargetType.ALL_ENEMIES;

const canUseSpell = (caster: Unit, spell: Spell): boolean =>
    spell.getLapsTotal() > 0 && spell.isRemaining() && spell.getMinimalCasterStackPower() <= caster.getStackPower();

const createAttackEvaluation = (
    attacker: Unit,
    target: Unit,
    fightProperties: FightProperties,
    opts: { isRange: boolean; divisor?: number; retaliation?: boolean },
): LegalAction["evaluation"] => {
    const divisor = opts.divisor ?? 1;
    const abilityPowerIncrease = fightProperties.getAdditionalAbilityPowerPerTeam(attacker.getTeam());
    const minDamage = attacker.calculateAttackDamageMin(
        attacker.getAttack(),
        target,
        opts.isRange,
        abilityPowerIncrease,
        divisor,
    );
    const maxDamage = attacker.calculateAttackDamageMax(
        attacker.getAttack(),
        target,
        opts.isRange,
        abilityPowerIncrease,
        divisor,
    );
    const targetTotalHp = getTargetTotalHp(target);
    const killsTarget = maxDamage >= targetTotalHp;
    const targetValue = estimateUnitValue(target);
    const damagePressure = targetTotalHp > 0 ? Math.min(1, maxDamage / targetTotalHp) : 1;
    const priorityScore = Math.round(
        targetValue * Math.min(1, 0.25 + damagePressure) +
            maxDamage * 0.8 +
            (killsTarget ? 60 : 0) -
            (opts.retaliation ? 10 : 0),
    );

    return {
        targetId: target.getId(),
        targetName: target.getName(),
        targetValue,
        priorityScore,
        damage: {
            min: minDamage,
            max: maxDamage,
            targetTotalHp,
            killsTarget,
        },
        retaliation: opts.retaliation,
        notes: [
            ...(killsTarget ? ["lethal"] : []),
            ...(target.getRangeShots() > 0 ? ["target has ranged pressure"] : []),
            ...(target.getSpells().length ? ["target can cast spells"] : []),
        ],
    };
};

const estimateSpellValue = (
    caster: Unit,
    spell: Spell,
    target: Unit | undefined,
    affectedUnits: Unit[] = target ? [target] : [],
): number => {
    const targetType = spell.getSpellTargetType();
    const powerType = spell.getPowerType();
    const basePower = spell.getPower();

    if (spell.isSummon()) {
        return Math.max(30, Math.floor(caster.getAmountAlive() * basePower * 14));
    }

    if (powerType === SpellPowerType.HEAL) {
        const totalMissingHp = affectedUnits.reduce(
            (total, unit) => total + Math.max(0, getTargetTotalHp(unit) - unit.getHp()),
            0,
        );
        const healCap = Math.max(0, Math.floor(basePower * caster.getAmountAlive()));
        return Math.min(totalMissingHp || healCap, healCap * Math.max(1, affectedUnits.length));
    }

    if (powerType === SpellPowerType.RESURRECT && target) {
        return Math.max(0, target.getAmountDied() * target.getMaxHp());
    }

    if (targetType === SpellTargetType.ALL_ALLIES || targetType === SpellTargetType.ALL_ENEMIES) {
        return affectedUnits.reduce((total, unit) => total + Math.max(20, estimateUnitValue(unit) * 0.2), 0);
    }

    if (targetType === SpellTargetType.ALL_FLYING) {
        return affectedUnits
            .filter((unit) => unit.canFly())
            .reduce((total, unit) => total + Math.max(15, estimateUnitValue(unit) * 0.18), 0);
    }

    if (target) {
        const polarity = spell.isBuff() ? 0.18 : 0.28;
        return Math.max(25, estimateUnitValue(target) * polarity + basePower);
    }

    return Math.max(15, basePower);
};

const createSpellEvaluation = (
    caster: Unit,
    spell: Spell,
    target?: Unit,
    affectedUnits: Unit[] = target ? [target] : [],
): LegalAction["evaluation"] => {
    const estimatedValue = Math.round(estimateSpellValue(caster, spell, target, affectedUnits));
    const targetValue = target ? estimateUnitValue(target) : undefined;
    const priorityScore = Math.round(
        estimatedValue +
            (targetValue ?? 0) * (spell.isBuff() ? 0.12 : 0.2) +
            (isMassSpell(spell) ? affectedUnits.length * 18 : 0),
    );

    return {
        targetId: target?.getId(),
        targetName: target?.getName(),
        targetValue,
        priorityScore,
        spell: {
            name: spell.getName(),
            targetType: enumName(SpellTargetType, spell.getSpellTargetType()),
            powerType: enumName(SpellPowerType, spell.getPowerType()),
            power: spell.getPower(),
            laps: spell.getLapsTotal(),
            remaining: spell.getAmount(),
            isBuff: spell.isBuff(),
            isMass: isMassSpell(spell),
            isSummon: spell.isSummon(),
            estimatedValue,
        },
        notes: [
            spell.isBuff() ? "benefits allied tempo" : "disrupts enemy tempo",
            ...(isMassSpell(spell)
                ? [`affects ${affectedUnits.length} unit${affectedUnits.length === 1 ? "" : "s"}`]
                : []),
            ...(spell.isSummon() ? ["creates a new board body"] : []),
        ],
    };
};

export const getEnemiesWithinMovementRange = (
    activeUnit: Unit,
    grid: Grid,
    unitsHolder: UnitsHolder,
    pathHelper: PathHelper,
): Array<{ x: number; y: number }> | undefined => {
    if (!activeUnit.canMove()) {
        return undefined;
    }

    const currentCell = activeUnit.getBaseCell();
    const moveCells = pathHelper.getMovePath(
        currentCell,
        grid.getMatrixNoUnits(),
        activeUnit.getSteps(),
        undefined,
        activeUnit.canFly(),
        activeUnit.isSmallSize(),
        activeUnit.hasAbilityActive("Made of Fire"),
    ).cells;
    const enemies: Array<{ x: number; y: number }> = [];

    for (const cell of moveCells) {
        const enemyId = grid.getOccupantUnitId(cell);
        const enemy = enemyId ? unitsHolder.getAllUnits().get(enemyId) : undefined;
        if (enemy && enemy.getTeam() !== activeUnit.getTeam() && enemy.isSmallSize() && !enemy.isDead()) {
            enemies.push(enemy.getBaseCell());
        }
    }

    return enemies.length ? enemies : undefined;
};

export const getAvailableSummonCells = (caster: Unit, grid: Grid, spell: Spell): Array<{ x: number; y: number }> => {
    const candidates = GridMath.getCellsAroundCell(grid.getSettings(), caster.getBaseCell());
    return candidates.filter((cell) => SpellHelper.canCastSummon(spell, grid.getMatrix(), cell));
};

const createSpellActions = (
    options: LegalActionOptions,
    actions: LegalAction[],
    knownPathsByActionId: Map<string, Map<number, IWeightedRoute[]>>,
): void => {
    const { activeUnit, grid, matchId, pathHelper, stateVersion, unitsHolder } = options;
    const activeUnitId = activeUnit.getId();
    const allies = unitsHolder.getAllAllies(activeUnit.getTeam()).filter((unit) => !unit.isDead());
    const enemies = unitsHolder.getAllEnemyUnits(activeUnit.getTeam()).filter((unit) => !unit.isDead());
    const movementRangeEnemies = getEnemiesWithinMovementRange(activeUnit, grid, unitsHolder, pathHelper);

    for (const spell of activeUnit.getSpells()) {
        if (!canUseSpell(activeUnit, spell)) {
            continue;
        }

        const targetType = spell.getSpellTargetType();
        const spellName = spell.getName();

        if (isMassSpell(spell)) {
            if (
                !SpellHelper.canMassCastSpell(
                    spell,
                    unitsHolder.getAllTeamUnitsBuffs(activeUnit.getTeam()),
                    unitsHolder.getAllEnemyUnitsBuffs(activeUnit.getTeam()),
                    unitsHolder.getAllEnemyUnitsDebuffs(activeUnit.getTeam()),
                    unitsHolder.getAllTeamUnitsMagicResist(activeUnit.getTeam()),
                    unitsHolder.getAllEnemyUnitsMagicResist(activeUnit.getTeam()),
                    unitsHolder.getAllTeamUnitsHp(activeUnit.getTeam()),
                    unitsHolder.getAllTeamUnitsMaxHp(activeUnit.getTeam()),
                    unitsHolder.getAllTeamUnitsCanFly(activeUnit.getTeam()),
                    unitsHolder.getAllEnemyUnitsCanFly(activeUnit.getTeam()),
                )
            ) {
                continue;
            }

            const affectedUnits =
                targetType === SpellTargetType.ALL_ENEMIES
                    ? enemies
                    : targetType === SpellTargetType.ALL_ALLIES
                      ? allies
                      : [...allies, ...enemies].filter((unit) => unit.canFly());
            const action: GameAction = { type: "cast_spell", casterId: activeUnitId, spellName };
            addUniqueAction(
                actions,
                createAction(
                    matchId,
                    stateVersion,
                    activeUnit,
                    `${activeUnit.getName()} casts ${spellName}`,
                    action,
                    ["magic", spell.isBuff() ? "support" : "control"],
                    [],
                    createSpellEvaluation(activeUnit, spell, undefined, affectedUnits),
                ),
                knownPathsByActionId,
            );
            continue;
        }

        if (spell.isSummon() && targetType === SpellTargetType.RANDOM_CLOSE_TO_CASTER) {
            for (const targetCell of getAvailableSummonCells(activeUnit, grid, spell)) {
                const action: GameAction = {
                    type: "cast_spell",
                    casterId: activeUnitId,
                    spellName,
                    targetCell: { ...targetCell },
                };
                addUniqueAction(
                    actions,
                    createAction(
                        matchId,
                        stateVersion,
                        activeUnit,
                        `${activeUnit.getName()} casts ${spellName} at ${targetCell.x},${targetCell.y}`,
                        action,
                        ["magic", "summon", "positioning"],
                        [],
                        createSpellEvaluation(activeUnit, spell),
                    ),
                    knownPathsByActionId,
                );
            }
            continue;
        }

        const targetPool =
            targetType === SpellTargetType.ANY_ALLY
                ? allies
                : targetType === SpellTargetType.ANY_ENEMY || targetType === SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE
                  ? enemies
                  : [];

        for (const target of targetPool) {
            if (
                SpellHelper.canCastSpell(
                    false,
                    grid.getSettings(),
                    grid.getMatrix(),
                    activeUnit,
                    target,
                    spell,
                    target.getBaseCell(),
                    target.getMagicResist(),
                    target.hasMindAttackResistance(),
                    target.canBeHealed(),
                    movementRangeEnemies,
                )
            ) {
                const action: GameAction = {
                    type: "cast_spell",
                    casterId: activeUnitId,
                    spellName,
                    targetId: target.getId(),
                    targetCell: { ...target.getBaseCell() },
                };
                addUniqueAction(
                    actions,
                    createAction(
                        matchId,
                        stateVersion,
                        activeUnit,
                        `${activeUnit.getName()} casts ${spellName} on ${target.getName()}`,
                        action,
                        ["magic", spell.isBuff() ? "support" : "control"],
                        target.getMagicResist() > 0 ? [`target has ${target.getMagicResist()} magic resist`] : [],
                        createSpellEvaluation(activeUnit, spell, target),
                    ),
                    knownPathsByActionId,
                );
            }
        }
    }
};

const createMoveActionFromAi = (
    matchId: string,
    stateVersion: number,
    activeUnit: Unit,
    grid: Grid,
    aiAction: AI.IAIAction,
): { legalAction: LegalAction; knownPaths: Map<number, IWeightedRoute[]> } | undefined => {
    const destination = aiAction.cellToMove();
    if (!destination || !activeUnit.canMove()) {
        return undefined;
    }

    const knownPaths = aiAction.currentActiveKnownPaths();
    const route = getRouteForCell(knownPaths, destination);
    if (!route?.route.length) {
        return undefined;
    }

    const action: GameAction = {
        type: "move_unit",
        unitId: activeUnit.getId(),
        path: route.route.map((cell) => ({ ...cell })),
        targetCells: getTargetCells(activeUnit, grid, destination),
        hasLavaCell: route.hasLavaCell,
        hasWaterCell: route.hasWaterCell,
    };

    return {
        legalAction: createAction(
            matchId,
            stateVersion,
            activeUnit,
            `${activeUnit.getName()} moves to ${destination.x},${destination.y}`,
            action,
            ["movement", "positioning"],
        ),
        knownPaths,
    };
};

const createMoveAndMeleeActionFromAi = (
    matchId: string,
    stateVersion: number,
    activeUnit: Unit,
    fightProperties: FightProperties,
    grid: Grid,
    unitsHolder: UnitsHolder,
    aiAction: AI.IAIAction,
): { legalAction: LegalAction; knownPaths: Map<number, IWeightedRoute[]> } | undefined => {
    const attackFrom = aiAction.cellToMove();
    const cellToAttack = aiAction.cellToAttack();
    if (!attackFrom || !cellToAttack) {
        return undefined;
    }

    const targetUnitId = grid.getOccupantUnitId(cellToAttack);
    const targetUnit = targetUnitId ? unitsHolder.getAllUnits().get(targetUnitId) : undefined;
    if (!targetUnit || targetUnit.isDead()) {
        return undefined;
    }

    const knownPaths = aiAction.currentActiveKnownPaths();
    const route = getRouteForCell(knownPaths, attackFrom);
    const action: GameAction = {
        type: "melee_attack",
        attackerId: activeUnit.getId(),
        targetId: targetUnit.getId(),
        attackFrom: { ...attackFrom },
        path: route?.route.map((cell) => ({ ...cell })),
        hasLavaCell: route?.hasLavaCell,
        hasWaterCell: route?.hasWaterCell,
    };

    return {
        legalAction: createAction(
            matchId,
            stateVersion,
            activeUnit,
            `${activeUnit.getName()} moves to strike ${targetUnit.getName()}`,
            action,
            ["movement", "damage"],
            targetUnit.canRespond(activeUnit.getAttackTypeSelection()) ? ["may draw a retaliation"] : [],
            createAttackEvaluation(activeUnit, targetUnit, fightProperties, {
                isRange: false,
                retaliation: targetUnit.canRespond(activeUnit.getAttackTypeSelection()),
            }),
        ),
        knownPaths,
    };
};

export interface LegalActionOptions {
    matchId: string;
    stateVersion: number;
    activeUnit: Unit;
    grid: Grid;
    unitsHolder: UnitsHolder;
    attackHandler: AttackHandler;
    fightProperties: FightProperties;
    pathHelper: PathHelper;
}

export interface LegalActionBundle {
    actions: LegalAction[];
    knownPathsByActionId: Map<string, Map<number, IWeightedRoute[]>>;
}

const createAiAction = (
    options: LegalActionOptions,
): { legalAction: LegalAction; knownPaths?: Map<number, IWeightedRoute[]> } | undefined => {
    const { activeUnit, grid, matchId, pathHelper, stateVersion, unitsHolder } = options;
    const aiAction = AI.findTarget(activeUnit, grid, grid.getMatrix(), unitsHolder, pathHelper);
    if (!aiAction) {
        return undefined;
    }

    if (aiAction.actionType() === AI.AIActionType.MOVE) {
        return createMoveActionFromAi(matchId, stateVersion, activeUnit, grid, aiAction);
    }

    if (aiAction.actionType() === AI.AIActionType.MOVE_AND_MELEE_ATTACK) {
        return createMoveAndMeleeActionFromAi(
            matchId,
            stateVersion,
            activeUnit,
            options.fightProperties,
            grid,
            unitsHolder,
            aiAction,
        );
    }

    return undefined;
};

export const createLegalActionBundle = (options: LegalActionOptions): LegalActionBundle => {
    const { activeUnit, attackHandler, fightProperties, grid, matchId, stateVersion, unitsHolder } = options;
    const canLandRangeAttack = attackHandler.canLandRangeAttack(
        activeUnit,
        grid.getEnemyAggrMatrixByUnitId(activeUnit.getId()),
    );
    const selectedBeforeRefresh = activeUnit.getAttackTypeSelection();
    activeUnit.refreshPossibleAttackTypes(canLandRangeAttack);
    if (activeUnit.getPossibleAttackTypes().includes(selectedBeforeRefresh)) {
        activeUnit.selectAttackType(selectedBeforeRefresh);
    }

    const actions: LegalAction[] = [];
    const knownPathsByActionId: Map<string, Map<number, IWeightedRoute[]>> = new Map();
    const activeUnitId = activeUnit.getId();
    const adjacentEnemies = unitsHolder
        .allEnemiesAroundUnit(activeUnit, true, activeUnit.getBaseCell())
        .filter((unit) => !unit.isDead());
    const enemies = unitsHolder.getAllEnemyUnits(activeUnit.getTeam()).filter((unit) => !unit.isDead());

    for (const attackType of activeUnit.getPossibleAttackTypes()) {
        if (attackType !== activeUnit.getAttackTypeSelection()) {
            addUniqueAction(
                actions,
                createAction(
                    matchId,
                    stateVersion,
                    activeUnit,
                    `Switch ${activeUnit.getName()} to ${AttackVals[attackType].toLowerCase().replaceAll("_", " ")}`,
                    { type: "select_attack_type", unitId: activeUnitId, attackType },
                    ["setup"],
                ),
                knownPathsByActionId,
            );
        }
    }

    if (hasAttackType(activeUnit, AttackVals.MELEE) || hasAttackType(activeUnit, AttackVals.MELEE_MAGIC)) {
        const selectedMelee =
            activeUnit.getAttackTypeSelection() === AttackVals.MELEE ||
            activeUnit.getAttackTypeSelection() === AttackVals.MELEE_MAGIC;
        if (selectedMelee) {
            for (const enemy of adjacentEnemies) {
                const action: GameAction = {
                    type: "melee_attack",
                    attackerId: activeUnitId,
                    targetId: enemy.getId(),
                    attackFrom: { ...activeUnit.getBaseCell() },
                };
                addUniqueAction(
                    actions,
                    createAction(
                        matchId,
                        stateVersion,
                        activeUnit,
                        `${activeUnit.getName()} attacks ${enemy.getName()} in melee`,
                        action,
                        ["damage", "adjacent"],
                        enemy.canRespond(activeUnit.getAttackTypeSelection()) ? ["may draw a retaliation"] : [],
                        createAttackEvaluation(activeUnit, enemy, fightProperties, {
                            isRange: false,
                            retaliation: enemy.canRespond(activeUnit.getAttackTypeSelection()),
                        }),
                    ),
                    knownPathsByActionId,
                );
            }
        }
    }

    if (activeUnit.getAttackTypeSelection() === AttackVals.RANGE && canLandRangeAttack) {
        for (const enemy of enemies) {
            const divisor = attackHandler.getRangeAttackDivisor(activeUnit, enemy.getPosition());
            const action: GameAction = { type: "range_attack", attackerId: activeUnitId, targetId: enemy.getId() };
            addUniqueAction(
                actions,
                createAction(
                    matchId,
                    stateVersion,
                    activeUnit,
                    `${activeUnit.getName()} shoots ${enemy.getName()}`,
                    action,
                    ["damage", "ranged"],
                    [],
                    createAttackEvaluation(activeUnit, enemy, fightProperties, {
                        isRange: true,
                        divisor,
                        retaliation: false,
                    }),
                ),
                knownPathsByActionId,
            );
        }
    }

    createSpellActions(options, actions, knownPathsByActionId);

    const aiAction = createAiAction(options);
    if (aiAction) {
        addUniqueAction(actions, aiAction.legalAction, knownPathsByActionId, aiAction.knownPaths);
    }

    if (
        fightProperties.getTeamUnitsAlive(activeUnit.getTeam()) > 1 &&
        !fightProperties.hourglassIncludes(activeUnitId) &&
        !fightProperties.hasAlreadyMadeTurn(activeUnitId) &&
        !fightProperties.hasAlreadyHourglass(activeUnitId)
    ) {
        addUniqueAction(
            actions,
            createAction(
                matchId,
                stateVersion,
                activeUnit,
                `${activeUnit.getName()} waits for a later slot`,
                { type: "wait_turn", unitId: activeUnitId },
                ["tempo"],
            ),
            knownPathsByActionId,
        );
    }

    addUniqueAction(
        actions,
        createAction(
            matchId,
            stateVersion,
            activeUnit,
            `${activeUnit.getName()} uses Luck Shield`,
            { type: "defend_turn", unitId: activeUnitId },
            ["defense"],
        ),
        knownPathsByActionId,
    );
    addUniqueAction(
        actions,
        createAction(
            matchId,
            stateVersion,
            activeUnit,
            `${activeUnit.getName()} ends the turn`,
            { type: "end_turn", unitId: activeUnitId, reason: "manual" },
            ["tempo"],
            ["passes initiative"],
        ),
        knownPathsByActionId,
    );

    return { actions, knownPathsByActionId };
};

export const createLegalActions = (options: LegalActionOptions): LegalAction[] =>
    createLegalActionBundle(options).actions;
