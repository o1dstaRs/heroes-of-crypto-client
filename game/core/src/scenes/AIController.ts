import {
    AI,
    AttackVals,
    Grid,
    GridMath,
    HoCMath,
    IWeightedRoute,
    PathHelper,
    Unit,
    UnitsHolder,
    FightStateManager,
} from "@heroesofcrypto/common";
import type { AttackHandler, AttackType, GameAction, TeamType } from "@heroesofcrypto/common";
import { RenderableUnit } from "./RenderableUnit";
import { HoverManager } from "./HoverManager";
import { ButtonManager } from "./ButtonManager";
import { SceneSettings } from "./SceneSettings";
import {
    chooseLocalModelAction,
    createLocalModelFightStateSummary,
    createLocalModelActions,
    describeLocalModelActiveUnit,
    getLocalModelTeamName,
    getLocalModelOpponentConfig,
    markLocalModelAction,
    recordLocalModelFightLog,
    type LocalModelLegalAction,
    type LocalModelOpponentConfig,
} from "./LocalModelOpponent";

/**
 * Simple log interface for scene logging.
 */
export interface ISceneLogForAI {
    updateLog(message: string): void;
}

/**
 * Interface defining the context needed by AIController.
 * Implemented by Sandbox to provide necessary methods and state.
 */
export interface IAIContext {
    // State accessors
    getCurrentActiveUnit(): RenderableUnit | undefined;
    getGrid(): Grid;
    getGridMatrix(): number[][];
    getUnitsHolder(): UnitsHolder;
    getAttackHandler(): AttackHandler;
    getPathHelper(): PathHelper;
    getHoverManager(): HoverManager;
    getButtonManager(): ButtonManager;
    getSceneSettings(): SceneSettings;
    getSceneLog(): ISceneLogForAI;

    // State setters
    setCurrentActiveKnownPaths(paths: Map<number, IWeightedRoute[]> | undefined): void;
    setSelectedAttackType(type: number): void;

    // Actions
    isAuthoritativeAction?(action: GameAction): boolean;
    /**
     * Whether the generic "AI toggle" (isAIActive) may auto-play the active unit.
     * Sandbox (no external transport) allows it for single-player AI. Ranked must
     * disallow it — otherwise the heuristic AI would drive BOTH teams' units,
     * since the toggle isn't team-gated. The local-model team path is separate.
     */
    isToggleDrivenAiAllowed?(): boolean;
    applyGameAction(action: GameAction): boolean;
    executeAttackSequence(
        attacker: RenderableUnit,
        target: Unit,
        attackFrom: HoCMath.XY,
        replayAction?: Extract<GameAction, { type: "melee_attack" }> | Extract<GameAction, { type: "range_attack" }>,
    ): Promise<boolean>;
    executeMoveSequence(
        unit: RenderableUnit,
        path: HoCMath.XY[],
        overrideFootprint?: HoCMath.XY[],
        onComplete?: () => void,
        replayAction?: Extract<GameAction, { type: "move_unit" }>,
    ): boolean;
    refreshUnits(): void;
}

/**
 * AIController manages AI decision-making and action execution.
 * Extracted from Sandbox to improve code organization.
 */
