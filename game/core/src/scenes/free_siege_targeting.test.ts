import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
    AbilityFactory,
    AttackHandler,
    AttackVals,
    EffectFactory,
    FightStateManager,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type HoCMath,
    type TeamType,
} from "@heroesofcrypto/common";

import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";

/**
 * Free siege aiming: a Tsar Cannon's Through Shot fires a free world ray, a Gargantuan's Area Throw lands a
 * 3x3 blast. Neither draws a central plaque; the feedback belongs to the creatures they reach.
 * Sandbox.areaThrowProjection.test.ts covers where the throw lands; barrel_target_highlight.test.ts covers
 * the obstacle resolver standing aside for both modes.
 */
type XY = HoCMath.XY;
const settings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const position = (cell: XY) =>
    GridMath.getPositionForCell(cell, settings.getMinX(), settings.getStep(), settings.getHalfStep());

const originalFight = FightStateManager.getInstance().getFightProperties();
beforeEach(() => FightStateManager.getInstance().reset());
afterEach(() => FightStateManager.getInstance().setFightProperties(originalFight));

const fixture = (ability: "Through Shot" | "Area Throw", enemyCells: XY[], barrels: XY[] = []) => {
    const grid = new Grid(settings, GridVals.NORMAL);
    const holder = new UnitsHolder(grid);
    const effects = new EffectFactory();
    const create = (team: TeamType, cell: XY, abilities: string[]) => {
        const unit = Unit.createUnit(
            {
                ...HoCConfig.getCreatureConfig(team, "Life", "Peasant", "", 100),
                attack_type: abilities.length ? AttackVals.RANGE : AttackVals.MELEE,
                attack_type_selected: abilities.length ? AttackVals.RANGE : AttackVals.MELEE,
                range_shots: abilities.length ? 10 : 0,
                shot_distance: 16,
                abilities,
                abilities_descriptions: abilities.map(() => ""),
                abilities_stack_powered: abilities.map(() => false),
                abilities_auras: abilities.map(() => false),
            },
            settings,
            team,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        );
        const point = position(cell);
        unit.setPosition(point.x, point.y);
        expect(grid.occupyCells(unit.getCells(), unit.getId(), team, unit.getAttackRange(), false, false)).toBe(true);
        holder.addUnit(unit);
        return unit;
    };
    // The scene draws its arrow only for a board unit; the engine unit is otherwise unchanged.
    const shooter = Object.setPrototypeOf(create(TeamVals.LEFT, { x: 2, y: 7 }, [ability]), RenderableUnit.prototype);
    const enemies = enemyCells.map((cell) => create(TeamVals.RIGHT, cell, []));
    if (barrels.length) grid.setScatteredMountains(barrels);
    const fight = FightStateManager.getInstance().getFightProperties();
    fight.startFight();
    fight.startTurn(shooter.getTeam(), 1000);
    const handler = new AttackHandler(
        settings,
        grid,
        { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false },
        { add: () => {}, get: () => [], has: () => false, clear: () => {} },
    );

    const drawn: string[] = [];
    const highlightedUnits: string[] = [];
    const forecasts: XY[] = [];
    const badges: string[] = [];
    const casingJoint = { x: -1, y: -1 };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        grid,
        unitsHolder: holder,
        attackHandler: handler,
        currentActiveUnit: shooter,
        sc_sceneSettings: { getGridSettings: () => settings },
        sc_hoverInfoArr: [] as string[],
        isAttackBlockedByAggr: () => undefined,
        clearAggrBlockedActionHint: () => {},
        shouldDeferActionToAuthoritativeReplay: () => true,
        submitActionForAuthoritativeReplay: mock(() => true),
        executeObstacleAttackSequence: mock(() => true),
        dungeonVisuals: { highlightScatteredMountains: () => {}, clearScatteredMountainHighlight: () => {} },
        hoverManager: {
            clearAOEArea: () => {},
            clearAttackVisuals: () => {},
            clearHoverSilhouette: () => {},
            clearObstacleHighlight: () => {},
            drawAOEArea: () => drawn.push("blast area"),
            drawRangeTerminalArrowhead: () => {
                drawn.push("arrowhead");
                return casingJoint;
            },
            drawAttackArrow: (_from: XY, to: XY) => drawn.push(to === casingJoint ? "arrow to socket" : "arrow"),
            addTargetHighlight: (unit: Unit) => highlightedUnits.push(unit.getId()),
            addAOEDamagePrediction: (_damage: string, _kills: string | undefined, anchor: XY) => forecasts.push(anchor),
            drawDamagePrediction: (text: string) => badges.push(text),
        },
    });
    return { scene, shooter, enemies, drawn, highlightedUnits, forecasts, badges };
};

