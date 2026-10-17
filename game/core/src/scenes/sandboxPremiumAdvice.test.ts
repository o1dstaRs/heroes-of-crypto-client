import { afterEach, expect, spyOn, test } from "bun:test";
import {
    AbilityFactory,
    AttackHandler,
    AttackVals,
    CreatureVals,
    EffectFactory,
    FightStateManager,
    GameActionEngine,
    getEnemiesCellsWithinMovementRange,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    HoCLib,
    MoveHandler,
    PathHelper,
    TeamVals,
    ToFactionName,
    Unit,
    UnitVals,
    UnitsHolder,
    type GameAction,
    type IDecisionContext,
    type HoCMath,
    type TeamType,
} from "@heroesofcrypto/common";
import { creatureInfo } from "../../../heroes-of-crypto-common/src/ai/setup/creature_score";
import { SceneLogMock } from "../../../heroes-of-crypto-common/src/scene/scene_log_mock";
import { snapshotBattle, restoreBattle } from "../../../heroes-of-crypto-common/src/simulation/battle_snapshot";
import { DamageStatisticHolder } from "./DamageStats";
import { SceneLog } from "./SceneLog";
import { SearchDriver } from "../../../heroes-of-crypto-common/src/simulation/search_driver";
import { captureAITargetMemory } from "../../../heroes-of-crypto-common/src/ai/ai";
import type { ISandboxAiSearchHost } from "./sandboxAiSearch";

import { premiumMoveDrawing } from "./PremiumTurnOverlay";
import { premiumHumanActions, sandboxPremiumAdvice } from "./sandboxPremiumAdvice";
import { RenderableUnit } from "./RenderableUnit";
import { RenderableUnit as LevelOneRenderableUnit } from "./LevelOneRenderableUnit";
import { searchSandboxAiDecision } from "./sandboxAiSearch";

const testGridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const createCombatTestContext = () => {
    FightStateManager.getInstance().reset();
    const grid = new Grid(testGridSettings, GridVals.NORMAL);
    const unitsHolder = new UnitsHolder(grid);
    const damageStatisticHolder = new DamageStatisticHolder();
    const sceneLog = new SceneLog();
    const attackHandler = new AttackHandler(testGridSettings, grid, sceneLog, damageStatisticHolder);
    const host: ISandboxAiSearchHost = {
        grid,
        unitsHolder,
        attackHandler,
        sceneLog,
        pathHelper: new PathHelper(testGridSettings),
        moveHandler: new MoveHandler(testGridSettings, grid, unitsHolder),
        abilityFactory: new AbilityFactory(new EffectFactory()),
        fightProperties: () => FightStateManager.getInstance().getFightProperties(),
        canLandRangeAttack: (unit) => unit.getPossibleAttackTypes().includes(AttackVals.RANGE),
        isBarrelCellAllowed: () => false,
        canPlaceUnit: () => false,
        canSplitUnit: () => false,
    };
    return { ...host, damageStatisticHolder, host };
};
const placeUnit = (grid: Grid, units: UnitsHolder, unit: Unit, cell: HoCMath.XY) => {
    const position = GridMath.getPositionForFootprintAnchor(
        testGridSettings,
        cell,
        unit.getFootprintWidth(),
        unit.getFootprintHeight(),
    );
    unit.setPosition(position.x, position.y);
    grid.occupyCells(
        unit.getCells(),
        unit.getId(),
        unit.getTeam(),
        unit.getAttackRange(),
        unit.hasAbilityActive("Made of Fire"),
        unit.hasAbilityActive("Made of Water"),
    );
    units.addUnit(unit);
};

const previousFight = FightStateManager.getInstance().getFightProperties();
const previousRandom = HoCLib.captureDeterministicRandomState();
afterEach(() => {
    FightStateManager.getInstance().setFightProperties(previousFight);
    HoCLib.restoreDeterministicRandomState(previousRandom);
});

test("human advice merges move-and-melee and rejects follow-ups a move would end before", () => {
    const move: GameAction = { type: "move_unit", unitId: "actor", path: [{ x: 2, y: 3 }], hasLavaCell: true };
    const melee: GameAction = {
        type: "melee_attack",
        attackerId: "actor",
        targetId: "target",
        attackFrom: { x: 2, y: 3 },
    };
    expect(premiumHumanActions([move, melee])).toEqual([
        { ...melee, path: move.path, hasLavaCell: true, hasWaterCell: undefined },
    ]);
    for (const followUp of [
        { type: "cast_spell", casterId: "actor", spellName: "Heal" },
        { type: "range_attack", attackerId: "actor", targetId: "target" },
        { type: "area_throw_attack", attackerId: "actor", targetCell: { x: 5, y: 5 } },
    ] satisfies GameAction[])
        expect(premiumHumanActions([move, followUp])).toBeUndefined();
    expect(premiumHumanActions([move, { type: "end_turn", unitId: "actor" }])).toEqual([move]);
});

