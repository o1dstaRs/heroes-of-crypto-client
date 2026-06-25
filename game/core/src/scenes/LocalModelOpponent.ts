import {
    AI,
    AttackVals,
    FightStateManager,
    GridMath,
    SpellHelper,
    SpellPowerType,
    SpellTargetType,
    TeamVals,
    type AttackHandler,
    type FightProperties,
    type GameAction,
    type Grid,
    type IWeightedRoute,
    type PathHelper,
    type Spell,
    type TeamType,
    type Unit,
    type UnitsHolder,
} from "@heroesofcrypto/common";

export interface LocalModelLegalAction {
    id: string;
    label: string;
    index: number;
    kind: GameAction["type"];
    summary: string;
    action: GameAction;
    tacticalTags: string[];
    risks: string[];
    evaluation?: {
        targetName?: string;
        targetValue?: number;
        priorityScore?: number;
        damage?: {
            min: number;
            max: number;
            targetTotalHp: number;
            killsTarget: boolean;
        };
        retaliation?: boolean;
        spell?: {
            name: string;
            targetType: string;
            powerType: string;
            estimatedValue: number;
            remaining: number;
            isMass: boolean;
            isSummon: boolean;
        };
        notes?: string[];
    };
}

export interface LocalModelActionOptions {
    matchId: string;
    stateVersion: number;
    activeUnit: Unit;
    grid: Grid;
    unitsHolder: UnitsHolder;
    attackHandler: AttackHandler;
    fightProperties: FightProperties;
    pathHelper: PathHelper;
    allowAttackTypeSetup?: boolean;
}

export interface LocalModelOpponentConfig {
    enabled: boolean;
    modelTeam: TeamType;
    apiBase: string;
    modelName: string;
    authorization?: string;
    playerId?: string;
    style: "balanced" | "aggressive" | "defensive";
}

export interface LocalModelFightStateSummary {
    lap: number;
    activeUnitId: string;
    units: Array<{
        id: string;
        team: string;
        name: string;
        attackType: string;
        cells: string[];
        hp: number;
        maxHp: number;
        amountAlive: number;
        amountDied: number;
        speed: number;
        rangeShots: number;
        abilities: string[];
        spells: Array<{ name: string; remaining: number }>;
    }>;
}

export interface LocalModelFightLogEntry {
    id: string;
    timestamp: string;
    kind: "decision" | "result";
    matchId: string;
    stateVersion: number;
    team: string;
    activeUnit: {
        id: string;
        name: string;
        attackType: string;
        cells: string[];
        hp: number;
        amountAlive: number;
    };
    stateSummary?: LocalModelFightStateSummary;
    prompt?: string;
    model?: string;
    style?: LocalModelOpponentConfig["style"];
    legalActions?: Array<{
        index: number;
        label: string;
        kind: string;
        summary: string;
        action: GameAction;
        tacticalTags: string[];
        risks: string[];
        evaluation?: LocalModelLegalAction["evaluation"];
    }>;
    rawResponse?: string;
    selectedAction?: {
        index: number;
        label: string;
        kind: string;
        summary: string;
        action: GameAction;
    };
    completed?: boolean;
    error?: string;
}

const actionLabels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOCAL_MODEL_FIGHT_LOG_KEY = "hoc.localModelFightLog";
const LOCAL_MODEL_FIGHT_LOG_LIMIT = 160;

const actionLabel = (index: number): string => actionLabels[index] ?? String(index + 1);

const normalizeBoolean = (value: string | null | undefined): boolean =>
    value === "1" || value === "true" || value === "yes" || value === "on";

const teamFromString = (value: string | null | undefined, fallback: TeamType): TeamType => {
    const normalized = value?.toUpperCase();
    if (normalized === "LOWER" || normalized === "GREEN") return TeamVals.LOWER;
    if (normalized === "UPPER" || normalized === "RED") return TeamVals.UPPER;
    return fallback;
};

const LOCAL_MODEL_ACTION_FLAG = "__hocLocalModelAction";

type LocalModelMarkedAction = GameAction & {
    [LOCAL_MODEL_ACTION_FLAG]?: true;
};

export const markLocalModelAction = <T extends GameAction>(action: T): T =>
    ({ ...action, [LOCAL_MODEL_ACTION_FLAG]: true }) as T;

export const isLocalModelAction = (action: GameAction): boolean =>
    (action as LocalModelMarkedAction)[LOCAL_MODEL_ACTION_FLAG] === true;