describe("free siege targeting", () => {
    test("Tsar Cannon's free ray forecasts every stack it crosses and draws no central plaque", () => {
        const f = fixture("Through Shot", [
            { x: 6, y: 7 },
            { x: 10, y: 7 },
        ]);
        f.scene.sc_hoverInfoArr = ["Line attack"];
        f.scene.sc_mouseWorld = position({ x: 12, y: 7 });

        expect(f.scene.updateFreeThroughShotHover()).toBe(true);

        expect(f.scene.sc_hoverInfoArr).toEqual([]);
        expect(f.drawn).toEqual(["arrowhead", "arrow to socket"]);
        const ids = f.enemies.map((enemy) => enemy.getId());
        expect(f.highlightedUnits).toEqual(ids);
        expect(f.forecasts).toEqual(f.enemies.map((enemy) => enemy.getPosition()));
    });

    test("a free-ray click fires a target-less shot at the pointer, or at the barrel when nothing precedes it", () => {
        const aim = position({ x: 12, y: 7 });
        const withStacks = fixture("Through Shot", [{ x: 6, y: 7 }]);
        expect(withStacks.scene.attemptFreeThroughShotAttack(aim)).toBe(true);
        expect(withStacks.scene.submitActionForAuthoritativeReplay).toHaveBeenCalledWith({
            type: "range_attack",
            attackerId: withStacks.shooter.getId(),
            targetId: "",
            targetPosition: aim,
        });
        expect(withStacks.scene.executeObstacleAttackSequence).not.toHaveBeenCalled();

        const barrelOnly = fixture("Through Shot", [], [{ x: 8, y: 7 }]);
        expect(barrelOnly.scene.attemptFreeThroughShotAttack(aim)).toBe(true);
        const [shooter, struck] = barrelOnly.scene.executeObstacleAttackSequence.mock.calls[0] as [Unit, XY];
        expect(shooter).toBe(barrelOnly.shooter);
        expect(GridMath.getCellForPosition(settings, struck)).toEqual({ x: 8, y: 7 });
        expect(barrelOnly.scene.submitActionForAuthoritativeReplay).not.toHaveBeenCalled();
    });

    test("Area Throw shows a corner range badge and a forecast on every unit in the blast", () => {
        const f = fixture("Area Throw", [
            { x: 9, y: 7 },
            { x: 10, y: 8 },
            { x: 12, y: 7 },
        ]);
        const blast = GridMath.getCellsAroundCell(settings, { x: 10, y: 7 });
        f.scene.getAreaThrowCells = () => [...blast, { x: 10, y: 7 }];
        f.scene.sc_hoverInfoArr = ["Area attack"];

        expect(f.scene.updateAreaThrowHover()).toBe(true);

        expect(f.scene.sc_hoverInfoArr).toEqual([]);
        expect(f.drawn).toEqual(["blast area", "arrowhead", "arrow to socket"]);
        const inBlast = f.enemies.slice(0, 2);
        expect(f.highlightedUnits.sort()).toEqual(inBlast.map((enemy) => enemy.getId()).sort());
        expect(f.forecasts).toHaveLength(2);
        expect(f.forecasts).toEqual(expect.arrayContaining(inBlast.map((enemy) => enemy.getPosition())));
        expect(f.badges).toEqual([
            `1/${f.scene.attackHandler.getRangeAttackDivisor(f.shooter, position({ x: 10, y: 7 }))}`,
        ]);
    });
});