const renderers = [
    ["engine", (unit: Unit) => unit],
    ["battlefield", (unit: Unit) => RenderableUnit.fromBase(unit, () => undefined)],
    ["level one", (unit: Unit) => LevelOneRenderableUnit.fromBase(unit, () => undefined)],
] as const;

const scenarios = renderers.flatMap(([renderer, render]) =>
    [
        CreatureVals.PEASANT,
        CreatureVals.ELF,
        CreatureVals.HEALER,
        CreatureVals.ANGEL,
        CreatureVals.BATTLE_MAGE,
        CreatureVals.GARGANTUAN,
        CreatureVals.SATYR,
    ].map((creatureId) => ({ renderer, render, creatureId })),
);

for (const { renderer, render, creatureId } of scenarios) {
    for (const distance of ["adjacent", "far"] as const) {
        test(`${renderer} sandbox recommendations are drawable, legal and read-only: ${creatureInfo(creatureId)!.name}, ${distance}`, () => {
            const context = createCombatTestContext();
            const fight = FightStateManager.getInstance().getFightProperties();
            const makeUnit = (id: number, team: TeamType) => {
                const info = creatureInfo(id)!;
                const effects = new EffectFactory();
                return render(
                    Unit.createUnit(
                        HoCConfig.getCreatureConfig(team, ToFactionName[info.faction], info.name, "", 12),
                        testGridSettings,
                        team,
                        UnitVals.CREATURE,
                        new AbilityFactory(effects),
                        effects,
                        false,
                    ),
                );
            };
            const actor = makeUnit(creatureId, TeamVals.LEFT);
            const enemy = makeUnit(CreatureVals.PEASANT, TeamVals.RIGHT);
            const ally = makeUnit(CreatureVals.PEASANT, TeamVals.LEFT);
            placeUnit(context.grid, context.unitsHolder, actor, { x: 3, y: 3 });
            placeUnit(context.grid, context.unitsHolder, ally, { x: 2, y: 1 });
            placeUnit(
                context.grid,
                context.unitsHolder,
                enemy,
                distance === "adjacent" ? { x: 3 + actor.getFootprintWidth(), y: 3 } : { x: 13, y: 13 },
            );
            actor.refreshPossibleAttackTypes(distance !== "adjacent");
            fight.setTeamUnitsAlive(TeamVals.LEFT, 2);
            fight.setTeamUnitsAlive(TeamVals.RIGHT, 1);
            fight.startFight();
            fight.startTurn(TeamVals.LEFT, 1000);
            const decision: IDecisionContext = {
                ...context,
                matrix: context.grid.getMatrix(),
                pathHelper: new PathHelper(testGridSettings),
                fightProperties: fight,
                decisionOrigin: "root",
            };
            const before = snapshotBattle(context.unitsHolder, context.grid, fight);
            const randomBefore = HoCLib.captureDeterministicRandomState();
            const memoryBefore = captureAITargetMemory(context.unitsHolder);
            const search = spyOn(SearchDriver.prototype, "chooseDecision");
            let advice;
            try {
                advice = sandboxPremiumAdvice(actor, decision, 4, context.host);
                expect(search).toHaveBeenCalledTimes(1);
                expect(search.mock.calls[0][1]).toBe("v0.8");
                const searchedActions = premiumHumanActions(search.mock.results[0].value as GameAction[]);
                if (
                    searchedActions &&
                    premiumMoveDrawing(
                        { id: "search", label: "search", reasons: [], actions: searchedActions },
                        actor,
                        context.unitsHolder.getAllUnits(),
                        testGridSettings,
                    )
                ) {
                    expect(advice.options[0].actions).toEqual(searchedActions);
                }
            } finally {
                search.mockRestore();
            }
            expect(snapshotBattle(context.unitsHolder, context.grid, fight)).toEqual(before);
            expect(HoCLib.captureDeterministicRandomState()).toEqual(randomBefore);
            expect(captureAITargetMemory(context.unitsHolder)).toEqual(memoryBefore);
            expect(context.sceneLog.getLog()).toBe("");
            expect(context.sceneLog.hasBeenUpdated()).toBe(false);
            expect(context.damageStatisticHolder.get()).toEqual([]);
            expect(advice.status).toBe("ready");
            expect(advice.options.length).toBeGreaterThan(0);
            expect(sandboxPremiumAdvice(actor, decision, 4, context.host)).toEqual(advice);
            if (creatureId === CreatureVals.PEASANT && distance === "adjacent") {
                const searched: GameAction[] = [{ type: "defend_turn", unitId: actor.getId() }];
                const override = spyOn(SearchDriver.prototype, "chooseDecision").mockReturnValue(searched);
                try {
                    const searchedAdvice = sandboxPremiumAdvice(actor, decision, 5, context.host);
                    expect(searchedAdvice.options[0].actions).toEqual(searched);
                } finally {
                    override.mockRestore();
                }
                const failure = spyOn(SearchDriver.prototype, "chooseDecision").mockImplementation(() => {
                    actor.setPosition(900, 900);
                    context.damageStatisticHolder.add({
                        unitName: actor.getName(),
                        team: actor.getTeam(),
                        damage: 42,
                        lap: 1,
                    });
                    context.sceneLog.updateLog("speculative damage");
                    throw new Error("search failed");
                });
                try {
                    expect(() => sandboxPremiumAdvice(actor, decision, 6, context.host)).toThrow("search failed");
                    expect(snapshotBattle(context.unitsHolder, context.grid, fight)).toEqual(before);
                    expect(context.damageStatisticHolder.get()).toEqual([]);
                    expect(context.sceneLog.getLog()).toBe("");
                    expect(context.sceneLog.isSuppressed()).toBe(false);
                    expect(captureAITargetMemory(context.unitsHolder)).toEqual(memoryBefore);
                    expect(HoCLib.captureDeterministicRandomState()).toEqual(randomBefore);
                } finally {
                    failure.mockRestore();
                }
            }
            const engine = new GameActionEngine({
                ...context,
                fightProperties: fight,
                moveHandler: new MoveHandler(testGridSettings, context.grid, context.unitsHolder),
                sceneLog: new SceneLogMock(),
                getCurrentActiveUnitId: () => actor.getId(),
                getCurrentEnemiesCellsWithinMovementRange: () => getEnemiesCellsWithinMovementRange(actor, decision),
                createSummonedUnit: ({ team, faction, unitName, amount }) => {
                    const effects = new EffectFactory();
                    return Unit.createUnit(
                        HoCConfig.getCreatureConfig(team, ToFactionName[faction], unitName, "", amount),
                        testGridSettings,
                        team,
                        UnitVals.CREATURE,
                        new AbilityFactory(effects),
                        effects,
                        true,
                    );
                },
            });
            for (const option of advice.options) {
                expect(
                    premiumMoveDrawing(option, actor, context.unitsHolder.getAllUnits(), testGridSettings),
                ).toBeDefined();
                try {
                    for (const action of option.actions!) {
                        const result = engine.apply(action);
                        expect({
                            type: action.type,
                            completed: result.completed,
                            rejection: result.rejectionReason,
                        }).toEqual({ type: action.type, completed: true, rejection: undefined });
                    }
                } finally {
                    restoreBattle(before, context.unitsHolder, context.grid, fight);
                    context.damageStatisticHolder.clear();
                }
            }
        });
    }
}

