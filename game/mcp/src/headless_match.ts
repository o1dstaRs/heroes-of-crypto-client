import {
    AbilityFactory,
    AttackHandler,
    FightStateManager,
    type FightProperties,
    GameActionEngine,
    Grid,
    GridConstants,
    GridSettings,
    GridVals,
    AttackVals,
    EffectFactory,
    HoCConfig,
    HoCLib,
    MoveHandler,
    PathHelper,
    TeamVals,
    ToFactionName,
    TurnEngine,
    UnitsHolder,
    type GameAction,
    type GameActionRejectionReason,
    type GameEvent,
    type IGameActionResult,
    type IGameRuntime,
    type IWeightedRoute,
    type TeamType,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";

import { createLegalActionBundle, getAvailableSummonCells, getEnemiesWithinMovementRange } from "./legal_actions";
import { createUnitFromCreatureId, placeDraftUnit } from "./draft";
import { RuleBasedModelAI, scoreAction } from "./model_ai";
import { createMcpGameRuntime } from "./runtime";
import { DamageStatisticStore, BufferedSceneLog } from "./scene_log";
import { gridTypeName, serializeUnit, teamFromName, teamToName, winningTeamFromEvents } from "./serializers";
import { createMcpUnit, placeMcpUnit } from "./test_units";
import type {
    AITurnDecision,
    AIReason,
    AIStyle,
    EvaluatedLegalAction,
    LegalAction,
    PlayAiTurnResult,
    PublicMatchState,
    SubmitActionResult,
    TeamName,
} from "./types";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

export interface CreateHeadlessMatchOptions {
    matchId?: string;
    runtime?: IGameRuntime;
}

export class HeadlessMatch {
    private readonly matchId: string;
    private readonly runtime: IGameRuntime;
    private readonly fightProperties: FightProperties;
    private readonly grid: Grid;
    private readonly unitsHolder: UnitsHolder;
    private readonly sceneLog: BufferedSceneLog;
    private readonly damageStatisticStore: DamageStatisticStore;
    private readonly moveHandler: MoveHandler;
    private readonly attackHandler: AttackHandler;
    private readonly pathHelper: PathHelper;
    private readonly eventLog: GameEvent[] = [];
    private legalActionKnownPathsById: Map<string, Map<number, IWeightedRoute[]>> = new Map();
    private currentActiveKnownPaths: Map<number, IWeightedRoute[]> | undefined;
    private activeUnitId: string | undefined;
    private stateVersion = 0;
    public constructor(options: CreateHeadlessMatchOptions = {}) {
        FightStateManager.getInstance().reset();
        this.matchId = options.matchId ?? `mcp-match-${Date.now()}`;
        this.runtime = options.runtime ?? createMcpGameRuntime();
        this.fightProperties = FightStateManager.getInstance().getFightProperties();
        this.grid = new Grid(gridSettings, GridVals.NORMAL);
        this.unitsHolder = new UnitsHolder(this.grid);
        this.sceneLog = new BufferedSceneLog();
        this.damageStatisticStore = new DamageStatisticStore();
        this.moveHandler = new MoveHandler(gridSettings, this.grid, this.unitsHolder);
        this.attackHandler = new AttackHandler(gridSettings, this.grid, this.sceneLog, this.damageStatisticStore);
        this.pathHelper = new PathHelper(gridSettings);
    }
    public static createQuickstart(options: CreateHeadlessMatchOptions = {}): HeadlessMatch {
        const match = new HeadlessMatch(options);
        match.seedArmies({ x: 4, y: 3 });
        match.startFight();
        return match;
    }
    public static createApproachScenario(options: CreateHeadlessMatchOptions = {}): HeadlessMatch {
        const match = new HeadlessMatch(options);
        match.seedArmies({ x: 8, y: 3 });
        match.startFight();
        return match;
    }
    public static createPriorityTargetScenario(options: CreateHeadlessMatchOptions = {}): HeadlessMatch {
        const match = new HeadlessMatch(options);
        match.seedPriorityTargets();
        match.startFight();
        return match;
    }
    public static createSpellDuelScenario(options: CreateHeadlessMatchOptions = {}): HeadlessMatch {
        const match = new HeadlessMatch(options);
        match.seedSpellDuel();
        match.startFight();
        return match;
    }
    public static createSummonScenario(options: CreateHeadlessMatchOptions = {}): HeadlessMatch {
        const match = new HeadlessMatch(options);
        match.seedSummonDuel();
        match.startFight();
        return match;
    }
    public static createFromDraft(
        options: CreateHeadlessMatchOptions & { lowerCreatures: number[]; upperCreatures: number[] },
    ): HeadlessMatch {
        const match = new HeadlessMatch(options);
        match.seedDraftArmies(options.lowerCreatures, options.upperCreatures);
        match.startFight();
        return match;
    }
    public getId(): string {
        return this.matchId;
    }
    public getState(): PublicMatchState {
        return this.toPublicState();
    }
    public getActiveUnit(): Unit | undefined {
        return this.activeUnitId ? this.unitsHolder.getAllUnits().get(this.activeUnitId) : undefined;
    }
    public listLegalActions(team?: TeamName, options: { allowAttackTypeSetup?: boolean } = {}): LegalAction[] {
        const activeUnit = this.getActiveUnit();
        if (!activeUnit) {
            return [];
        }
        if (team && teamFromName(team) !== activeUnit.getTeam()) {
            return [];
        }

        const bundle = createLegalActionBundle({
            matchId: this.matchId,
            stateVersion: this.stateVersion,
            activeUnit,
            grid: this.grid,
            unitsHolder: this.unitsHolder,
            attackHandler: this.attackHandler,
            fightProperties: this.getFightProperties(),
            pathHelper: this.pathHelper,
            allowAttackTypeSetup: options.allowAttackTypeSetup,
        });
        this.legalActionKnownPathsById = bundle.knownPathsByActionId;
        return bundle.actions;
    }
    public chooseAction(options: {
        reason: AIReason;
        style?: AIStyle;
        team?: TeamName;
        allowAttackTypeSetup?: boolean;
    }): AITurnDecision {
        const activeUnit = this.getActiveUnit();
        if (!activeUnit) {
            throw new Error("No active unit is available");
        }

        const team = options.team ?? teamToName(activeUnit.getTeam());
        const legalActions = this.listLegalActions(team, { allowAttackTypeSetup: options.allowAttackTypeSetup });
        return new RuleBasedModelAI().chooseAction({
            matchId: this.matchId,
            reason: options.reason,
            style: options.style,
            state: this.toPublicState(),
            legalActions,
            team,
        });
    }
    public evaluateActions(options: { style?: AIStyle; team?: TeamName } = {}): EvaluatedLegalAction[] {
        const activeUnit = this.getActiveUnit();
        if (!activeUnit) {
            return [];
        }

        const team = options.team ?? teamToName(activeUnit.getTeam());
        const style = options.style ?? "balanced";
        return this.listLegalActions(team)
            .map((action) => ({ ...action, score: scoreAction(action, style) }))
            .sort((left, right) => {
                const scoreDelta = right.score - left.score;
                if (scoreDelta !== 0) {
                    return scoreDelta;
                }
                return left.id.localeCompare(right.id);
            })
            .map((action, index) => ({ ...action, rank: index + 1 }));
    }
    public submitAction(input: { team: TeamName; actionId?: string; action?: GameAction }): SubmitActionResult {
        const activeUnit = this.getActiveUnit();
        if (!activeUnit) {
            return this.rejected("fight_finished", "No active unit is available");
        }
        if (teamFromName(input.team) !== activeUnit.getTeam()) {
            return this.rejected("unit_not_active", `It is ${teamToName(activeUnit.getTeam())}'s turn`);
        }

        const legalActions = this.listLegalActions(input.team);
        const selectedAction = input.actionId
            ? legalActions.find((action) => action.id === input.actionId)?.action
            : input.action;
        if (!selectedAction) {
            return this.rejected("unsupported_action", "The requested action is not legal in the current state");
        }

        this.currentActiveKnownPaths = input.actionId ? this.legalActionKnownPathsById.get(input.actionId) : undefined;
        const result = this.createActionEngine().apply(selectedAction);
        this.currentActiveKnownPaths = undefined;
        this.applyEngineResult(result);
        if (result.completed && !this.activeUnitId && !this.getFightProperties().hasFightFinished()) {
            this.advanceUntilActiveOrFinished();
        }

        const nextActiveUnit = this.getActiveUnit();
        return {
            completed: result.completed,
            rejectionReason: result.rejectionReason,
            message: result.message,
            events: result.events,
            state: this.toPublicState(result.events),
            nextLegalActions: nextActiveUnit ? this.listLegalActions(teamToName(nextActiveUnit.getTeam())) : [],
        };
    }
    public playAiTurn(options: {
        reason: AIReason;
        style?: AIStyle;
        team?: TeamName;
        maxActions?: number;
    }): PlayAiTurnResult {
        const activeUnit = this.getActiveUnit();
        if (!activeUnit) {
            return {
                completed: false,
                stoppedReason: this.getFightProperties().hasFightFinished() ? "fight_finished" : "no_active_unit",
                decisions: [],
                actionResults: [],
                state: this.toPublicState([]),
            };
        }

        const team = options.team ?? teamToName(activeUnit.getTeam());
        if (teamFromName(team) !== activeUnit.getTeam()) {
            return {
                completed: false,
                team,
                stoppedReason: "wrong_team",
                decisions: [],
                actionResults: [],
                state: this.toPublicState([]),
            };
        }

        const decisions: AITurnDecision[] = [];
        const actionResults: SubmitActionResult[] = [];
        const maxActions = options.maxActions ?? 8;
        let attackTypeSetupUnitId: string | undefined;

        for (let i = 0; i < maxActions; i++) {
            const currentUnit = this.getActiveUnit();
            if (!currentUnit) {
                return {
                    completed: this.getFightProperties().hasFightFinished(),
                    team,
                    stoppedReason: this.getFightProperties().hasFightFinished() ? "fight_finished" : "no_active_unit",
                    decisions,
                    actionResults,
                    state: this.toPublicState([]),
                };
            }
            if (teamFromName(team) !== currentUnit.getTeam()) {
                return {
                    completed: true,
                    team,
                    stoppedReason: "turn_changed",
                    decisions,
                    actionResults,
                    state: this.toPublicState([]),
                };
            }

            const allowAttackTypeSetup = attackTypeSetupUnitId !== currentUnit.getId();
            const legalActions = this.listLegalActions(team, { allowAttackTypeSetup });
            if (!legalActions.length) {
                return {
                    completed: false,
                    team,
                    stoppedReason: "no_legal_actions",
                    decisions,
                    actionResults,
                    state: this.toPublicState([]),
                };
            }

            const decision = this.chooseAction({
                reason: options.reason,
                style: options.style,
                team,
                allowAttackTypeSetup,
            });
            const result = this.submitAction({ team, actionId: decision.actionId });
            decisions.push(decision);
            actionResults.push(result);
            attackTypeSetupUnitId =
                decision.action.type === "select_attack_type" && result.completed ? currentUnit.getId() : undefined;

            if (!result.completed) {
                return {
                    completed: false,
                    team,
                    stoppedReason: "action_rejected",
                    decisions,
                    actionResults,
                    state: result.state,
                };
            }
            if (result.state.phase === "finished") {
                return {
                    completed: true,
                    team,
                    stoppedReason: "fight_finished",
                    decisions,
                    actionResults,
                    state: result.state,
                };
            }
            if (result.state.activeTeam !== team) {
                return {
                    completed: true,
                    team,
                    stoppedReason: "turn_changed",
                    decisions,
                    actionResults,
                    state: result.state,
                };
            }
        }

        return {
            completed: false,
            team,
            stoppedReason: "max_actions",
            decisions,
            actionResults,
            state: this.toPublicState([]),
        };
    }
    private seedArmies(upperCell: { x: number; y: number }): void {
        placeMcpUnit(
            this.grid,
            this.unitsHolder,
            createMcpUnit({
                name: "Lower Knight",
                team: TeamVals.LOWER,
                speed: 9,
                attack: 100,
                damageMin: 100,
                damageMax: 100,
                maxHp: 10,
                stackPower: 10,
            }),
            { x: 3, y: 3 },
        );
        placeMcpUnit(
            this.grid,
            this.unitsHolder,
            createMcpUnit({
                name: "Upper Guard",
                team: TeamVals.UPPER,
                speed: 4,
                attack: 1,
                damageMin: 1,
                damageMax: 1,
                maxHp: 10,
                stackPower: 10,
            }),
            upperCell,
        );
    }
    private seedPriorityTargets(): void {
        placeMcpUnit(
            this.grid,
            this.unitsHolder,
            createMcpUnit({
                name: "Lower Knight",
                team: TeamVals.LOWER,
                speed: 9,
                attack: 60,
                damageMin: 45,
                damageMax: 45,
                maxHp: 40,
                stackPower: 10,
            }),
            { x: 3, y: 3 },
        );
        placeMcpUnit(
            this.grid,
            this.unitsHolder,
            createMcpUnit({
                name: "Upper Peasant",
                team: TeamVals.UPPER,
                speed: 1,
                attack: 1,
                damageMin: 1,
                damageMax: 1,
                maxHp: 8,
                stackPower: 1,
            }),
            { x: 4, y: 3 },
        );
        placeMcpUnit(
            this.grid,
            this.unitsHolder,
            createMcpUnit({
                name: "Upper Arbalester",
                team: TeamVals.UPPER,
                attackType: AttackVals.RANGE,
                rangeShots: 10,
                shotDistance: 5,
                speed: 6,
                attack: 14,
                damageMin: 5,
                damageMax: 8,
                maxHp: 28,
                stackPower: 45,
            }),
            { x: 3, y: 4 },
        );
    }
    private seedSpellDuel(): void {
        placeMcpUnit(
            this.grid,
            this.unitsHolder,
            createMcpUnit({
                name: "Lower Hexer",
                team: TeamVals.LOWER,
                attackType: AttackVals.MAGIC,
                spells: ["Death:Sadness"],
                speed: 8,
                stackPower: 10,
            }),
            { x: 3, y: 3 },
        );
        placeMcpUnit(
            this.grid,
            this.unitsHolder,
            createMcpUnit({
                name: "Upper Marksman",
                team: TeamVals.UPPER,
                attackType: AttackVals.RANGE,
                rangeShots: 8,
                speed: 3,
                stackPower: 30,
            }),
            { x: 7, y: 3 },
        );
    }
    private seedSummonDuel(): void {
        placeMcpUnit(
            this.grid,
            this.unitsHolder,
            createMcpUnit({
                name: "Lower Caller",
                team: TeamVals.LOWER,
                attackType: AttackVals.MAGIC,
                spells: ["Nature:Summon Wolves"],
                amountAlive: 3,
                speed: 8,
                stackPower: 10,
            }),
            { x: 3, y: 3 },
        );
        placeMcpUnit(
            this.grid,
            this.unitsHolder,
            createMcpUnit({
                name: "Upper Guard",
                team: TeamVals.UPPER,
                speed: 3,
                stackPower: 10,
            }),
            { x: 8, y: 3 },
        );
    }
    private seedDraftArmies(lowerCreatures: number[], upperCreatures: number[]): void {
        this.placeDraftArmy(TeamVals.LOWER, lowerCreatures);
        this.placeDraftArmy(TeamVals.UPPER, upperCreatures);
    }
    private placeDraftArmy(team: TeamType, creatureIds: number[]): void {
        for (const creatureId of creatureIds) {
            const unit = createUnitFromCreatureId(creatureId, team, gridSettings);
            const baseCell = this.findDraftPlacementCell(unit, team);
            const cells = placeDraftUnit(gridSettings, unit, baseCell);
            const occupied = this.grid.occupyCells(
                cells,
                unit.getId(),
                unit.getTeam(),
                unit.getAttackRange(),
                unit.hasAbilityActive("Made of Fire"),
                unit.hasAbilityActive("Made of Water"),
            );
            if (!occupied) {
                throw new Error(`Unable to occupy drafted unit ${unit.getName()} at ${baseCell.x}:${baseCell.y}`);
            }
            this.unitsHolder.addUnit(unit);
        }
    }
    private findDraftPlacementCell(unit: Unit, team: TeamType): { x: number; y: number } {
        const rowOrder = team === TeamVals.LOWER ? [1, 2, 3, 4, 5] : [13, 12, 11, 10, 9];
        const columnOrder = [2, 4, 6, 8, 10, 12, 1, 3, 5, 7, 9, 11, 13];

        for (const y of rowOrder) {
            for (const x of columnOrder) {
                const cells = unit.isSmallSize()
                    ? [{ x, y }]
                    : [
                          { x, y },
                          { x: x + 1, y },
                          { x, y: y + 1 },
                          { x: x + 1, y: y + 1 },
                      ];
                if (
                    this.grid.canOccupyCells(
                        cells,
                        unit.hasAbilityActive("Made of Fire"),
                        unit.hasAbilityActive("Made of Water"),
                    )
                ) {
                    return { x, y };
                }
            }
        }

        throw new Error(`No draft placement cell is available for ${unit.getName()}`);
    }
    private startFight(): void {
        this.getFightProperties().setGridType(GridVals.NORMAL);
        this.applyEngineResult(this.createActionEngine().apply({ type: "start_fight" }));
        this.advanceUntilActiveOrFinished();
    }
    private createActionEngine(): GameActionEngine {
        return new GameActionEngine({
            fightProperties: this.getFightProperties(),
            grid: this.grid,
            unitsHolder: this.unitsHolder,
            moveHandler: this.moveHandler,
            sceneLog: this.sceneLog,
            attackHandler: this.attackHandler,
            getCurrentActiveUnitId: () => this.activeUnitId,
            getCurrentActiveKnownPaths: () => this.currentActiveKnownPaths,
            getCurrentEnemiesCellsWithinMovementRange: () => {
                const activeUnit = this.getActiveUnit();
                return activeUnit
                    ? getEnemiesWithinMovementRange(activeUnit, this.grid, this.unitsHolder, this.pathHelper)
                    : undefined;
            },
            getSummonTargetCell: (caster, spell) => getAvailableSummonCells(caster, this.grid, spell)[0],
            createSummonedUnit: ({ amount, faction, team, unitName }) => {
                const factionName = ToFactionName[faction];
                if (!factionName) {
                    return undefined;
                }

                try {
                    const effectFactory = new EffectFactory();
                    const abilityFactory = new AbilityFactory(effectFactory);
                    const properties = HoCConfig.getCreatureConfig(team, factionName, unitName, "", amount);
                    return Unit.createUnit(
                        { ...properties, id: HoCLib.createSecureUuid(), team },
                        gridSettings,
                        team,
                        UnitVals.CREATURE,
                        abilityFactory,
                        effectFactory,
                        true,
                    );
                } catch {
                    return undefined;
                }
            },
            runtime: this.runtime,
        });
    }
    private createTurnEngine(): TurnEngine {
        return new TurnEngine({
            fightProperties: this.getFightProperties(),
            grid: this.grid,
            unitsHolder: this.unitsHolder,
            moveHandler: this.moveHandler,
            sceneLog: this.sceneLog,
            getCurrentActiveUnitId: () => this.activeUnitId,
            runtime: this.runtime,
        });
    }
    private applyEngineResult(result: IGameActionResult): void {
        this.applyEvents(result.events);
    }
    private applyEvents(events: GameEvent[]): void {
        if (!events.length) {
            return;
        }

        for (const event of events) {
            if (event.type === "next_unit_selected") {
                this.activeUnitId = event.unitId;
            } else if (event.type === "turn_completed" && event.unitId === this.activeUnitId) {
                this.activeUnitId = undefined;
            } else if (event.type === "fight_finished") {
                this.activeUnitId = undefined;
            }
        }

        this.eventLog.push(...events);
        this.stateVersion += 1;
    }
    private advanceUntilActiveOrFinished(): void {
        let guard = 0;
        while (!this.activeUnitId && !this.getFightProperties().hasFightFinished() && guard < 32) {
            guard += 1;
            const result = this.createTurnEngine().advanceAfterNoActiveUnit();
            this.applyEvents(result.events);
            if (result.nextUnit && this.activeUnitId) {
                return;
            }
            if (result.fightFinished) {
                return;
            }
            if (!result.events.length) {
                return;
            }
        }
    }
    private toPublicState(lastEvents: GameEvent[] = this.eventLog.slice(-10)): PublicMatchState {
        const activeUnit = this.getActiveUnit();
        const finishWinner = winningTeamFromEvents(this.eventLog);
        const units = [...this.unitsHolder.getAllUnits().values()]
            .filter((unit) => !unit.isDead())
            .sort((left, right) => {
                const teamDelta = left.getTeam() - right.getTeam();
                return teamDelta !== 0 ? teamDelta : left.getName().localeCompare(right.getName());
            });

        return {
            matchId: this.matchId,
            stateVersion: this.stateVersion,
            phase: this.getFightProperties().hasFightFinished()
                ? "finished"
                : this.getFightProperties().hasFightStarted()
                  ? "fight"
                  : "placement",
            grid: {
                type: gridTypeName(this.getFightProperties().getGridType()),
                size: gridSettings.getGridSize(),
                currentLap: this.getFightProperties().getCurrentLap(),
                narrowedLayers: this.getFightProperties().getLapsNarrowed(),
            },
            activeUnitId: activeUnit?.getId(),
            activeTeam: activeUnit ? teamToName(activeUnit.getTeam()) : undefined,
            winner: finishWinner,
            units: units.map(serializeUnit),
            turnOrderPreview: units
                .slice()
                .sort((left, right) => right.getSpeed() - left.getSpeed())
                .map((unit) => unit.getId()),
            lastEvents,
        };
    }
    private rejected(rejectionReason: GameActionRejectionReason, message: string): SubmitActionResult {
        return {
            completed: false,
            rejectionReason,
            message,
            events: [],
            state: this.toPublicState([]),
            nextLegalActions: [],
        };
    }
    private getFightProperties(): FightProperties {
        return this.fightProperties;
    }
}