export class AIController {
    private static readonly MOVE_ACTION_TIMEOUT_MS = 6000;
    private context: IAIContext;
    private readonly localModelOpponent: LocalModelOpponentConfig;
    private localModelTeamOverride?: TeamType;
    private localModelTeamOverrideSet = false;
    private lastLocalModelUnitId: string | undefined;
    private attackTypeSetupUnitId: string | undefined;
    // AI State
    public isAIActive = false;
    public performingAction = false;
    public constructor(context: IAIContext) {
        this.context = context;
        this.localModelOpponent = getLocalModelOpponentConfig();
    }
    /**
     * Restore the AI toggle to the player's pre-auto-turn choice. AI-Driven units force AI on for
     * their turn (and the toggle is disabled); afterwards we put it back where it was — keep it on
     * only if the player had enabled AI for the whole fight, otherwise turn it back off.
     */
    private restoreAIState(priorAIActive: boolean): void {
        this.isAIActive = priorAIActive;
        const buttonManager = this.context.getButtonManager();
        buttonManager.sc_isAIActive = priorAIActive;
        buttonManager.refreshButtons(true);
    }
    private finishAIAction(priorAIActive: boolean): void {
        this.restoreAIState(priorAIActive);
        this.performingAction = false;
    }
    private endTurnIfStillActive(unit: RenderableUnit): void {
        const currentUnit = this.context.getCurrentActiveUnit();
        if (currentUnit?.getId() === unit.getId()) {
            this.context.applyGameAction(this.modelAction(unit, { type: "end_turn", unitId: unit.getId() }));
        }
    }
    private scheduleMoveWatchdog(
        unit: RenderableUnit,
        priorAIActive: boolean,
        onTimeout?: () => void,
    ): ReturnType<typeof setTimeout> {
        return setTimeout(() => {
            if (!this.performingAction) {
                return;
            }

            const currentUnit = this.context.getCurrentActiveUnit();
            if (currentUnit?.getId() !== unit.getId()) {
                this.finishAIAction(priorAIActive);
                return;
            }

            onTimeout?.();
            this.endTurnIfStillActive(unit);
            this.finishAIAction(priorAIActive);
        }, AIController.MOVE_ACTION_TIMEOUT_MS);
    }
    /**
     * Check if AI should be triggered for the current turn.
     */
    public shouldTriggerAI(): boolean {
        const currentUnit = this.context.getCurrentActiveUnit();
        if (!currentUnit) return false;
        const toggleAllowed = this.context.isToggleDrivenAiAllowed?.() ?? true;
        const playerAIEnabled = this.localModelOpponent.enabled ? false : toggleAllowed && this.isAIActive;

        return (
            (this.shouldControlUnit(currentUnit) || playerAIEnabled || currentUnit.hasAbilityActive("AI Driven")) &&
            !this.performingAction
        );
    }
    public shouldControlCurrentUnit(): boolean {
        const currentUnit = this.context.getCurrentActiveUnit();
        return !!currentUnit && this.shouldControlUnit(currentUnit);
    }
    public setLocalModelTeamOverride(team: TeamType | undefined): void {
        this.localModelTeamOverride = team;
        this.localModelTeamOverrideSet = true;
    }
    private shouldControlUnit(unit: Unit): boolean {
        const modelTeam = this.localModelTeamOverrideSet
            ? this.localModelTeamOverride
            : this.localModelOpponent.modelTeam;
        return this.localModelOpponent.enabled && unit.getTeam() === modelTeam;
    }
    private modelAction<T extends GameAction>(unit: Unit, action: T): T {
        return this.shouldControlUnit(unit) ? markLocalModelAction(action) : action;
    }
    /**
     * Trigger AI action with proper delay.
     * @param delayMs - Delay in milliseconds before AI acts
     * @param onComplete - Optional callback after AI action completes
     */
    public triggerAIAction(delayMs: number, onComplete?: () => void): void {
        if (!this.shouldTriggerAI()) return;

        this.performingAction = true;
        const wasAIActive = this.isAIActive;

        setTimeout(async () => {
            const currentUnit = this.context.getCurrentActiveUnit();
            if (!currentUnit) {
                this.performingAction = false;
                onComplete?.();
                return;
            }

            this.isAIActive = true;
            if (!this.shouldControlUnit(currentUnit)) {
                this.context.getButtonManager().sc_isAIActive = true;
            }
            this.context.getButtonManager().refreshButtons(true);

            try {
                await this.performAction(wasAIActive);
            } catch (err) {
                console.error("AI action failed", err);
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
            } finally {
                onComplete?.();
            }
        }, delayMs);
    }
    /**
     * Main AI action logic - decides and executes the best action for current unit.
     */
    public async performAction(wasAIActive: boolean): Promise<void> {
        const currentUnit = this.context.getCurrentActiveUnit();
        if (!currentUnit) {
            this.finishAIAction(wasAIActive);
            return;
        }

        let actionPerformed = false;

        if (this.shouldControlUnit(currentUnit)) {
            actionPerformed = await this.performLocalModelAction(currentUnit, wasAIActive);
            if (actionPerformed) {
                return;
            }
        }

        const action = AI.findTarget(
            currentUnit,
            this.context.getGrid(),
            this.context.getGridMatrix(),
            this.context.getUnitsHolder(),
            this.context.getPathHelper(),
        );

        if (action?.actionType() === AI.AIActionType.MOVE_AND_MELEE_ATTACK) {
            actionPerformed = await this.handleMoveAndMeleeAttack(currentUnit, action, wasAIActive);
            if (actionPerformed) return; // Early return handled internally with callbacks
        } else if (action?.actionType() === AI.AIActionType.MELEE_ATTACK) {
            actionPerformed = await this.handleMeleeAttack(currentUnit, action);
        } else if (action?.actionType() === AI.AIActionType.RANGE_ATTACK) {
            actionPerformed = await this.handleRangeAttack(currentUnit, action);
        } else {
            // Move only
            const moveHandled = this.handleMoveOnly(currentUnit, action, wasAIActive);
            if (moveHandled) return; // Early return - callback handles cleanup
        }

        if (!actionPerformed) {
            this.endTurnIfStillActive(currentUnit);
        }

        this.finishAIAction(wasAIActive);
    }
    private async performLocalModelAction(currentUnit: RenderableUnit, wasAIActive: boolean): Promise<boolean> {
        if (this.lastLocalModelUnitId !== currentUnit.getId()) {
            this.lastLocalModelUnitId = currentUnit.getId();
            this.attackTypeSetupUnitId = undefined;
        }
        const allowAttackTypeSetup = this.attackTypeSetupUnitId !== currentUnit.getId();
        const legalActions = createLocalModelActions({
            matchId: "ui-local-model",
            stateVersion: FightStateManager.getInstance().getFightProperties().getCurrentLap(),
            activeUnit: currentUnit,
            grid: this.context.getGrid(),
            unitsHolder: this.context.getUnitsHolder(),
            attackHandler: this.context.getAttackHandler(),
            fightProperties: FightStateManager.getInstance().getFightProperties(),
            pathHelper: this.context.getPathHelper(),
            allowAttackTypeSetup,
        });

        const choice = await chooseLocalModelAction({
            config: this.localModelOpponent,
            activeUnit: currentUnit,
            unitsHolder: this.context.getUnitsHolder(),
            actions: legalActions,
            matchId: "ui-local-model",
            stateVersion: FightStateManager.getInstance().getFightProperties().getCurrentLap(),
        });
        if (!choice.action) {
            const reason = choice.error ?? choice.rawContent?.slice(0, 80) ?? "invalid model action";
            this.recordLocalModelResult(
                currentUnit,
                undefined,
                choice.decisionId,
                false,
                `fallback_builtin_ai:${reason}`,
            );
            return false;
        }

        if (choice.action.action.type === "select_attack_type") {
            this.attackTypeSetupUnitId = currentUnit.getId();
        } else {
            this.attackTypeSetupUnitId = undefined;
        }
        return this.executeLocalModelAction(currentUnit, choice.action, wasAIActive, choice.decisionId);
    }
    private recordLocalModelResult(
        currentUnit: RenderableUnit,
        legalAction: LocalModelLegalAction | undefined,
        decisionId: string | undefined,
        completed: boolean,
        error?: string,
    ): void {
        if (!decisionId) {
            return;
        }
        recordLocalModelFightLog({
            id: decisionId,
            timestamp: new Date().toISOString(),
            kind: "result",
            matchId: "ui-local-model",
            stateVersion: FightStateManager.getInstance().getFightProperties().getCurrentLap(),
            team: getLocalModelTeamName(currentUnit.getTeam()),
            activeUnit: describeLocalModelActiveUnit(currentUnit),
            stateSummary: createLocalModelFightStateSummary(currentUnit, this.context.getUnitsHolder()),
            selectedAction: legalAction
                ? {
                      index: legalAction.index,
                      label: legalAction.label,
                      kind: legalAction.kind,
                      summary: legalAction.summary,
                      action: legalAction.action,
                  }
                : undefined,
            completed,
            error,
        });
    }
    private async executeLocalModelAction(
        currentUnit: RenderableUnit,
        legalAction: LocalModelLegalAction,
        wasAIActive: boolean,
        decisionId?: string,
    ): Promise<boolean> {
        const action = legalAction.action;
        if (action.type === "select_attack_type") {
            if (this.context.applyGameAction(this.modelAction(currentUnit, action))) {
                this.finishAIAction(wasAIActive);
                this.recordLocalModelResult(currentUnit, legalAction, decisionId, true);
                return true;
            }

            this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "attack_type_setup_failed");
            return false;
        }

