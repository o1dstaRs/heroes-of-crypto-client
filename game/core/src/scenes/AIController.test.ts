import { describe, expect, it, mock } from "bun:test";

import {
    AttackVals,
    GridSettings,
    TeamVals,
    type GameAction,
    type HoCMath,
    type IWeightedRoute,
} from "@heroesofcrypto/common";

import { AIController, type IAIContext } from "./AIController";
import type { LocalModelOpponentConfig } from "./LocalModelOpponent";
import type { RenderableUnit } from "./RenderableUnit";
import { SceneSettings } from "./SceneSettings";

const createUnit = (id = "ai-unit-1", team = TeamVals.LOWER): RenderableUnit =>
    ({
        canMove: () => true,
        getId: () => id,
        getName: () => "AI Unit",
        getTeam: () => team,
        getPosition: () => ({ x: 0, y: 0 }),
        getUnitProperties: () => ({}),
        getAttackTypeSelection: () => AttackVals.MELEE,
        hasAbilityActive: () => false,
        isSmallSize: () => true,
    }) as unknown as RenderableUnit;

const createMoveAction = (cellToMove: HoCMath.XY) => {
    const route: IWeightedRoute = {
        cell: cellToMove,
        firstAggrMet: false,
        hasLavaCell: false,
        hasWaterCell: false,
        route: [{ x: 1, y: 1 }, cellToMove],
        weight: 1,
    };
    const knownPaths = new Map<number, IWeightedRoute[]>([[(cellToMove.x << 4) | cellToMove.y, [route]]]);

    return {
        cellToAttack: () => undefined,
        cellToMove: () => cellToMove,
        currentActiveKnownPaths: () => knownPaths,
    };
};

const createMoveAndAttackAction = (cellToMove: HoCMath.XY, cellToAttack: HoCMath.XY) => {
    const action = createMoveAction(cellToMove);
    return {
        ...action,
        cellToAttack: () => cellToAttack,
    };
};