export const getLocalModelTeamName = (team: TeamType): string =>
    team === TeamVals.LOWER ? "LOWER" : team === TeamVals.UPPER ? "UPPER" : "NONE";

export const describeLocalModelActiveUnit = (unit: Unit): LocalModelFightLogEntry["activeUnit"] => ({
    id: unit.getId(),
    name: unit.getName(),
    attackType: enumName(AttackVals, unit.getAttackTypeSelection()),
    cells: unit.getCells().map((cell) => `${cell.x},${cell.y}`),
    hp: unit.getHp(),
    amountAlive: unit.getAmountAlive(),
});

export const createLocalModelFightStateSummary = (
    activeUnit: Unit,
    unitsHolder: UnitsHolder,
): LocalModelFightStateSummary => ({
    lap: FightStateManager.getInstance().getFightProperties().getCurrentLap(),
    activeUnitId: activeUnit.getId(),
    units: [...unitsHolder.getAllUnits().values()]
        .filter((unit) => !unit.isDead())
        .map((unit) => ({
            id: unit.getId(),
            team: getLocalModelTeamName(unit.getTeam()),
            name: unit.getName(),
            attackType: enumName(AttackVals, unit.getAttackTypeSelection()),
            cells: unit.getCells().map((cell) => `${cell.x},${cell.y}`),
            hp: unit.getHp(),
            maxHp: unit.getMaxHp(),
            amountAlive: unit.getAmountAlive(),
            amountDied: unit.getAmountDied(),
            speed: unit.getSpeed(),
            rangeShots: unit.getRangeShots(),
            abilities: unit.getAbilities().map((ability) => ability.getName()),
            spells: unit.getSpells().map((spell) => ({ name: spell.getName(), remaining: spell.getAmount() })),
        })),
});

const serializeLegalAction = (
    action: LocalModelLegalAction,
): NonNullable<LocalModelFightLogEntry["legalActions"]>[number] => ({
    index: action.index,
    label: action.label,
    kind: action.kind,
    summary: action.summary,
    action: action.action,
    tacticalTags: action.tacticalTags,
    risks: action.risks,
    evaluation: action.evaluation,
});

const serializeSelectedAction = (
    action?: LocalModelLegalAction,
): LocalModelFightLogEntry["selectedAction"] | undefined =>
    action
        ? {
              index: action.index,
              label: action.label,
              kind: action.kind,
              summary: action.summary,
              action: action.action,
          }
        : undefined;

