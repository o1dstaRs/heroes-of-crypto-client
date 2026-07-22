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
        isOnHourglass: () => false,
        setOnHourglass: () => undefined,
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

    it("ends the turn after an authoritative move so the unit never dangles into a server timeout", () => {
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
        // A ranked bare move keeps the unit ACTIVE server-side (TURN_ENDING_ACTION_TYPES excludes move_unit)
        // and the deferred submit never fires onComplete — so the AI MUST explicitly end the turn, else the
        // unit dangles until the server's turn timer fires ("<unit> turn timed out"). Regression guard.
        expect(appliedActions).toEqual([{ type: "end_turn", unitId: unit.getId() }]);
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

        // A move+melee plan carries the route as the melee_attack's `path`. It MUST be executed as ONE
        // combined action so the engine/server moves-then-strikes atomically. Splitting it into a
        // standalone move_unit + attack makes the server treat the move as the whole turn and skip the
        // strike ("moved to (x,y)" then "skips turn"). These two tests pin that invariant for BOTH the
        // authoritative (ranked/deferred) branch and the sandbox (local-animation) branch.
        const meleePath: HoCMath.XY[] = [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
            { x: 3, y: 4 },
        ];
        const attackFrom = { x: 3, y: 4 };
        const buildMoveMeleeTarget = () => ({
            getId: () => "target-1",
            getTeam: () => TeamVals.UPPER,
            getCells: () => [{ x: 3, y: 5 }],
            hasBuffActive: () => false,
        });
        const moveMeleePlan = (unitId: string): GameAction[] =>
            [
                { type: "select_attack_type", unitId, attackType: AttackVals.MELEE },
                { type: "melee_attack", attackerId: unitId, targetId: "target-1", attackFrom, path: meleePath },
            ] as GameAction[];

        it("submits a move+melee plan as ONE combined melee_attack (with path) in the authoritative branch", async () => {
            const unit = createUnit();
            const target = buildMoveMeleeTarget();
            stubStrategy(() => moveMeleePlan(unit.getId()));
            const executeAttackSequence = mock(async () => true);
            const executeMoveSequence = mock(() => true);
            const appliedActions: GameAction[] = [];
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                executeAttackSequence,
                executeMoveSequence,
                // Ranked/authoritative: melee_attack (and move_unit) are deferred to the server replay.
                isAuthoritativeAction: (action: GameAction) => action.type === "melee_attack",
                applyGameAction: (action: GameAction) => {
                    appliedActions.push(action);
                    return true;
                },
                getUnitsHolder: () => ({ getAllUnits: () => new Map([["target-1", target]]) }),
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            await controller.performAction(true);

            // The strike is the ONE combined action: executeAttackSequence gets the melee_attack WITH the
            // route path preserved and the resolved attack-from cell.
            expect(executeAttackSequence).toHaveBeenCalledTimes(1);
            const [attacker, struck, from, replayAction] = executeAttackSequence.mock.calls[0] as unknown as [
                RenderableUnit,
                typeof target,
                HoCMath.XY,
                Extract<GameAction, { type: "melee_attack" }>,
            ];
            expect(attacker).toBe(unit);
            expect(struck).toBe(target);
            expect(from).toEqual(attackFrom);
            expect(replayAction.type).toBe("melee_attack");
            expect(replayAction.path).toEqual(meleePath);
            // Crucially: NO separate move is animated or submitted — the server does the combined move+strike.
            expect(executeMoveSequence).not.toHaveBeenCalled();
            expect(appliedActions.some((a) => a.type === "move_unit")).toBe(false);
            expect(controller.performingAction).toBe(false);
        });

        it("animates the approach then strikes with the combined action in the sandbox branch (no lone move_unit)", async () => {
            const unit = createUnit();
            const target = buildMoveMeleeTarget();
            stubStrategy(() => moveMeleePlan(unit.getId()));
            const executeAttackSequence = mock(async () => true);
            // Sandbox move: capture args, then fire the completion callback (mirrors a finished walk).
            const executeMoveSequence = mock((..._args: unknown[]) => {
                const onComplete = _args[3] as (() => void) | undefined;
                void onComplete?.();
                return true;
            });
            const appliedActions: GameAction[] = [];
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                executeAttackSequence,
                executeMoveSequence,
                // Sandbox / local engine: nothing is deferred, so the approach is animated locally.
                isAuthoritativeAction: () => false,
                applyGameAction: (action: GameAction) => {
                    appliedActions.push(action);
                    return true;
                },
                getUnitsHolder: () => ({ getAllUnits: () => new Map([["target-1", target]]) }),
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            await controller.performAction(true);
            // Let the awaited attack inside the move-completion callback settle.
            await Promise.resolve();
            await Promise.resolve();

            // The approach is animated via executeMoveSequence with the route...
            expect(executeMoveSequence).toHaveBeenCalledTimes(1);
            const moveArgs = executeMoveSequence.mock.calls[0] as unknown as unknown[];
            expect(moveArgs[1]).toEqual(meleePath); // path
            // ...but its replayAction (arg 5) MUST be undefined so no standalone move_unit is submitted
            // (that would end the turn on the server and skip the strike), and rapidCharge (arg 6) is on.
            expect(moveArgs[4]).toBeUndefined(); // replayAction
            expect(moveArgs[5]).toBe(true); // rapidCharge
            // The strike still submits the ONE combined melee_attack WITH the path.
            expect(executeAttackSequence).toHaveBeenCalledTimes(1);
            const [attacker, struck, from, replayAction] = executeAttackSequence.mock.calls[0] as unknown as [
                RenderableUnit,
                typeof target,
                HoCMath.XY,
                Extract<GameAction, { type: "melee_attack" }>,
            ];
            expect(attacker).toBe(unit);
            expect(struck).toBe(target);
            expect(from).toEqual(attackFrom);
            expect(replayAction.type).toBe("melee_attack");
            expect(replayAction.path).toEqual(meleePath);
            // No standalone move_unit was pushed through applyGameAction either.
            expect(appliedActions.some((a) => a.type === "move_unit")).toBe(false);
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

        it("ends the turn after an authoritative strategy MOVE so the unit never dangles into a timeout", async () => {
            const unit = createUnit();
            const movePath: HoCMath.XY[] = [
                { x: 1, y: 1 },
                { x: 2, y: 2 },
            ];
            stubStrategy(
                () =>
                    [
                        { type: "move_unit", unitId: unit.getId(), path: movePath, targetCells: [{ x: 2, y: 2 }] },
                    ] as GameAction[],
            );
            const appliedActions: GameAction[] = [];
            const executeMoveSequence = mock(() => true);
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                executeMoveSequence,
                // Ranked: a bare move is deferred and NEVER ends the turn server-side.
                isAuthoritativeAction: (action: GameAction) => action.type === "move_unit",
                applyGameAction: (action: GameAction) => {
                    appliedActions.push(action);
                    return true;
                },
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            await controller.performAction(true);

            // The move is submitted, then the AI explicitly ends the turn — otherwise the unit stays active
            // until the server's turn timer fires ("<unit> turn timed out"). Regression guard for that bug.
            expect(executeMoveSequence).toHaveBeenCalledTimes(1);
            expect(appliedActions).toEqual([{ type: "end_turn", unitId: unit.getId() }]);
            expect(controller.performingAction).toBe(false);
        });

        it("recovers via findTarget (never a skip) when an authoritative strike is rejected", async () => {
            const unit = createUnit();
            const target = buildMoveMeleeTarget();
            stubStrategy(() => moveMeleePlan(unit.getId()));
            const appliedActions: GameAction[] = [];
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                // The server DECLINES the charge (e.g. a 2x2 unit's planned landing filled after we decided).
                executeAttackSequence: mock(async () => false),
                isAuthoritativeAction: (action: GameAction) => action.type === "melee_attack",
                applyGameAction: (action: GameAction) => {
                    appliedActions.push(action);
                    return true;
                },
                getUnitsHolder: () => ({ getAllUnits: () => new Map([["target-1", target]]) }),
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            const fallback = mock(async () => undefined);
            (controller as unknown as { performFindTargetAction: typeof fallback }).performFindTargetAction = fallback;

            await controller.performAction(true);

            // A rejected strike must hand off to findTarget to advance/retarget/end cleanly — NOT immediately
            // burn the turn as a "skips turn" (the sim's advance-then-defend recovery, ported to the client).
            expect(fallback).toHaveBeenCalledTimes(1);
            expect(appliedActions.some((a) => a.type === "end_turn")).toBe(false);
        });

        // --- full-sequence execution (client mirror of battle_engine's apply loop) --------------------
        // The sim applies EVERY decided action in order; the client previously executed only the first
        // productive action, silently dropping e.g. the cast of a [move_unit, cast_spell] plan (memory
        // client-sim-action-divergence). These tests pin the generalized sequence executor.

        const seqMovePath: HoCMath.XY[] = [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
        ];
        const moveCastPlan = (unitId: string): GameAction[] =>
            [
                { type: "move_unit", unitId, path: seqMovePath, targetCells: [{ x: 2, y: 2 }] },
                { type: "cast_spell", casterId: unitId, spellName: "Heal", targetId: unitId },
            ] as GameAction[];

        it("executes a [move_unit, cast_spell] plan fully in the authoritative branch (move submit, then cast, then end_turn)", async () => {
            const unit = createUnit();
            stubStrategy(() => moveCastPlan(unit.getId()));
            const appliedActions: GameAction[] = [];
            const executeMoveSequence = mock(() => true);
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                executeMoveSequence,
                // Ranked: the bare move is deferred (submitted, no onComplete); dispatch is in-order, so
                // the cast lands right behind it while the unit is still active server-side.
                isAuthoritativeAction: (action: GameAction) => action.type === "move_unit",
                applyGameAction: (action: GameAction) => {
                    appliedActions.push(action);
                    return true;
                },
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            await controller.performAction(true);

            // The move is submitted via executeMoveSequence WITH its replayAction (a real move_unit —
            // unlike the melee fold, the cast carries no path, so the move must be its own submit)...
            expect(executeMoveSequence).toHaveBeenCalledTimes(1);
            const moveArgs = executeMoveSequence.mock.calls[0] as unknown as unknown[];
            expect(moveArgs[1]).toEqual(seqMovePath);
            expect((moveArgs[4] as GameAction | undefined)?.type).toBe("move_unit");
            expect(moveArgs[6]).toBe(true); // reserve the server continuation for the queued cast
            // ...then the cast is applied (previously DROPPED — the unit walked and never cast), then the
            // turn is closed so the unit never dangles into a server timeout.
            expect(appliedActions.map((a) => a.type)).toEqual(["cast_spell", "end_turn"]);
            expect(controller.performingAction).toBe(false);
        });

        it("executes an authoritative [move_unit, range_attack] in order and preserves bounded aim intent", async () => {
            const unit = createUnit();
            const aimCell = { x: 5, y: 6 };
            const target = {
                getId: () => "target-1",
                getTeam: () => TeamVals.UPPER,
                getCells: () => [aimCell],
                hasBuffActive: () => false,
            };
            stubStrategy(
                () =>
                    [
                        { type: "move_unit", unitId: unit.getId(), path: seqMovePath },
                        {
                            type: "range_attack",
                            attackerId: unit.getId(),
                            targetId: target.getId(),
                            aimCell,
                            aimSide: 0,
                        },
                    ] as GameAction[],
            );
            const dispatchOrder: GameAction["type"][] = [];
            const executeMoveSequence = mock((...args: unknown[]) => {
                dispatchOrder.push((args[4] as GameAction).type);
                return true;
            });
            const executeAttackSequence = mock(async (...args: unknown[]) => {
                dispatchOrder.push((args[3] as GameAction).type);
                return true;
            });
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                executeMoveSequence,
                executeAttackSequence,
                // A ranked move submit does not fire its local animation callback. The continuation flag
                // keeps the moved unit active so the queued authoritative shot can follow immediately.
                isAuthoritativeAction: (action: GameAction) =>
                    action.type === "move_unit" || action.type === "range_attack",
                applyGameAction: (action: GameAction) => {
                    dispatchOrder.push(action.type);
                    return true;
                },
                getUnitsHolder: () => ({ getAllUnits: () => new Map([[target.getId(), target]]) }),
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            await controller.performAction(true);

            expect(executeMoveSequence).toHaveBeenCalledTimes(1);
            const moveArgs = executeMoveSequence.mock.calls[0] as unknown as unknown[];
            expect((moveArgs[4] as GameAction).type).toBe("move_unit");
            expect(moveArgs[6]).toBe(true);
            expect(executeAttackSequence).toHaveBeenCalledTimes(1);
            const rangeArgs = executeAttackSequence.mock.calls[0] as unknown as unknown[];
            expect(rangeArgs[3]).toEqual({
                type: "range_attack",
                attackerId: unit.getId(),
                targetId: target.getId(),
                aimCell,
                // Side zero is deliberately pinned: it must not disappear through a truthiness check.
                aimSide: 0,
            });
            expect(dispatchOrder).toEqual(["move_unit", "select_attack_type", "range_attack"]);
            expect(controller.performingAction).toBe(false);
        });

        it("executes a [move_unit, area_throw_attack] authoritative plan under the same continuation", async () => {
            const unit = createUnit();
            const executeMoveSequence = mock(() => true);
            const appliedActions: GameAction[] = [];
            stubStrategy(
                () =>
                    [
                        { type: "move_unit", unitId: unit.getId(), path: seqMovePath },
                        { type: "area_throw_attack", attackerId: unit.getId(), targetCell: { x: 5, y: 6 } },
                    ] as GameAction[],
            );
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                executeMoveSequence,
                isAuthoritativeAction: (action: GameAction) => action.type === "move_unit",
                applyGameAction: (action: GameAction) => {
                    appliedActions.push(action);
                    return true;
                },
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            await controller.performAction(true);

            const moveArgs = executeMoveSequence.mock.calls[0] as unknown as unknown[];
            expect(moveArgs[6]).toBe(true);
            expect(appliedActions.map((action) => action.type)).toEqual([
                "select_attack_type",
                "area_throw_attack",
                "end_turn",
            ]);
        });

        it("executes a [move_unit, cast_spell] plan fully in the sandbox branch (cast fires after the walk completes)", async () => {
            const unit = createUnit();
            stubStrategy(() => moveCastPlan(unit.getId()));
            const appliedActions: GameAction[] = [];
            let castAppliedBeforeMoveCompleted = false;
            let moveCompleted = false;
            const executeMoveSequence = mock((..._args: unknown[]) => {
                const onComplete = _args[3] as (() => void) | undefined;
                moveCompleted = true;
                void onComplete?.();
                return true;
            });
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                executeMoveSequence,
                isAuthoritativeAction: () => false,
                applyGameAction: (action: GameAction) => {
                    if (action.type === "cast_spell" && !moveCompleted) {
                        castAppliedBeforeMoveCompleted = true;
                    }
                    appliedActions.push(action);
                    return true;
                },
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            await controller.performAction(true);

            expect(executeMoveSequence).toHaveBeenCalledTimes(1);
            // The intermediate move passes its OWN replayAction (arg 5) — it is a real recorded move, not
            // just an animated approach (only the melee fold animates without submitting).
            const moveArgs = executeMoveSequence.mock.calls[0] as unknown as unknown[];
            expect((moveArgs[4] as GameAction | undefined)?.type).toBe("move_unit");
            expect(castAppliedBeforeMoveCompleted).toBe(false);
            expect(appliedActions.map((a) => a.type)).toEqual(["cast_spell", "end_turn"]);
            expect(controller.performingAction).toBe(false);
        });

        it("stops a sequence gracefully (end_turn, no findTarget re-decide) when the follow-up is declined AFTER the move landed", async () => {
            const unit = createUnit();
            stubStrategy(() => moveCastPlan(unit.getId()));
            const appliedActions: GameAction[] = [];
            const executeMoveSequence = mock((..._args: unknown[]) => {
                const onComplete = _args[3] as (() => void) | undefined;
                void onComplete?.();
                return true;
            });
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                executeMoveSequence,
                isAuthoritativeAction: () => false,
                applyGameAction: (action: GameAction) => {
                    appliedActions.push(action);
                    return action.type !== "cast_spell"; // the cast is DECLINED after the move landed
                },
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            const fallback = mock(async () => undefined);
            (controller as unknown as { performFindTargetAction: typeof fallback }).performFindTargetAction = fallback;

            await controller.performAction(true);

            // The board already changed (the move landed) — re-deciding would re-propose actions against a
            // half-executed plan (the reject-storm/desync class in memory ranked-skip-rejections). The turn
            // is closed cleanly instead, mirroring the sim (a landed move + declined follow-up = end_turn).
            expect(fallback).not.toHaveBeenCalled();
            expect(appliedActions.map((a) => a.type)).toEqual(["cast_spell", "end_turn"]);
            expect(controller.performingAction).toBe(false);
        });

        it("falls back to findTarget when the sequence's opening move cannot start (nothing landed yet)", async () => {
            const unit = createUnit();
            stubStrategy(() => moveCastPlan(unit.getId()));
            const appliedActions: GameAction[] = [];
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                executeMoveSequence: mock(() => false),
                isAuthoritativeAction: () => false,
                applyGameAction: (action: GameAction) => {
                    appliedActions.push(action);
                    return true;
                },
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            const fallback = mock(async () => undefined);
            (controller as unknown as { performFindTargetAction: typeof fallback }).performFindTargetAction = fallback;

            await controller.performAction(true);

            // Nothing landed, so the shipped recovery ladder still applies: a different algorithm gets a
            // real second attempt before the escape-hatch skip.
            expect(fallback).toHaveBeenCalledTimes(1);
            expect(appliedActions.some((a) => a.type === "cast_spell")).toBe(false);
        });

        it("executes an area_throw_attack plan (RANGE stance first, throw, end_turn) — previously no client case existed", async () => {
            const unit = createUnit(); // stance reads MELEE, so the RANGE select must be applied first
            const targetCell = { x: 5, y: 6 };
            stubStrategy(
                () =>
                    [
                        { type: "select_attack_type", unitId: unit.getId(), attackType: AttackVals.RANGE },
                        { type: "area_throw_attack", attackerId: unit.getId(), targetCell },
                    ] as GameAction[],
            );
            const appliedActions: GameAction[] = [];
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                applyGameAction: (action: GameAction) => {
                    appliedActions.push(action);
                    return true;
                },
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            await controller.performAction(true);

            // The engine gates the throw on the RANGE stance (action_engine.areaThrowAttack), so the stance
            // select comes first, then the throw itself, then the turn closes.
            expect(appliedActions.map((a) => a.type)).toEqual(["select_attack_type", "area_throw_attack", "end_turn"]);
            const throwAction = appliedActions[1] as Extract<GameAction, { type: "area_throw_attack" }>;
            expect(throwAction.targetCell).toEqual(targetCell);
            expect(controller.performingAction).toBe(false);
        });

        it("recovers via findTarget when the area throw is declined", async () => {
            const unit = createUnit();
            stubStrategy(
                () =>
                    [
                        { type: "area_throw_attack", attackerId: unit.getId(), targetCell: { x: 5, y: 6 } },
                    ] as GameAction[],
            );
            const context = baseContext({
                getCurrentActiveUnit: () => unit,
                applyGameAction: (action: GameAction) => action.type !== "area_throw_attack",
            });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            const fallback = mock(async () => undefined);
            (controller as unknown as { performFindTargetAction: typeof fallback }).performFindTargetAction = fallback;

            await controller.performAction(true);

            expect(fallback).toHaveBeenCalledTimes(1);
        });

        it("optimistically marks the unit on-hourglass when it submits a wait so canHourglass stops re-emitting wait", async () => {
            const unit = createUnit();
            const setOnHourglass = mock(() => undefined);
            (unit as unknown as { setOnHourglass: typeof setOnHourglass }).setOnHourglass = setOnHourglass;
            stubStrategy(() => [{ type: "wait_turn", unitId: unit.getId() }] as GameAction[]);
            const context = baseContext({ getCurrentActiveUnit: () => unit, applyGameAction: () => true });

            const controller = new AIController(context);
            controller.isAIActive = true;
            controller.performingAction = true;
            await controller.performAction(true);

            // Ranked submits wait_turn to the server without running the local engine, so the client must
            // mirror the hourglass flag itself — otherwise canHourglass stays stale-true and decideTurn spins
            // on wait_turn until the turn dies as "skips turn". Regression guard for that loop.
            expect(setOnHourglass).toHaveBeenCalledWith(true);
        });
    });
});
