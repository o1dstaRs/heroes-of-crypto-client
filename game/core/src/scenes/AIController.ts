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
import type { AttackHandler, AttackType, GameAction } from "@heroesofcrypto/common";
import { RenderableUnit } from "./RenderableUnit";
import { HoverManager } from "./HoverManager";
import { ButtonManager } from "./ButtonManager";
import { SceneSettings } from "./SceneSettings";
import {
    chooseLocalModelAction,
    createLocalModelActions,
    getLocalModelOpponentConfig,
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
    applyGameAction(action: GameAction): boolean;
    executeAttackSequence(attacker: RenderableUnit, target: Unit, attackFrom: HoCMath.XY): Promise<boolean>;
    executeMoveSequence(
        unit: RenderableUnit,
        path: HoCMath.XY[],
        overrideFootprint?: HoCMath.XY[],
        onComplete?: () => void,
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
    // AI State
    public isAIActive = false;
    public performingAction = false;
    public constructor(context: IAIContext) {
        this.context = context;
        this.localModelOpponent = getLocalModelOpponentConfig();
        if (this.localModelOpponent.enabled) {
            this.context
                .getSceneLog()
                .updateLog(`Local model opponent enabled for ${this.localModelOpponent.modelTeam === 1 ? "UPPER" : "LOWER"}`);
        }
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
            this.context.applyGameAction({ type: "end_turn", unitId: unit.getId() });
        }
    }
    private scheduleMoveWatchdog(unit: RenderableUnit, priorAIActive: boolean): ReturnType<typeof setTimeout> {
        return setTimeout(() => {
            if (!this.performingAction) {
                return;
            }

            const currentUnit = this.context.getCurrentActiveUnit();
            if (currentUnit?.getId() !== unit.getId()) {
                this.finishAIAction(priorAIActive);
                return;
            }

            this.context.getSceneLog().updateLog(`${unit.getName()} AI action timed out`);
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

        return (
            (this.shouldControlUnit(currentUnit) || this.isAIActive || currentUnit.hasAbilityActive("AI Driven")) &&
            !this.performingAction
        );
    }
    public shouldControlCurrentUnit(): boolean {
        const currentUnit = this.context.getCurrentActiveUnit();
        return !!currentUnit && this.shouldControlUnit(currentUnit);
    }
    private shouldControlUnit(unit: Unit): boolean {
        return this.localModelOpponent.enabled && unit.getTeam() === this.localModelOpponent.modelTeam;
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
            this.context.getButtonManager().refreshButtons(true);
            this.context.getButtonManager().sc_isAIActive = true;

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
            this.context.getSceneLog().updateLog(`${currentUnit.getName()} uses fallback AI`);
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
        const legalActions = createLocalModelActions({
            matchId: "ui-local-model",
            stateVersion: FightStateManager.getInstance().getFightProperties().getCurrentLap(),
            activeUnit: currentUnit,
            grid: this.context.getGrid(),
            unitsHolder: this.context.getUnitsHolder(),
            attackHandler: this.context.getAttackHandler(),
            fightProperties: FightStateManager.getInstance().getFightProperties(),
            pathHelper: this.context.getPathHelper(),
        });

        const choice = await chooseLocalModelAction({
            config: this.localModelOpponent,
            activeUnit: currentUnit,
            unitsHolder: this.context.getUnitsHolder(),
            actions: legalActions,
        });
        if (!choice.action) {
            const reason = choice.error ?? choice.rawContent?.slice(0, 80) ?? "invalid model action";
            this.context.getSceneLog().updateLog(`Local model returned no legal action (${reason})`);
            return false;
        }

        this.context.getSceneLog().updateLog(`Local model: ${choice.action.summary}`);
        return this.executeLocalModelAction(currentUnit, choice.action, wasAIActive);
    }
    private async executeLocalModelAction(
        currentUnit: RenderableUnit,
        legalAction: LocalModelLegalAction,
        wasAIActive: boolean,
    ): Promise<boolean> {
        const action = legalAction.action;
        if (action.type === "move_unit") {
            if (!action.path?.length) {
                return false;
            }
            const watchdog = this.scheduleMoveWatchdog(currentUnit, wasAIActive);
            const started = this.context.executeMoveSequence(currentUnit, action.path, action.targetCells, () => {
                clearTimeout(watchdog);
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
            });
            if (!started) {
                clearTimeout(watchdog);
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
            }
            return true;
        }

        if (action.type === "melee_attack") {
            const target = this.context.getUnitsHolder().getAllUnits().get(action.targetId);
            const attackFrom = action.attackFrom ?? currentUnit.getBaseCell();
            if (!target || !attackFrom) {
                return false;
            }

            if (action.path?.length) {
                const watchdog = this.scheduleMoveWatchdog(currentUnit, wasAIActive);
                const started = this.context.executeMoveSequence(currentUnit, action.path, undefined, async () => {
                    clearTimeout(watchdog);
                    try {
                        const completed = await this.context.executeAttackSequence(currentUnit, target, attackFrom);
                        if (!completed) {
                            this.endTurnIfStillActive(currentUnit);
                        }
                    } finally {
                        this.finishAIAction(wasAIActive);
                    }
                });
                if (!started) {
                    clearTimeout(watchdog);
                    this.endTurnIfStillActive(currentUnit);
                    this.finishAIAction(wasAIActive);
                }
                return true;
            }

            const completed = await this.context.executeAttackSequence(currentUnit, target, attackFrom);
            if (!completed) {
                this.endTurnIfStillActive(currentUnit);
            }
            this.finishAIAction(wasAIActive);
            return true;
        }

        if (action.type === "range_attack") {
            const target = this.context.getUnitsHolder().getAllUnits().get(action.targetId);
            const gs = this.context.getSceneSettings().getGridSettings();
            const attackFrom = GridMath.getCellForPosition(gs, currentUnit.getPosition());
            if (!target || !attackFrom) {
                return false;
            }
            const completed = await this.context.executeAttackSequence(currentUnit, target, attackFrom);
            if (!completed) {
                this.endTurnIfStillActive(currentUnit);
            }
            this.finishAIAction(wasAIActive);
            return true;
        }

        if (this.context.applyGameAction(action)) {
            this.finishAIAction(wasAIActive);
            return true;
        }

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

            const moveStarted = this.context.executeMoveSequence(currentUnit, route, moveFootprint, async () => {
                clearTimeout(watchdog);
                try {
                    const attackCompleted = await this.context.executeAttackSequence(currentUnit, target, attackCell);
                    if (!attackCompleted) {
                        this.endTurnIfStillActive(currentUnit);
                    }
                } catch (err) {
                    console.error("AI move-and-attack failed", err);
                    this.endTurnIfStillActive(currentUnit);
                } finally {
                    this.finishAIAction(aiActive);
                }
            });
            if (!moveStarted) {
                clearTimeout(watchdog);
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(aiActive);
            }
            return true; // Callback handles cleanup
        } else {
            // No route - attack directly
            const attackCompleted = await this.context.executeAttackSequence(currentUnit, unitToAttack, attackFromCell);
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

        return this.context.executeAttackSequence(currentUnit, targetUnit, attackFromCell);
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

        return this.context.executeAttackSequence(currentUnit, targetUnit, attackFromCell);
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
        const watchdog = this.scheduleMoveWatchdog(currentUnit, wasAIActive);
        const moveStarted = this.context.executeMoveSequence(currentUnit, route, moveFootprint, () => {
            clearTimeout(watchdog);
            this.endTurnIfStillActive(currentUnit);
            this.finishAIAction(wasAIActive);
        });
        if (!moveStarted) {
            clearTimeout(watchdog);
            this.endTurnIfStillActive(currentUnit);
            this.finishAIAction(wasAIActive);
        }

        return true;
    }
    private selectAttackType(unit: RenderableUnit, attackType: AttackType): boolean {
        if (unit.getAttackTypeSelection() === attackType) {
            return false;
        }
        return this.context.applyGameAction({
            type: "select_attack_type",
            unitId: unit.getId(),
            attackType,
        });
    }
}
