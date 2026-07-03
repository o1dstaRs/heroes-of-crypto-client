import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as HoC from "@heroesofcrypto/common";
import {
    AttackVals,
    GridSettings,
    TeamVals,
    type GameAction,
    type HoCMath,
    type IAIStrategy,
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
        getSteps: () => 10,
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
        // isAIActive is the player's toggle and is no longer reset by an AI turn (so a manual
        // toggle-off mid-turn sticks); the button visual just re-syncs to the live toggle, which is
        // still on here — both stay true.
        expect(controller.isAIActive).toBe(true);
        expect(buttonManager.sc_isAIActive).toBe(true);
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
        // isAIActive is the player's toggle and is no longer reset by an AI turn (so a manual
        // toggle-off mid-turn sticks); the button visual just re-syncs to the live toggle, which is
        // still on here — both stay true.
        expect(controller.isAIActive).toBe(true);
        expect(buttonManager.sc_isAIActive).toBe(true);
    });

    it("ends and unlocks an AI turn when a post-move melee attack is rejected", async () => {
        const unit = createUnit();
        const target = {
            getId: () => "target-1",
            getTeam: () => 2,
            getCells: () => [{ x: 3, y: 3 }],
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
                areCellsAdjacent: () => true,
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
        // isAIActive is the player's toggle and is no longer reset by an AI turn (so a manual
        // toggle-off mid-turn sticks); the button visual just re-syncs to the live toggle, which is
        // still on here — both stay true.
        expect(controller.isAIActive).toBe(true);
        expect(buttonManager.sc_isAIActive).toBe(true);
    });

    // --- v0.5 learned-strategy routing (performAction → decideTurn) ---------------------------------
    describe("v0.5 strategy routing", () => {
        // Swap getAIStrategy(DEFAULT_AI_VERSION) for a fake whose decideTurn we control. spyOn on the
        // @heroesofcrypto/common namespace also rebinds AIController's own `getAIStrategy` import (verified),
        // so performAction() drives the fake plan through the real translation/execution machinery.
        let strategySpy: ReturnType<typeof spyOn> | undefined;
        const stubStrategy = (decideTurn: (...args: unknown[]) => GameAction[]) => {
            const strategy = { version: "test", placeArmy: () => new Map(), decideTurn } as unknown as IAIStrategy;
            strategySpy = spyOn(HoC, "getAIStrategy").mockReturnValue(strategy);
            return strategy;
        };
        afterEach(() => {
            strategySpy?.mockRestore();
            strategySpy = undefined;
        });

        const baseContext = (overrides: Record<string, unknown>): IAIContext =>
            ({
                applyGameAction: mock(() => true),
                executeAttackSequence: mock(async () => true),
                executeMoveSequence: mock(() => true),
                executeObstacleAttackSequence: mock(() => true),
                getButtonManager: () => ({ refreshButtons: mock(() => undefined), sc_isAIActive: true }),
                getCurrentActiveUnit: () => createUnit(),
                getGrid: () => ({}),
                getGridMatrix: () => [],
                getAttackHandler: () => ({}),
                getHoverManager: () => ({ showSilhouetteForUnit: mock(() => undefined) }),
                getPathHelper: () => ({}),
                getSceneLog: () => ({ updateLog: mock(() => undefined) }),
                getSceneSettings: () => new SceneSettings(new GridSettings(4, 400, 0, 400, 0, 0, 0), true),
                getUnitsHolder: () => ({ getAllUnits: () => new Map() }),
                ensureAuthoritativeAuraState: mock(() => undefined),
                refreshUnits: mock(() => undefined),
                setCurrentActiveKnownPaths: mock(() => undefined),
                setSelectedAttackType: mock(() => undefined),
                ...overrides,
            }) as unknown as IAIContext;

        it("routes the production turn through decideTurn and executes its wait_turn plan", async () => {
            const unit = createUnit();
            const grid = { grid: true };
            const matrix = [[1]];
            const decideTurn = mock(() => [{ type: "wait_turn", unitId: unit.getId() }] as GameAction[]);
            stubStrategy(decideTurn);
            const appliedActions: GameAction[] = [];
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                getGrid: () => grid as never,
                getGridMatrix: () => matrix,
                applyGameAction: (action: GameAction) => {
                    appliedActions.push(action);
                    return true;
                },
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            await controller.performAction(true);

            // (i) decideTurn was called for the active unit with the wired IDecisionContext.
            expect(decideTurn).toHaveBeenCalledTimes(1);
            const [decidedUnit, decidedCtx] = decideTurn.mock.calls[0] as unknown as [
                RenderableUnit,
                { grid: unknown; matrix: unknown },
            ];
            expect(decidedUnit).toBe(unit);
            expect(decidedCtx.grid).toBe(grid);
            expect(decidedCtx.matrix).toBe(matrix);
            // (iii) wait_turn is applied via applyGameAction and the AI lock is released (no animation).
            expect(appliedActions).toEqual([{ type: "wait_turn", unitId: unit.getId() }]);
            expect(controller.performingAction).toBe(false);
        });

        it("translates a melee_attack plan into executeAttackSequence with the target and attackFrom", async () => {
            const unit = createUnit();
            const attackFrom = { x: 3, y: 4 };
            const target = {
                getId: () => "target-1",
                getTeam: () => TeamVals.UPPER,
                getCells: () => [{ x: 3, y: 5 }],
                hasBuffActive: () => false,
            };
            stubStrategy(
                () =>
                    [
                        { type: "select_attack_type", unitId: unit.getId(), attackType: AttackVals.MELEE },
                        { type: "melee_attack", attackerId: unit.getId(), targetId: "target-1", attackFrom },
                    ] as GameAction[],
            );
            const executeAttackSequence = mock(async () => true);
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                executeAttackSequence,
                getUnitsHolder: () => ({ getAllUnits: () => new Map([["target-1", target]]) }),
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            await controller.performAction(true);

            // (ii) the strike routes through executeAttackSequence with the resolved target + attack-from cell.
            expect(executeAttackSequence).toHaveBeenCalledTimes(1);
            const [attacker, struck, from] = executeAttackSequence.mock.calls[0] as unknown as [
                RenderableUnit,
                typeof target,
                HoCMath.XY,
            ];
            expect(attacker).toBe(unit);
            expect(struck).toBe(target);
            expect(from).toEqual(attackFrom);
            expect(controller.performingAction).toBe(false);
        });

        it("falls back to the AI.findTarget path when decideTurn returns an empty plan", async () => {
            const unit = createUnit();
            stubStrategy(() => [] as GameAction[]);
            const context = baseContext({ getCurrentActiveUnit: () => unit });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            // Observe the fallback without exercising the real findTarget engine path.
            const fallback = mock(async () => undefined);
            (controller as unknown as { performFindTargetAction: typeof fallback }).performFindTargetAction = fallback;

            await controller.performAction(true);

            // (iv) an empty strategy plan hands off to the proven findTarget fallback (never a dead turn).
            expect(fallback).toHaveBeenCalledTimes(1);
            expect((fallback.mock.calls[0] as unknown as [RenderableUnit])[0]).toBe(unit);
        });
    });
});