for (const [renderer, render] of renderers) {
    test(`${renderer} A19 searches real engine actions without a policy fallback or live-state changes`, () => {
        const context = createCombatTestContext();
        const fight = context.fightProperties();
        const makeUnit = (team: TeamType) => {
            const effects = new EffectFactory();
            return render(
                Unit.createUnit(
                    HoCConfig.getCreatureConfig(team, "Life", "Peasant", "", 12),
                    testGridSettings,
                    team,
                    UnitVals.CREATURE,
                    new AbilityFactory(effects),
                    effects,
                    false,
                ),
            );
        };
        const actor = makeUnit(TeamVals.LEFT);
        const enemy = makeUnit(TeamVals.RIGHT);
        placeUnit(context.grid, context.unitsHolder, actor, { x: 3, y: 3 });
        placeUnit(context.grid, context.unitsHolder, enemy, { x: 4, y: 3 });
        actor.refreshPossibleAttackTypes(false);
        fight.setTeamUnitsAlive(TeamVals.LEFT, 1);
        fight.setTeamUnitsAlive(TeamVals.RIGHT, 1);
        fight.startFight();
        fight.startTurn(TeamVals.LEFT, 1000);
        const decision: IDecisionContext = {
            ...context,
            matrix: context.grid.getMatrix(),
            fightProperties: fight,
            decisionOrigin: "root",
        };
        const before = snapshotBattle(context.unitsHolder, context.grid, fight);
        const randomBefore = HoCLib.captureDeterministicRandomState();
        const memoryBefore = captureAITargetMemory(context.unitsHolder);
        const errors = spyOn(console, "error").mockImplementation(() => undefined);
        const apply = spyOn(GameActionEngine.prototype, "apply");
        try {
            // Exercise both a newly constructed search slot and the slot reused for the next decision.
            for (let repeat = 0; repeat < 2; repeat++) {
                const actions = searchSandboxAiDecision(
                    context.host,
                    actor,
                    "v0.8",
                    [{ type: "defend_turn", unitId: actor.getId() }],
                    decision,
                );
                expect(actions.length).toBeGreaterThan(0);
                expect(apply).toHaveBeenCalled();
                expect(errors).not.toHaveBeenCalled();
                expect(snapshotBattle(context.unitsHolder, context.grid, fight)).toEqual(before);
                expect(HoCLib.captureDeterministicRandomState()).toEqual(randomBefore);
                expect(captureAITargetMemory(context.unitsHolder)).toEqual(memoryBefore);
                expect(context.damageStatisticHolder.get()).toEqual([]);
                expect(context.sceneLog.getLog()).toBe("");
                expect(context.sceneLog.isSuppressed()).toBe(false);
                apply.mockClear();
            }
        } finally {
            apply.mockRestore();
            errors.mockRestore();
        }
    });
}