describe("AIController", () => {
    it("uses the resolved ranked model team instead of the raw URL team", () => {
        const unit = createUnit("human-unit-1", TeamVals.LOWER);
        const context = {
            getCurrentActiveUnit: () => unit,
        } as unknown as IAIContext;
        const controller = new AIController(context);
        (controller as unknown as { localModelOpponent: LocalModelOpponentConfig }).localModelOpponent = {
            enabled: true,
            modelTeam: TeamVals.UPPER,
            apiBase: "/hoc-local-model",
            modelName: "auto",
            authorization: "Bearer model-token",
            playerId: "model-player",
            style: "balanced",
        };

        expect(controller.shouldControlCurrentUnit()).toBe(false);
        controller.setLocalModelTeamOverride(TeamVals.LOWER);
        expect(controller.shouldControlCurrentUnit()).toBe(true);
    });

    it("can explicitly disable local model control for ranked viewer safety", () => {
        const unit = createUnit("human-unit-1", TeamVals.UPPER);
        const context = {
            getCurrentActiveUnit: () => unit,
        } as unknown as IAIContext;
        const controller = new AIController(context);
        (controller as unknown as { localModelOpponent: LocalModelOpponentConfig }).localModelOpponent = {
            enabled: true,
            modelTeam: TeamVals.UPPER,
            apiBase: "/hoc-local-model",
            modelName: "auto",
            authorization: "Bearer model-token",
            playerId: "model-player",
            style: "balanced",
        };

        expect(controller.shouldControlCurrentUnit()).toBe(true);
        controller.setLocalModelTeamOverride(undefined);
        expect(controller.shouldControlCurrentUnit()).toBe(false);
    });

    it("ends and unlocks an AI turn when the move animation cannot start", () => {
        const unit = createUnit();
        const appliedActions: GameAction[] = [];
        const buttonManager = {
            refreshButtons: mock(() => undefined),
            sc_isAIActive: true,
        };
        const sceneSettings = new SceneSettings(new GridSettings(4, 400, 0, 400, 0, 0, 0), true);
        const executeMoveSequence = mock(() => false);

        const context = {
            applyGameAction: (action: GameAction) => {
                appliedActions.push(action);
                return true;
            },
            executeAttackSequence: mock(async () => true),
            executeMoveSequence,
            getButtonManager: () => buttonManager,
            getCurrentActiveUnit: () => unit,
            getGrid: () => ({}),
            getGridMatrix: () => [],
            getHoverManager: () => ({
                showSilhouetteForUnit: mock(() => undefined),
            }),
            getPathHelper: () => ({}),
            getSceneLog: () => ({
                updateLog: mock(() => undefined),
            }),
            getSceneSettings: () => sceneSettings,
            getUnitsHolder: () => ({}),
            refreshUnits: mock(() => undefined),
            setCurrentActiveKnownPaths: mock(() => undefined),
            setSelectedAttackType: mock(() => undefined),
        } as unknown as IAIContext;

        const controller = new AIController(context);
        controller.isAIActive = true;
        controller.performingAction = true;

        const handled = (
            controller as unknown as {
                handleMoveOnly(
                    unit: RenderableUnit,
                    action: ReturnType<typeof createMoveAction>,
                    wasAIActive: boolean,
                ): boolean;
            }
        ).handleMoveOnly(unit, createMoveAction({ x: 2, y: 2 }), false);

        expect(handled).toBe(true);
        expect(executeMoveSequence).toHaveBeenCalledTimes(1);
        expect(appliedActions).toEqual([{ type: "end_turn", unitId: "ai-unit-1" }]);
        expect(controller.performingAction).toBe(false);
        expect(controller.isAIActive).toBe(false);
        expect(buttonManager.sc_isAIActive).toBe(false);
    });

    it("unlocks without a fallback end turn when an authoritative move is submitted", () => {
        const unit = createUnit();
        const appliedActions: GameAction[] = [];
        const buttonManager = {
            refreshButtons: mock(() => undefined),
            sc_isAIActive: true,
        };
        const sceneSettings = new SceneSettings(new GridSettings(4, 400, 0, 400, 0, 0, 0), true);
        const executeMoveSequence = mock(() => true);

        const context = {
            applyGameAction: (action: GameAction) => {
                appliedActions.push(action);
                return true;
            },
            executeAttackSequence: mock(async () => true),
            executeMoveSequence,
            getButtonManager: () => buttonManager,
            getCurrentActiveUnit: () => unit,
            getGrid: () => ({}),
            getGridMatrix: () => [],
            getHoverManager: () => ({
                showSilhouetteForUnit: mock(() => undefined),
            }),
            getPathHelper: () => ({}),
            getSceneLog: () => ({
                updateLog: mock(() => undefined),
            }),
            getSceneSettings: () => sceneSettings,
            getUnitsHolder: () => ({}),
            isAuthoritativeAction: (action: GameAction) => action.type === "move_unit",
            refreshUnits: mock(() => undefined),
            setCurrentActiveKnownPaths: mock(() => undefined),
            setSelectedAttackType: mock(() => undefined),
        } as unknown as IAIContext;

        const controller = new AIController(context);
        controller.isAIActive = true;
        controller.performingAction = true;

        const handled = (
            controller as unknown as {
                handleMoveOnly(
                    unit: RenderableUnit,
                    action: ReturnType<typeof createMoveAction>,
                    wasAIActive: boolean,
                ): boolean;
            }
        ).handleMoveOnly(unit, createMoveAction({ x: 2, y: 2 }), false);

        expect(handled).toBe(true);
        expect(executeMoveSequence).toHaveBeenCalledTimes(1);
        expect(appliedActions).toEqual([]);
        expect(controller.performingAction).toBe(false);
        expect(controller.isAIActive).toBe(false);
        expect(buttonManager.sc_isAIActive).toBe(false);
    });

    it("ends and unlocks an AI turn when a post-move melee attack is rejected", async () => {
        const unit = createUnit();
        const target = {
            getId: () => "target-1",
            getTeam: () => 2,
        };
        const appliedActions: GameAction[] = [];
        const buttonManager = {
            refreshButtons: mock(() => undefined),
            sc_isAIActive: true,
        };
        const sceneSettings = new SceneSettings(new GridSettings(4, 400, 0, 400, 0, 0, 0), true);
        let moveCompletion: Promise<void> | undefined;

        const context = {
            applyGameAction: (action: GameAction) => {
                appliedActions.push(action);
                return true;
            },
            executeAttackSequence: mock(async () => false),
            executeMoveSequence: mock((_unit, _path, _footprint, onComplete) => {
                moveCompletion = Promise.resolve(onComplete?.());
                return true;
            }),
            getButtonManager: () => buttonManager,
            getCurrentActiveUnit: () => unit,
            getGrid: () => ({
                getOccupantUnitId: () => "target-1",
            }),
            getGridMatrix: () => [],
            getHoverManager: () => ({
                showSilhouetteForUnit: mock(() => undefined),
            }),
            getPathHelper: () => ({}),
            getSceneLog: () => ({
                updateLog: mock(() => undefined),
            }),
            getSceneSettings: () => sceneSettings,
            getUnitsHolder: () => ({
                getAllUnits: () => new Map([["target-1", target]]),
            }),
            refreshUnits: mock(() => undefined),
            setCurrentActiveKnownPaths: mock(() => undefined),
            setSelectedAttackType: mock(() => undefined),
        } as unknown as IAIContext;

        const controller = new AIController(context);
        controller.isAIActive = true;
        controller.performingAction = true;

        const handled = await (
            controller as unknown as {
                handleMoveAndMeleeAttack(
                    unit: RenderableUnit,
                    action: ReturnType<typeof createMoveAndAttackAction>,
                    wasAIActive: boolean,
                ): Promise<boolean>;
            }
        ).handleMoveAndMeleeAttack(unit, createMoveAndAttackAction({ x: 2, y: 2 }, { x: 3, y: 3 }), false);
        await moveCompletion;

        expect(handled).toBe(true);
        expect(appliedActions).toContainEqual({ type: "end_turn", unitId: "ai-unit-1" });
        expect(controller.performingAction).toBe(false);
        expect(controller.isAIActive).toBe(false);
        expect(buttonManager.sc_isAIActive).toBe(false);
    });
});
