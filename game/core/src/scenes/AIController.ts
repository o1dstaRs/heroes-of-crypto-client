import {
    AI,
    AttackVals,
    FightStateManager,
    Grid,
    GridMath,
    HoCConstants,
    HoCMath,
    IWeightedRoute,
    PathHelper,
    Unit,
    UnitsHolder,
} from "@heroesofcrypto/common";
import { RenderableUnit } from "./RenderableUnit";
import { HoverManager } from "./HoverManager";
import { ButtonManager } from "./ButtonManager";
import { SceneSettings } from "./SceneSettings";

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
    getPathHelper(): PathHelper;
    getHoverManager(): HoverManager;
    getButtonManager(): ButtonManager;
    getSceneSettings(): SceneSettings;
    getSceneLog(): ISceneLogForAI;

    // State setters
    setCurrentActiveKnownPaths(paths: Map<number, IWeightedRoute[]> | undefined): void;
    setSelectedAttackType(type: number): void;

    // Actions
    executeAttackSequence(attacker: RenderableUnit, target: Unit, attackFrom: HoCMath.XY): Promise<void>;
    executeMoveSequence(
        unit: RenderableUnit,
        path: HoCMath.XY[],
        overrideFootprint?: HoCMath.XY[],
        onComplete?: () => void,
    ): void;
    finishTurn(): void;
    refreshUnits(): void;
}

/**
 * AIController manages AI decision-making and action execution.
 * Extracted from Sandbox to improve code organization.
 */
export class AIController {
    private context: IAIContext;
    // AI State
    public isAIActive = false;
    public performingAction = false;
    public constructor(context: IAIContext) {
        this.context = context;
    }
    /**
     * Check if AI should be triggered for the current turn.
     */
    public shouldTriggerAI(): boolean {
        const currentUnit = this.context.getCurrentActiveUnit();
        if (!currentUnit) return false;

        return (this.isAIActive || currentUnit.hasAbilityActive("AI Driven")) && !this.performingAction;
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

            await this.performAction(wasAIActive);
            onComplete?.();
        }, delayMs);
    }
    /**
     * Main AI action logic - decides and executes the best action for current unit.
     */
    public async performAction(wasAIActive: boolean): Promise<void> {
        const currentUnit = this.context.getCurrentActiveUnit();
        if (!currentUnit) return;

        let actionPerformed = false;

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
            currentUnit.decreaseMorale(
                HoCConstants.MORALE_CHANGE_FOR_SKIP,
                FightStateManager.getInstance().getFightProperties().getAdditionalMoralePerTeam(currentUnit.getTeam()),
            );
            this.context.getSceneLog().updateLog(`${currentUnit.getName()} skip turn`);
            this.context.finishTurn();
        }

        this.isAIActive = wasAIActive;
        this.performingAction = false;
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
        if (currentUnit.selectAttackType(AttackVals.MELEE)) {
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

        if (attackFromPos) {
            if (!currentUnit.isSmallSize()) {
                attackFromPos.x -= gs.getHalfStep();
                attackFromPos.y -= gs.getHalfStep();
            }
            this.context.getHoverManager().showSilhouetteForUnit(currentUnit.getUnitProperties(), attackFromPos);
        }

        // Execute move then attack
        if (route && Array.isArray(route) && route.length > 0) {
            const target = unitToAttack;
            const attackCell = attackFromCell;
            const aiActive = wasAIActive;

            this.context.executeMoveSequence(currentUnit, route, undefined, async () => {
                await this.context.executeAttackSequence(currentUnit, target, attackCell);
                this.isAIActive = aiActive;
                this.performingAction = false;
            });
            return true; // Callback handles cleanup
        } else {
            // No route - attack directly
            await this.context.executeAttackSequence(currentUnit, unitToAttack, attackFromCell);
            this.isAIActive = wasAIActive;
            this.performingAction = false;
            return true;
        }
    }
    /**
     * Handle MELEE_ATTACK action type (no move needed).
     */
    private async handleMeleeAttack(currentUnit: RenderableUnit, action: AI.IAIAction): Promise<boolean> {
        if (currentUnit.selectAttackType(AttackVals.MELEE)) {
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

        await this.context.executeAttackSequence(currentUnit, targetUnit, attackFromCell);
        return true;
    }
    /**
     * Handle RANGE_ATTACK action type.
     */
    private async handleRangeAttack(currentUnit: RenderableUnit, action: AI.IAIAction): Promise<boolean> {
        if (currentUnit.selectAttackType(AttackVals.RANGE)) {
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

        await this.context.executeAttackSequence(currentUnit, targetUnit, attackFromCell);
        return true;
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

        if (moveToPos) {
            if (!currentUnit.isSmallSize()) {
                moveToPos.x -= gs.getHalfStep();
                moveToPos.y -= gs.getHalfStep();
            }
            this.context.getHoverManager().showSilhouetteForUnit(currentUnit.getUnitProperties(), moveToPos);
        }

        // Execute move with cleanup callback
        this.context.executeMoveSequence(currentUnit, route, undefined, () => {
            this.context.finishTurn();
            this.isAIActive = wasAIActive;
            this.performingAction = false;
        });

        return true;
    }
}