        if (action.type === "move_unit") {
            if (!action.path?.length) {
                this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "missing_path");
                return false;
            }
            const replayAction = this.modelAction(currentUnit, action);
            const isAuthoritative = this.context.isAuthoritativeAction?.(replayAction) ?? false;
            const watchdog = isAuthoritative
                ? undefined
                : this.scheduleMoveWatchdog(currentUnit, wasAIActive, () => {
                      this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "move_timeout");
                  });
            const started = this.context.executeMoveSequence(
                currentUnit,
                action.path,
                action.targetCells,
                () => {
                    if (!watchdog) {
                        return;
                    }
                    clearTimeout(watchdog);
                    this.endTurnIfStillActive(currentUnit);
                    this.recordLocalModelResult(currentUnit, legalAction, decisionId, true);
                    this.finishAIAction(wasAIActive);
                },
                replayAction,
            );
            if (!started) {
                if (watchdog) {
                    clearTimeout(watchdog);
                }
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
                this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "move_not_started");
            } else if (isAuthoritative) {
                this.recordLocalModelResult(currentUnit, legalAction, decisionId, true);
                this.finishAIAction(wasAIActive);
            }
            return true;
        }

        if (action.type === "melee_attack") {
            const target = this.context.getUnitsHolder().getAllUnits().get(action.targetId);
            const attackFrom = action.attackFrom ?? currentUnit.getBaseCell();
            if (!target || !attackFrom) {
                this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "missing_melee_target");
                return false;
            }

            const replayAction = this.modelAction(currentUnit, action);
            if (this.context.isAuthoritativeAction?.(replayAction)) {
                const completed = await this.context.executeAttackSequence(
                    currentUnit,
                    target,
                    attackFrom,
                    replayAction,
                );
                if (!completed) {
                    this.endTurnIfStillActive(currentUnit);
                }
                this.finishAIAction(wasAIActive);
                this.recordLocalModelResult(
                    currentUnit,
                    legalAction,
                    decisionId,
                    completed,
                    completed ? undefined : "melee_failed",
                );
                return true;
            }

            if (action.path?.length) {
                const watchdog = this.scheduleMoveWatchdog(currentUnit, wasAIActive, () => {
                    this.recordLocalModelResult(
                        currentUnit,
                        legalAction,
                        decisionId,
                        false,
                        "move_before_melee_timeout",
                    );
                });
                const started = this.context.executeMoveSequence(
                    currentUnit,
                    action.path,
                    undefined,
                    async () => {
                        clearTimeout(watchdog);
                        try {
                            const completed = await this.context.executeAttackSequence(
                                currentUnit,
                                target,
                                attackFrom,
                                this.modelAction(currentUnit, action),
                            );
                            if (!completed) {
                                this.endTurnIfStillActive(currentUnit);
                            }
                            this.recordLocalModelResult(
                                currentUnit,
                                legalAction,
                                decisionId,
                                completed,
                                completed ? undefined : "melee_after_move_failed",
                            );
                        } catch (err) {
                            this.endTurnIfStillActive(currentUnit);
                            this.recordLocalModelResult(
                                currentUnit,
                                legalAction,
                                decisionId,
                                false,
                                `melee_after_move_error:${(err as Error).message}`,
                            );
                        } finally {
                            this.finishAIAction(wasAIActive);
                        }
                    },
                    this.modelAction(currentUnit, {
                        type: "move_unit",
                        unitId: currentUnit.getId(),
                        path: action.path,
                    }),
                );
                if (!started) {
                    clearTimeout(watchdog);
                    this.endTurnIfStillActive(currentUnit);
                    this.finishAIAction(wasAIActive);
                    this.recordLocalModelResult(
                        currentUnit,
                        legalAction,
                        decisionId,
                        false,
                        "move_before_melee_not_started",
                    );
                }
                return true;
            }

            const completed = await this.context.executeAttackSequence(
                currentUnit,
                target,
                attackFrom,
                this.modelAction(currentUnit, action),
            );
            if (!completed) {
                this.endTurnIfStillActive(currentUnit);
            }
            this.finishAIAction(wasAIActive);
            this.recordLocalModelResult(
                currentUnit,
                legalAction,
                decisionId,
                completed,
                completed ? undefined : "melee_failed",
            );
            return true;
        }

        if (action.type === "range_attack") {
            const target = this.context.getUnitsHolder().getAllUnits().get(action.targetId);
            const gs = this.context.getSceneSettings().getGridSettings();
            const attackFrom = GridMath.getCellForPosition(gs, currentUnit.getPosition());
            if (!target || !attackFrom) {
                this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "missing_range_target");
                return false;
            }
            const completed = await this.context.executeAttackSequence(
                currentUnit,
                target,
                attackFrom,
                this.modelAction(currentUnit, action),
            );
            if (!completed) {
                this.endTurnIfStillActive(currentUnit);
            }
            this.finishAIAction(wasAIActive);
            this.recordLocalModelResult(
                currentUnit,
                legalAction,
                decisionId,
                completed,
                completed ? undefined : "range_failed",
            );
            return true;
        }

        if (this.context.applyGameAction(this.modelAction(currentUnit, action))) {
            this.finishAIAction(wasAIActive);
            this.recordLocalModelResult(currentUnit, legalAction, decisionId, true);
            return true;
        }

        this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "apply_game_action_failed");
        return false;
    }
    /**
     * Handle MOVE_AND_MELEE_ATTACK action type.
     * Returns true if action was initiated (may be async via callbacks).
     */
    private async handleMoveAndMeleeAttack(
        currentUnit: RenderableUnit,
        action: AI.IAIAction,
        wasAIActive: boolean,
    ): Promise<boolean> {
        if (this.selectAttackType(currentUnit, AttackVals.MELEE)) {
            this.context.getButtonManager().refreshButtons(true);
            this.context.refreshUnits();
        }

        this.context.setSelectedAttackType(currentUnit.getAttackTypeSelection());
        this.context.setCurrentActiveKnownPaths(action.currentActiveKnownPaths());

        const cellToAttack = action.cellToAttack();
        const attackFromCell = action.cellToMove();

        if (!cellToAttack || !attackFromCell) return false;

        const targetUnitId = this.context.getGrid().getOccupantUnitId(cellToAttack);
        if (targetUnitId === undefined) return false;

        const unitToAttack = this.context.getUnitsHolder().getAllUnits().get(targetUnitId);
        if (!unitToAttack) return false;

        // Get route
        const knownPaths = action.currentActiveKnownPaths();
        const movePaths = knownPaths?.get((attackFromCell.x << 4) | attackFromCell.y);
        const route = movePaths && Array.isArray(movePaths) && movePaths.length > 0 ? movePaths[0].route : undefined;
        const authoritativeAction = this.modelAction(currentUnit, {
            type: "melee_attack",
            attackerId: currentUnit.getId(),
            targetId: unitToAttack.getId(),
            attackFrom: attackFromCell,
            path: route,
        });
        if (this.context.isAuthoritativeAction?.(authoritativeAction)) {
            const attackCompleted = await this.context.executeAttackSequence(
                currentUnit,
                unitToAttack,
                attackFromCell,
                authoritativeAction,
            );
            if (!attackCompleted) {
                this.endTurnIfStillActive(currentUnit);
            }
            this.finishAIAction(wasAIActive);
            return true;
        }

        // Show silhouette
        const gs = this.context.getSceneSettings().getGridSettings();
        const attackFromPos = GridMath.getPositionForCell(attackFromCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());

        // For large (2x2) units the AI emits the top-right anchor cell and the stored position is
        // the 2x2 center (anchor - halfStep). Build the occupied footprint from that center and
        // hand it to executeMoveSequence so the unit lands exactly where the silhouette shows;
        // otherwise the move fallback mis-anchors it by one cell diagonally (wrong stand/attack pos).
        let moveFootprint: HoCMath.XY[] | undefined;
        if (attackFromPos) {
            if (!currentUnit.isSmallSize()) {
                attackFromPos.x -= gs.getHalfStep();
                attackFromPos.y -= gs.getHalfStep();
                moveFootprint = GridMath.getCellsAroundPosition(gs, attackFromPos);
            }
            this.context.getHoverManager().showSilhouetteForUnit(currentUnit.getUnitProperties(), attackFromPos);
        }

        // Execute move then attack
        if (route && Array.isArray(route) && route.length > 0) {
            const target = unitToAttack;
            const attackCell = attackFromCell;
            const aiActive = wasAIActive;
            const watchdog = this.scheduleMoveWatchdog(currentUnit, aiActive);

            const moveStarted = this.context.executeMoveSequence(
                currentUnit,
                route,
                moveFootprint,
                async () => {
                    clearTimeout(watchdog);
                    try {
                        const attackCompleted = await this.context.executeAttackSequence(
                            currentUnit,
                            target,
                            attackCell,
                            authoritativeAction,
                        );
                        if (!attackCompleted) {
                            this.endTurnIfStillActive(currentUnit);
                        }
                    } catch (err) {
                        console.error("AI move-and-attack failed", err);
                        this.endTurnIfStillActive(currentUnit);
                    } finally {
                        this.finishAIAction(aiActive);
                    }
                },
                this.modelAction(currentUnit, {
                    type: "move_unit",
                    unitId: currentUnit.getId(),
                    path: route,
                    targetCells: moveFootprint,
                }),
            );
            if (!moveStarted) {
                clearTimeout(watchdog);
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(aiActive);
            }
            return true; // Callback handles cleanup
        } else {
            // No route - attack directly
            const attackCompleted = await this.context.executeAttackSequence(
                currentUnit,
                unitToAttack,
                attackFromCell,
                this.modelAction(currentUnit, {
                    type: "melee_attack",
                    attackerId: currentUnit.getId(),
                    targetId: unitToAttack.getId(),
                    attackFrom: attackFromCell,
                }),
            );
            if (!attackCompleted) {
                this.endTurnIfStillActive(currentUnit);
            }
            this.finishAIAction(wasAIActive);
            return true;
        }
    }
    /**
     * Handle MELEE_ATTACK action type (no move needed).
     */
    private async handleMeleeAttack(currentUnit: RenderableUnit, action: AI.IAIAction): Promise<boolean> {
        if (this.selectAttackType(currentUnit, AttackVals.MELEE)) {
            this.context.getButtonManager().refreshButtons(true);
            this.context.refreshUnits();
        }

        this.context.setCurrentActiveKnownPaths(action.currentActiveKnownPaths());

        const cellToAttack = action.cellToAttack();
        const gs = this.context.getSceneSettings().getGridSettings();
        const attackFromCell = action.cellToMove() || GridMath.getCellForPosition(gs, currentUnit.getPosition());

        if (!cellToAttack || !attackFromCell) return false;

        const targetUnitId = this.context.getGrid().getOccupantUnitId(cellToAttack);
        if (!targetUnitId) return false;

        const targetUnit = this.context.getUnitsHolder().getAllUnits().get(targetUnitId);
        if (!targetUnit) return false;

        return this.context.executeAttackSequence(
            currentUnit,
            targetUnit,
            attackFromCell,
            this.modelAction(currentUnit, {
                type: "melee_attack",
                attackerId: currentUnit.getId(),
                targetId: targetUnit.getId(),
                attackFrom: attackFromCell,
            }),
        );
    }
    /**
     * Handle RANGE_ATTACK action type.
     */
    private async handleRangeAttack(currentUnit: RenderableUnit, action: AI.IAIAction): Promise<boolean> {
        if (this.selectAttackType(currentUnit, AttackVals.RANGE)) {
            this.context.getButtonManager().refreshButtons(true);
            this.context.refreshUnits();
        }

        this.context.setCurrentActiveKnownPaths(action.currentActiveKnownPaths());

        const cellToAttack = action.cellToAttack();
        const gs = this.context.getSceneSettings().getGridSettings();
        const attackFromCell = GridMath.getCellForPosition(gs, currentUnit.getPosition());

        if (!cellToAttack || !attackFromCell) return false;

        const targetUnitId = this.context.getGrid().getOccupantUnitId(cellToAttack);
        if (!targetUnitId) return false;

        const targetUnit = this.context.getUnitsHolder().getAllUnits().get(targetUnitId);
        if (!targetUnit) return false;

        return this.context.executeAttackSequence(
            currentUnit,
            targetUnit,
            attackFromCell,
            this.modelAction(currentUnit, {
                type: "range_attack",
                attackerId: currentUnit.getId(),
                targetId: targetUnit.getId(),
            }),
        );
    }
    /**
     * Handle move-only action.
     * Returns true if move was initiated (cleanup handled via callback).
     */
    private handleMoveOnly(
        currentUnit: RenderableUnit,
        action: AI.IAIAction | undefined,
        wasAIActive: boolean,
    ): boolean {
        const cellToMove = action?.cellToMove();
        if (!cellToMove || !currentUnit.canMove()) return false;

        const knownPaths = action?.currentActiveKnownPaths();
        const movePaths = knownPaths?.get((cellToMove.x << 4) | cellToMove.y);
        if (!movePaths || !Array.isArray(movePaths) || movePaths.length === 0) return false;

        const route = movePaths[0].route;

        // Show silhouette
        const gs = this.context.getSceneSettings().getGridSettings();
        const moveToPos = GridMath.getPositionForCell(cellToMove, gs.getMinX(), gs.getStep(), gs.getHalfStep());

        // Same 2x2 footprint correction as handleMoveAndMeleeAttack: land the large unit where the
        // silhouette shows instead of letting the move fallback mis-anchor it by one cell diagonally.
        let moveFootprint: HoCMath.XY[] | undefined;
        if (moveToPos) {
            if (!currentUnit.isSmallSize()) {
                moveToPos.x -= gs.getHalfStep();
                moveToPos.y -= gs.getHalfStep();
                moveFootprint = GridMath.getCellsAroundPosition(gs, moveToPos);
            }
            this.context.getHoverManager().showSilhouetteForUnit(currentUnit.getUnitProperties(), moveToPos);
        }

        // Execute move with cleanup callback
        const moveAction = this.modelAction(currentUnit, {
            type: "move_unit",
            unitId: currentUnit.getId(),
            path: route,
            targetCells: moveFootprint,
        });
        const isAuthoritative = this.context.isAuthoritativeAction?.(moveAction) ?? false;
        const watchdog = isAuthoritative ? undefined : this.scheduleMoveWatchdog(currentUnit, wasAIActive);
        const moveStarted = this.context.executeMoveSequence(
            currentUnit,
            route,
            moveFootprint,
            () => {
                if (!watchdog) {
                    return;
                }
                clearTimeout(watchdog);
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
            },
            moveAction,
        );
        if (!moveStarted) {
            if (watchdog) {
                clearTimeout(watchdog);
            }
            this.endTurnIfStillActive(currentUnit);
            this.finishAIAction(wasAIActive);
        } else if (isAuthoritative) {
            this.finishAIAction(wasAIActive);
        }

        return true;
    }
    private selectAttackType(unit: RenderableUnit, attackType: AttackType): boolean {
        if (unit.getAttackTypeSelection() === attackType) {
            return false;
        }
        return this.context.applyGameAction(
            this.modelAction(unit, {
                type: "select_attack_type",
                unitId: unit.getId(),
                attackType,
            }),
        );
    }
}
