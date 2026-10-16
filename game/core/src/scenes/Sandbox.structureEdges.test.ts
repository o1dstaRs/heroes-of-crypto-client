import { afterEach, describe, expect, test } from "bun:test";
import {
    AbilityFactory,
    AttackHandler,
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

import type { RangeTargetEdgeVisual } from "./HoverManager";
import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { rangeTargetEdgeIsSelectable } from "./rangeTargetEdges";

const settings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const targetCell = { x: 8, y: 8 };
const directions = [
    { side: GridMath.RangeAttackCellSide.LEFT, barrel: { x: 7, y: 8 }, shooter: { x: 3, y: 8 } },
    { side: GridMath.RangeAttackCellSide.RIGHT, barrel: { x: 9, y: 8 }, shooter: { x: 13, y: 8 } },
    { side: GridMath.RangeAttackCellSide.DOWN, barrel: { x: 8, y: 7 }, shooter: { x: 8, y: 3 } },
    { side: GridMath.RangeAttackCellSide.UP, barrel: { x: 8, y: 9 }, shooter: { x: 8, y: 13 } },
];
const previousFight = FightStateManager.getInstance().getFightProperties();
afterEach(() => FightStateManager.getInstance().setFightProperties(previousFight));

interface EdgeScene {
    rangeTargetEdgeVisuals(attacker: RenderableUnit, target: Unit): RangeTargetEdgeVisual[];
    resolveRangeAimForTarget(
        attacker: RenderableUnit,
        target: Unit,
        aim: HoCMath.XY,
    ): GridMath.IClosestSideCenter | undefined;
    resolveRangeShotAim(
        attacker: RenderableUnit,
        target: Unit,
        from: HoCMath.XY,
    ): GridMath.IClosestSideCenter | undefined;
}

function fixture(name: string, team: TeamType, direction: (typeof directions)[number]) {
    const grid = new Grid(settings, GridVals.BLOCK_CENTER);
    grid.setScatteredMountains([direction.barrel]);
    const unitsHolder = new UnitsHolder(grid);
    const effects = new EffectFactory();
    const abilities = new AbilityFactory(effects);
    const creature = (faction: string, unitName: string, unitTeam: TeamType) =>
        Unit.createUnit(
            HoCConfig.getCreatureConfig(unitTeam, faction, unitName, "", 1),
            settings,
            unitTeam,
            UnitVals.CREATURE,
            abilities,
            effects,
            false,
        );
    const faction = name === "Gargantuan" ? "Nature" : name === "Cyclops" ? "Might" : "Life";
    const attacker = RenderableUnit.fromBase(creature(faction, name, team), undefined as never);
    const target = creature("Life", "Peasant", team === TeamVals.LEFT ? TeamVals.RIGHT : TeamVals.LEFT);
    for (const [unit, anchor] of [
        [attacker, direction.shooter],
        [target, targetCell],
    ] as const) {
        const position = GridMath.getPositionForFootprintAnchor(
            settings,
            anchor,
            unit.getFootprintWidth(),
            unit.getFootprintHeight(),
        );
        unit.setPosition(position.x, position.y);
        grid.occupyCells(unit.getCells(), unit.getId(), unit.getTeam(), unit.getAttackRange(), false, false);
        unitsHolder.addUnit(unit);
    }
    const sceneLog = { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false };
    const statistics = { add: () => {}, get: () => [], has: () => false, clear: () => {} };
    const attackHandler = new AttackHandler(settings, grid, sceneLog, statistics);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        grid,
        unitsHolder,
        attackHandler,
        sc_sceneSettings: { getGridSettings: () => settings },
    }) as EdgeScene;
    return { grid, scene, attacker, target };
}

describe("sandbox target edges beside barrels", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        for (const name of ["Cyclops", "Gargantuan"]) {
            for (const direction of directions) {
                test(`${name}, team ${team}: preview and click accept side ${direction.side} beside a barrel`, () => {
                    const f = fixture(name, team, direction);
                    expect(
                        rangeTargetEdgeIsSelectable(
                            f.grid.getMatrix(),
                            settings,
                            targetCell,
                            direction.side,
                            f.attacker.getPosition(),
                            f.target.getPosition(),
                            f.attacker.isSmallSize(),
                            true,
                            team,
                            false,
                            true,
                        ),
                    ).toBe(true);
                    const edges = f.scene.rangeTargetEdgeVisuals(f.attacker, f.target);
                    const edge = edges.find((entry) => entry.side === direction.side);
                    expect(edge?.shootable).toBe(true);
                    const hover = f.scene.resolveRangeAimForTarget(f.attacker, f.target, f.target.getPosition());
                    const click = f.scene.resolveRangeShotAim(f.attacker, f.target, f.attacker.getPosition());
                    expect(hover?.side).toBe(direction.side);
                    expect(click?.side).toBe(direction.side);
                    expect(click?.position).toEqual(edge?.aimPosition);
                });
            }
        }

        test(`team ${team}: an ordinary archer cannot select the barrel-covered edge`, () => {
            const f = fixture("Arbalester", team, directions[0]);
            expect(
                f.scene
                    .rangeTargetEdgeVisuals(f.attacker, f.target)
                    .some((entry) => entry.side === GridMath.RangeAttackCellSide.LEFT),
            ).toBe(false);
            expect(f.scene.resolveRangeShotAim(f.attacker, f.target, f.attacker.getPosition())).toBeUndefined();
        });
    }
});