const nextDecisionId = (): string => `lm-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const recordLocalModelFightLog = (entry: LocalModelFightLogEntry): void => {
    console.info("[local model fight log]", entry);
    if (typeof window === "undefined") {
        return;
    }

    const globalState = window as Window & {
        __hocLocalModelFightLog?: LocalModelFightLogEntry[];
        __hocDumpLocalModelFightLog?: () => string;
    };
    const current = globalState.__hocLocalModelFightLog ?? [];
    const next = [...current, entry].slice(-LOCAL_MODEL_FIGHT_LOG_LIMIT);
    globalState.__hocLocalModelFightLog = next;
    globalState.__hocDumpLocalModelFightLog = () => JSON.stringify(globalState.__hocLocalModelFightLog ?? [], null, 2);
    try {
        window.localStorage.setItem(LOCAL_MODEL_FIGHT_LOG_KEY, JSON.stringify(next));
    } catch {
        // Keep the in-memory log even if storage quota or privacy settings block persistence.
    }
};

export const getLocalModelOpponentConfig = (): LocalModelOpponentConfig => {
    const params = typeof window !== "undefined" ? new URL(window.location.href).searchParams : new URLSearchParams();
    const env = import.meta.env as Record<string, string | undefined>;
    const enabled =
        normalizeBoolean(params.get("localModelOpponent")) ||
        normalizeBoolean(params.get("modelOpponent")) ||
        normalizeBoolean(env.VITE_HOC_LOCAL_MODEL_OPPONENT);

    return {
        enabled,
        modelTeam: teamFromString(params.get("modelTeam") ?? env.VITE_HOC_MODEL_TEAM, TeamVals.UPPER),
        apiBase: (params.get("modelApiBase") ?? env.VITE_HOC_MODEL_API_BASE ?? "/hoc-local-model").replace(/\/+$/, ""),
        modelName: params.get("modelName") ?? env.VITE_HOC_MODEL_NAME ?? "auto",
        authorization:
            params.get("modelAuthorization") ??
            params.get("modelAuth") ??
            params.get("opponentAuthorization") ??
            env.VITE_HOC_MODEL_AUTHORIZATION,
        playerId: params.get("modelPlayerId") ?? params.get("opponentPlayerId") ?? env.VITE_HOC_MODEL_PLAYER_ID,
        style:
            (params.get("modelStyle") as LocalModelOpponentConfig["style"] | null) ??
            (env.VITE_HOC_AI_STYLE as LocalModelOpponentConfig["style"] | undefined) ??
            "balanced",
    };
};

const teamName = getLocalModelTeamName;

const enumName = (enumLike: Record<string, string | number>, value: number): string => {
    const name = enumLike[value];
    return typeof name === "string" ? name : String(value);
};

const cellKey = (cell: { x: number; y: number }): number => (cell.x << 4) | cell.y;

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

const getTargetTotalHp = (unit: Unit): number => (unit.getAmountAlive() - 1) * unit.getMaxHp() + unit.getHp();

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

const createAttackEvaluation = (
    attacker: Unit,
    target: Unit,
    fightProperties: FightProperties,
    opts: { isRange: boolean; divisor?: number; retaliation?: boolean },
): LocalModelLegalAction["evaluation"] => {
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
        targetName: target.getName(),
        targetValue,
        priorityScore,
        damage: { min: minDamage, max: maxDamage, targetTotalHp, killsTarget },
        retaliation: opts.retaliation,
        notes: [
            ...(killsTarget ? ["lethal"] : []),
            ...(target.getRangeShots() > 0 ? ["target has ranged pressure"] : []),
            ...(target.getSpells().length ? ["target can cast spells"] : []),
        ],
    };
};

const isMassSpell = (spell: Spell): boolean =>
    spell.getSpellTargetType() === SpellTargetType.ALL_FLYING ||
    spell.getSpellTargetType() === SpellTargetType.ALL_ALLIES ||
    spell.getSpellTargetType() === SpellTargetType.ALL_ENEMIES;

const canUseSpell = (caster: Unit, spell: Spell): boolean =>
    spell.getLapsTotal() > 0 && spell.isRemaining() && spell.getMinimalCasterStackPower() <= caster.getStackPower();

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
): LocalModelLegalAction["evaluation"] => {
    const estimatedValue = Math.round(estimateSpellValue(caster, spell, target, affectedUnits));
    const targetValue = target ? estimateUnitValue(target) : undefined;
    const priorityScore = Math.round(
        estimatedValue +
            (targetValue ?? 0) * (spell.isBuff() ? 0.12 : 0.2) +
            (isMassSpell(spell) ? affectedUnits.length * 18 : 0),
    );

    return {
        targetName: target?.getName(),
        targetValue,
        priorityScore,
        spell: {
            name: spell.getName(),
            targetType: enumName(SpellTargetType, spell.getSpellTargetType()),
            powerType: enumName(SpellPowerType, spell.getPowerType()),
            estimatedValue,
            remaining: spell.getAmount(),
            isMass: isMassSpell(spell),
            isSummon: spell.isSummon(),
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

const createAction = (
    actions: LocalModelLegalAction[],
    unit: Unit,
    summary: string,
    action: GameAction,
    tacticalTags: string[] = [],
    risks: string[] = [],
    evaluation?: LocalModelLegalAction["evaluation"],
): void => {
    if (actions.some((candidate) => JSON.stringify(candidate.action) === JSON.stringify(action))) {
        return;
    }

    const index = actions.length;
    actions.push({
        id: `action-${index + 1}`,
        label: actionLabel(index),
        index: index + 1,
        kind: action.type,
        summary,
        action,
        tacticalTags,
        risks,
        evaluation,
    });
};

const createMoveActionFromAi = (
    actions: LocalModelLegalAction[],
    activeUnit: Unit,
    grid: Grid,
    aiAction: AI.IAIAction,
): void => {
    const destination = aiAction.cellToMove();
    if (!destination || !activeUnit.canMove()) {
        return;
    }
    const route = getRouteForCell(aiAction.currentActiveKnownPaths(), destination);
    if (!route?.route.length) {
        return;
    }

    createAction(
        actions,
        activeUnit,
        `${activeUnit.getName()} moves to ${destination.x},${destination.y}`,
        {
            type: "move_unit",
            unitId: activeUnit.getId(),
            path: route.route.map((cell) => ({ ...cell })),
            targetCells: getTargetCells(activeUnit, grid, destination),
            hasLavaCell: route.hasLavaCell,
            hasWaterCell: route.hasWaterCell,
        },
        ["movement", "positioning"],
    );
};

const createMoveAndMeleeActionFromAi = (
    actions: LocalModelLegalAction[],
    activeUnit: Unit,
    fightProperties: FightProperties,
    grid: Grid,
    unitsHolder: UnitsHolder,
    aiAction: AI.IAIAction,
): void => {
    const attackFrom = aiAction.cellToMove();
    const cellToAttack = aiAction.cellToAttack();
    if (!attackFrom || !cellToAttack) {
        return;
    }
    const targetUnitId = grid.getOccupantUnitId(cellToAttack);
    const targetUnit = targetUnitId ? unitsHolder.getAllUnits().get(targetUnitId) : undefined;
    if (!targetUnit || targetUnit.isDead()) {
        return;
    }
    const route = getRouteForCell(aiAction.currentActiveKnownPaths(), attackFrom);
    if (!route?.route.length) {
        return;
    }

    createAction(
        actions,
        activeUnit,
        `${activeUnit.getName()} moves to strike ${targetUnit.getName()}`,
        {
            type: "melee_attack",
            attackerId: activeUnit.getId(),
            targetId: targetUnit.getId(),
            attackFrom: { ...attackFrom },
            path: route.route.map((cell) => ({ ...cell })),
            hasLavaCell: route.hasLavaCell,
            hasWaterCell: route.hasWaterCell,
        },
        ["movement", "damage"],
        targetUnit.canRespond(activeUnit.getAttackTypeSelection()) ? ["may draw a retaliation"] : [],
        createAttackEvaluation(activeUnit, targetUnit, fightProperties, {
            isRange: false,
            retaliation: targetUnit.canRespond(activeUnit.getAttackTypeSelection()),
        }),
    );
};

const getEnemiesWithinMovementRange = (
    activeUnit: Unit,
    grid: Grid,
    unitsHolder: UnitsHolder,
    pathHelper: PathHelper,
): Array<{ x: number; y: number }> | undefined => {
    if (!activeUnit.canMove()) {
        return undefined;
    }
    const moveCells = pathHelper.getMovePath(
        activeUnit.getBaseCell(),
        grid.getMatrixNoUnits(),
        activeUnit.getSteps(),
        undefined,
        activeUnit.canFly(),
        activeUnit.isSmallSize(),
        activeUnit.hasAbilityActive("Made of Fire"),
    ).cells;
    const enemies = moveCells.filter((cell) => {
        const enemyId = grid.getOccupantUnitId(cell);
        const enemy = enemyId ? unitsHolder.getAllUnits().get(enemyId) : undefined;
        return !!enemy && enemy.getTeam() !== activeUnit.getTeam() && enemy.isSmallSize() && !enemy.isDead();
    });
    return enemies.length ? enemies : undefined;
};

const getAvailableSummonCells = (caster: Unit, grid: Grid, spell: Spell): Array<{ x: number; y: number }> =>
    GridMath.getCellsAroundCell(grid.getSettings(), caster.getBaseCell()).filter((cell) =>
        SpellHelper.canCastSummon(spell, grid.getMatrix(), cell),
    );

const createSpellActions = (options: LocalModelActionOptions, actions: LocalModelLegalAction[]): void => {
    const { activeUnit, grid, pathHelper, unitsHolder } = options;
    const allies = unitsHolder.getAllAllies(activeUnit.getTeam()).filter((unit) => !unit.isDead());
    const enemies = unitsHolder.getAllEnemyUnits(activeUnit.getTeam()).filter((unit) => !unit.isDead());
    const movementRangeEnemies = getEnemiesWithinMovementRange(activeUnit, grid, unitsHolder, pathHelper);

    for (const spell of activeUnit.getSpells()) {
        if (!canUseSpell(activeUnit, spell)) {
            continue;
        }
        const spellName = spell.getName();
        const targetType = spell.getSpellTargetType();

        if (isMassSpell(spell)) {
            const affectedUnits =
                targetType === SpellTargetType.ALL_ENEMIES
                    ? enemies
                    : targetType === SpellTargetType.ALL_ALLIES
                      ? allies
                      : [...allies, ...enemies].filter((unit) => unit.canFly());
            createAction(
                actions,
                activeUnit,
                `${activeUnit.getName()} casts ${spellName}`,
                { type: "cast_spell", casterId: activeUnit.getId(), spellName },
                ["magic", spell.isBuff() ? "support" : "control"],
                [],
                createSpellEvaluation(activeUnit, spell, undefined, affectedUnits),
            );
            continue;
        }

        if (spell.isSummon() && targetType === SpellTargetType.RANDOM_CLOSE_TO_CASTER) {
            for (const targetCell of getAvailableSummonCells(activeUnit, grid, spell)) {
                createAction(
                    actions,
                    activeUnit,
                    `${activeUnit.getName()} casts ${spellName} at ${targetCell.x},${targetCell.y}`,
                    {
                        type: "cast_spell",
                        casterId: activeUnit.getId(),
                        spellName,
                        targetCell: { ...targetCell },
                    },
                    ["magic", "summon", "positioning"],
                    [],
                    createSpellEvaluation(activeUnit, spell),
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
                createAction(
                    actions,
                    activeUnit,
                    `${activeUnit.getName()} casts ${spellName} on ${target.getName()}`,
                    {
                        type: "cast_spell",
                        casterId: activeUnit.getId(),
                        spellName,
                        targetId: target.getId(),
                        targetCell: { ...target.getBaseCell() },
                    },
                    ["magic", spell.isBuff() ? "support" : "control"],
                    target.getMagicResist() > 0 ? [`target has ${target.getMagicResist()} magic resist`] : [],
                    createSpellEvaluation(activeUnit, spell, target),
                );
            }
        }
    }
};

export const createLocalModelActions = (options: LocalModelActionOptions): LocalModelLegalAction[] => {
    const { activeUnit, attackHandler, fightProperties, grid, pathHelper, unitsHolder } = options;
    const actions: LocalModelLegalAction[] = [];
    const activeUnitId = activeUnit.getId();
    const canLandRangeAttack = attackHandler.canLandRangeAttack(
        activeUnit,
        grid.getEnemyAggrMatrixByUnitId(activeUnitId),
    );
    const selectedBeforeRefresh = activeUnit.getAttackTypeSelection();
    activeUnit.refreshPossibleAttackTypes(canLandRangeAttack);
    if (activeUnit.getPossibleAttackTypes().includes(selectedBeforeRefresh)) {
        activeUnit.selectAttackType(selectedBeforeRefresh);
    }

    if (options.allowAttackTypeSetup !== false) {
        for (const attackType of activeUnit.getPossibleAttackTypes()) {
            if (attackType !== activeUnit.getAttackTypeSelection()) {
                createAction(
                    actions,
                    activeUnit,
                    `Switch ${activeUnit.getName()} to ${enumName(AttackVals, attackType).toLowerCase().replaceAll("_", " ")}`,
                    { type: "select_attack_type", unitId: activeUnitId, attackType },
                    ["setup"],
                    ["setup only; does not finish the turn; do not repeat for the same active unit"],
                );
            }
        }
    }

    const adjacentEnemies = unitsHolder
        .allEnemiesAroundUnit(activeUnit, true, activeUnit.getBaseCell())
        .filter((unit) => !unit.isDead());
    if (
        activeUnit.getAttackTypeSelection() === AttackVals.MELEE ||
        activeUnit.getAttackTypeSelection() === AttackVals.MELEE_MAGIC
    ) {
        for (const enemy of adjacentEnemies) {
            createAction(
                actions,
                activeUnit,
                `${activeUnit.getName()} attacks ${enemy.getName()} in melee`,
                {
                    type: "melee_attack",
                    attackerId: activeUnitId,
                    targetId: enemy.getId(),
                    attackFrom: { ...activeUnit.getBaseCell() },
                },
                ["damage", "adjacent"],
                enemy.canRespond(activeUnit.getAttackTypeSelection()) ? ["may draw a retaliation"] : [],
                createAttackEvaluation(activeUnit, enemy, fightProperties, {
                    isRange: false,
                    retaliation: enemy.canRespond(activeUnit.getAttackTypeSelection()),
                }),
            );
        }
    }

    if (activeUnit.getAttackTypeSelection() === AttackVals.RANGE && canLandRangeAttack) {
        for (const enemy of unitsHolder.getAllEnemyUnits(activeUnit.getTeam()).filter((unit) => !unit.isDead())) {
            const divisor = attackHandler.getRangeAttackDivisor(activeUnit, enemy.getPosition());
            createAction(
                actions,
                activeUnit,
                `${activeUnit.getName()} shoots ${enemy.getName()}`,
                { type: "range_attack", attackerId: activeUnitId, targetId: enemy.getId() },
                ["damage", "ranged"],
                [],
                createAttackEvaluation(activeUnit, enemy, fightProperties, {
                    isRange: true,
                    divisor,
                    retaliation: false,
                }),
            );
        }
    }

    createSpellActions(options, actions);

    const aiAction = AI.findTarget(activeUnit, grid, grid.getMatrix(), unitsHolder, pathHelper);
    if (aiAction?.actionType() === AI.AIActionType.MOVE) {
        createMoveActionFromAi(actions, activeUnit, grid, aiAction);
    } else if (aiAction?.actionType() === AI.AIActionType.MOVE_AND_MELEE_ATTACK) {
        createMoveAndMeleeActionFromAi(actions, activeUnit, fightProperties, grid, unitsHolder, aiAction);
    }

    if (
        fightProperties.getTeamUnitsAlive(activeUnit.getTeam()) > 1 &&
        !fightProperties.hourglassIncludes(activeUnitId) &&
        !fightProperties.hasAlreadyMadeTurn(activeUnitId) &&
        !fightProperties.hasAlreadyHourglass(activeUnitId)
    ) {
        createAction(
            actions,
            activeUnit,
            `${activeUnit.getName()} waits for a later slot`,
            {
                type: "wait_turn",
                unitId: activeUnitId,
            },
            ["tempo"],
        );
    }

    createAction(
        actions,
        activeUnit,
        `${activeUnit.getName()} uses Luck Shield`,
        {
            type: "defend_turn",
            unitId: activeUnitId,
        },
        ["defense"],
    );
    createAction(
        actions,
        activeUnit,
        `${activeUnit.getName()} ends the turn`,
        { type: "end_turn", unitId: activeUnitId, reason: "manual" },
        ["tempo"],
        ["passes initiative"],
    );

    return actions;
};

const unitLine = (unit: Unit, activeUnitId: string): string =>
    `${teamName(unit.getTeam())}${unit.getId() === activeUnitId ? " ACTIVE" : ""} ${unit.getName()} ` +
    `hp ${unit.getHp()}/${unit.getMaxHp()} alive ${unit.getAmountAlive()} ` +
    `speed ${unit.getSpeed()} shots ${unit.getRangeShots()} at ${unit
        .getCells()
        .map((cell) => `${cell.x},${cell.y}`)
        .join(";")} abilities ${
        unit
            .getAbilities()
            .map((ability) => ability.getName())
            .join(", ") || "none"
    } ` +
    `spells ${
        unit
            .getSpells()
            .map((spell) => `${spell.getName()}:${spell.getAmount()}`)
            .join(", ") || "none"
    }`;

const evaluationText = (action: LocalModelLegalAction): string => {
    const evaluation = action.evaluation;
    if (!evaluation) return "";
    const parts = [
        evaluation.targetName ? `target ${evaluation.targetName}` : "",
        typeof evaluation.targetValue === "number" ? `targetValue ${evaluation.targetValue}` : "",
        typeof evaluation.priorityScore === "number" ? `priority ${evaluation.priorityScore}` : "",
        evaluation.damage
            ? `damage ${evaluation.damage.min}-${evaluation.damage.max} vs hp ${evaluation.damage.targetTotalHp}${
                  evaluation.damage.killsTarget ? " lethal" : ""
              }`
            : "",
        typeof evaluation.retaliation === "boolean"
            ? evaluation.retaliation
                ? "retaliation risk"
                : "no retaliation"
            : "",
        evaluation.spell
            ? `spell ${evaluation.spell.name} value ${evaluation.spell.estimatedValue} remaining ${evaluation.spell.remaining}${
                  evaluation.spell.isMass ? " mass" : ""
              }${evaluation.spell.isSummon ? " summon" : ""}`
            : "",
        evaluation.notes?.length ? `notes ${evaluation.notes.join(", ")}` : "",
    ].filter(Boolean);
    return parts.length ? ` [${parts.join("; ")}]` : "";
};

const buildPrompt = (
    team: TeamType,
    style: LocalModelOpponentConfig["style"],
    activeUnit: Unit,
    unitsHolder: UnitsHolder,
    actions: LocalModelLegalAction[],
): string => {
    const fightProps = FightStateManager.getInstance().getFightProperties();
    const units = [...unitsHolder.getAllUnits().values()].filter((unit) => !unit.isDead());
    return [
        `You are choosing one legal Heroes of Crypto action for team ${teamName(team)}.`,
        `Style: ${style}.`,
        "Goal: destroy every enemy stack before your own army is destroyed.",
        "The legal choices below are authoritative; choose exactly one listed label.",
        "Usually prefer lethal damage, removing enemy turns, valuable targets, strong summons/control, and safe ranged pressure.",
        "Attack-type switches are setup only and do not finish the turn; never switch back and forth.",
        "Wait only when delaying creates a better same-lap action. Defend/end only when no useful pressure exists.",
        `Lap ${fightProps.getCurrentLap()}. Active unit: ${activeUnit.getName()}.`,
        "Units:",
        ...units.map((unit) => `- ${unitLine(unit, activeUnit.getId())}`),
        "Legal choices:",
        ...actions.map((action) => {
            const tags = action.tacticalTags.length ? ` tags ${action.tacticalTags.join(", ")}` : "";
            const risks = action.risks.length ? ` risks ${action.risks.join(", ")}` : "";
            return `${action.label}. ${action.summary}${tags}${risks}${evaluationText(action)}`;
        }),
        'Return JSON only: {"actionIndex": 1}. Use the 1-based index of exactly one listed legal choice. Do not explain.',
    ].join("\n");
};

const readChatContent = (responseJson: unknown): string => {
    const content = (responseJson as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message
        ?.content;
    return typeof content === "string" ? content.replace(/\0/g, "").trim() : "";
};

const extractAction = (content: string, actions: LocalModelLegalAction[]): LocalModelLegalAction | undefined => {
    const cleaned = content
        .replace(/<think>[\s\S]*?<\/think>/gi, " ")
        .replace(/^[`"'\s]+|[`"'\s.]+$/g, "")
        .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]) as {
                actionIndex?: unknown;
                index?: unknown;
                label?: unknown;
                actionLabel?: unknown;
                choice?: unknown;
            };
            const index = Number(parsed.actionIndex ?? parsed.index ?? parsed.choice);
            if (Number.isInteger(index) && index >= 1 && index <= actions.length) {
                return actions[index - 1];
            }
            const label = String(parsed.label ?? parsed.actionLabel ?? parsed.choice ?? "")
                .trim()
                .toUpperCase();
            return actions.find((action) => action.label === label);
        } catch {
            // Fall through to loose parsing.
        }
    }
    const bracketLabelMatch = cleaned.match(/^\s*[*_\s]*(?:\[\s*([A-Z])\s*\]|\(\s*([A-Z])\s*\))/i);
    if (bracketLabelMatch) {
        return actions.find((action) => action.label === (bracketLabelMatch[1] ?? bracketLabelMatch[2]).toUpperCase());
    }
    const labelMatch =
        cleaned.match(/^\s*(?:choice|action|option|move|answer)?\s*[:#-]?\s*([A-Z])\b/i) ??
        cleaned.match(
            /\b(?:choose|pick|select|selected|answer|option|move|choice|action)\s*(?:is|:|#|-)?\s*([A-Z])\b/i,
        );
    if (labelMatch) {
        return actions.find((action) => action.label === labelMatch[1].toUpperCase());
    }
    const indexMatch =
        cleaned.match(/^\s*\(?\s*(\d+)\s*\)?\b/i) ??
        cleaned.match(/^\s*(?:choice|action|option|move|answer)?\s*[:#-]?\s*(\d+)\b/i) ??
        cleaned.match(/\b(?:choose|pick|select|selected|answer|option|move|choice|action)\s*(?:is|:|#|-)?\s*(\d+)\b/i);
    if (indexMatch) {
        const index = Number(indexMatch[1]);
        return Number.isInteger(index) && index >= 1 && index <= actions.length ? actions[index - 1] : undefined;
    }
    return undefined;
};

const modelUrl = (base: string, path: string): string => `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const resolveModelName = async (config: LocalModelOpponentConfig): Promise<string> => {
    if (config.modelName && config.modelName !== "auto") {
        return config.modelName;
    }
    const response = await fetch(modelUrl(config.apiBase, "/models"));
    if (!response.ok) {
        return config.modelName || "local-model";
    }
    const body = (await response.json()) as {
        data?: Array<{ id?: string; active?: boolean; installed?: boolean }>;
    };
    return (
        body.data?.find((model) => model.active && model.id)?.id ??
        body.data?.find((model) => model.installed && model.id)?.id ??
        body.data?.find((model) => model.id)?.id ??
        "local-model"
    );
};

export const chooseLocalModelAction = async (input: {
    config: LocalModelOpponentConfig;
    activeUnit: Unit;
    unitsHolder: UnitsHolder;
    actions: LocalModelLegalAction[];
    matchId?: string;
    stateVersion?: number;
}): Promise<{ action?: LocalModelLegalAction; rawContent?: string; error?: string; decisionId?: string }> => {
    const decisionId = nextDecisionId();
    const matchId = input.matchId ?? "ui-local-model";
    const stateVersion = input.stateVersion ?? FightStateManager.getInstance().getFightProperties().getCurrentLap();
    if (!input.actions.length) {
        recordLocalModelFightLog({
            id: decisionId,
            timestamp: new Date().toISOString(),
            kind: "decision",
            matchId,
            stateVersion,
            team: teamName(input.activeUnit.getTeam()),
            activeUnit: describeLocalModelActiveUnit(input.activeUnit),
            stateSummary: createLocalModelFightStateSummary(input.activeUnit, input.unitsHolder),
            style: input.config.style,
            legalActions: [],
            error: "no_legal_actions",
        });
        return { error: "no_legal_actions", decisionId };
    }
    try {
        const model = await resolveModelName(input.config);
        const prompt = buildPrompt(
            input.activeUnit.getTeam(),
            input.config.style,
            input.activeUnit,
            input.unitsHolder,
            input.actions,
        );
        const response = await fetch(modelUrl(input.config.apiBase, "/chat/completions"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                session_id: `hoc-ui-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                stream: false,
                temperature: Number(
                    (import.meta.env as Record<string, string | undefined>).VITE_HOC_MODEL_TEMPERATURE ?? 0,
                ),
                max_tokens: 120,
                enable_thinking: false,
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a deterministic controller for a local strategy game. Choose one legal action. Output only valid JSON.",
                    },
                    { role: "user", content: prompt },
                ],
            }),
        });
        if (!response.ok) {
            const error = `http_${response.status}`;
            recordLocalModelFightLog({
                id: decisionId,
                timestamp: new Date().toISOString(),
                kind: "decision",
                matchId,
                stateVersion,
                team: teamName(input.activeUnit.getTeam()),
                activeUnit: describeLocalModelActiveUnit(input.activeUnit),
                stateSummary: createLocalModelFightStateSummary(input.activeUnit, input.unitsHolder),
                prompt,
                model,
                style: input.config.style,
                legalActions: input.actions.map(serializeLegalAction),
                error,
            });
            return { error, decisionId };
        }
        const rawContent = readChatContent(await response.json());
        const action = extractAction(rawContent, input.actions);
        recordLocalModelFightLog({
            id: decisionId,
            timestamp: new Date().toISOString(),
            kind: "decision",
            matchId,
            stateVersion,
            team: teamName(input.activeUnit.getTeam()),
            activeUnit: describeLocalModelActiveUnit(input.activeUnit),
            stateSummary: createLocalModelFightStateSummary(input.activeUnit, input.unitsHolder),
            prompt,
            model,
            style: input.config.style,
            legalActions: input.actions.map(serializeLegalAction),
            rawResponse: rawContent,
            selectedAction: serializeSelectedAction(action),
            error: action ? undefined : "no_parseable_action",
        });
        return { action, rawContent, decisionId };
    } catch (err) {
        const error = (err as Error).message;
        recordLocalModelFightLog({
            id: decisionId,
            timestamp: new Date().toISOString(),
            kind: "decision",
            matchId,
            stateVersion,
            team: teamName(input.activeUnit.getTeam()),
            activeUnit: describeLocalModelActiveUnit(input.activeUnit),
            stateSummary: createLocalModelFightStateSummary(input.activeUnit, input.unitsHolder),
            style: input.config.style,
            legalActions: input.actions.map(serializeLegalAction),
            error,
        });
        return { error, decisionId };
    }
};
