import { afterEach, expect, test } from "bun:test";
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
    type GameAction,
    type TeamType,
} from "@heroesofcrypto/common";

import { premiumMoveDrawing } from "./PremiumTurnOverlay";
import { rangeTargetEdgeIsSelectable } from "./rangeTargetEdges";

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const previousFight = FightStateManager.getInstance().getFightProperties();
afterEach(() => FightStateManager.getInstance().setFightProperties(previousFight));

const fixture = () => {
    FightStateManager.getInstance().reset();
    const grid = new Grid(gs, GridVals.LAVA_CENTER);
    const unitsHolder = new UnitsHolder(grid);
    const create = (faction: string, name: string, team: TeamType, amount: number, x: number, y: number) => {
        const effects = new EffectFactory();
        const unit = Unit.createUnit(
            HoCConfig.getCreatureConfig(team, faction, name, "", amount),
            gs,
            team,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        );
        const position = GridMath.getPositionForFootprintAnchor(
            gs,
            { x, y },
            unit.getFootprintWidth(),
            unit.getFootprintHeight(),
        );
        unit.setPosition(position.x, position.y);
        expect(grid.occupyCells(unit.getCells(), unit.getId(), team, unit.getAttackRange(), false, false)).toBe(true);
        unitsHolder.addUnit(unit);
        return unit;
    };
    const elf = create("Nature", "Elf", TeamVals.RIGHT, 91, 13, 9);
    const fairy = create("Nature", "Fairy", TeamVals.LEFT, 139, 1, 12);
    const troglodyte = create("Chaos", "Troglodyte", TeamVals.LEFT, 125, 3, 11);
    const attackHandler = new AttackHandler(
        gs,
        grid,
        { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false },
        { add: () => {}, get: () => [], has: () => false, clear: () => {} },
    );
    const context = { grid, unitsHolder, attackHandler };
    const option = (aimSide: GridMath.RangeAttackCellSide, target = fairy) => ({
        id: "cover",
        label: "This label is never parsed",
        reasons: [],
        actions: [
            {
                type: "range_attack",
                attackerId: elf.getId(),
                targetId: target.getId(),
                aimCell: target.getBaseCell(),
                aimSide,
            },
        ] satisfies GameAction[],
    });
    return { ...context, context, elf, fairy, troglodyte, option };
};

test("stale advice cannot draw an unreachable back-edge shot at screened Fairy", () => {
    const f = fixture();
    const aim = GridMath.getRangeAttackSideCenter(
        gs,
        f.fairy.getBaseCell(),
        GridMath.RangeAttackCellSide.UP,
        f.elf.getPosition(),
    );
    expect(
        f.attackHandler.evaluateRangeAttack(f.unitsHolder.getAllUnits(), f.elf, f.elf.getPosition(), aim)
            .affectedUnits[0][0],
    ).toBe(f.fairy);
    // The raw ray is clear, but the cursor cannot aim at this side. Both layers use the same predicate.
    expect(
        rangeTargetEdgeIsSelectable(
            f.grid.getMatrix(),
            gs,
            f.fairy.getBaseCell(),
            GridMath.RangeAttackCellSide.UP,
            f.elf.getPosition(),
            f.fairy.getPosition(),
            true,
            true,
            f.elf.getTeam(),
            false,
        ),
    ).toBe(false);
    expect(
        premiumMoveDrawing(
            f.option(GridMath.RangeAttackCellSide.UP),
            f.elf,
            f.unitsHolder.getAllUnits(),
            gs,
            f.context,
        ),
    ).toBeUndefined();
});

test("a selectable screened ray marks Troglodyte as the actual impact, never Fairy", () => {
    const f = fixture();
    const plan = f.option(GridMath.RangeAttackCellSide.RIGHT);
    const original = structuredClone(plan);
    const health = [f.elf, f.fairy, f.troglodyte].map((unit) => unit.getCumulativeHp());
    const drawing = premiumMoveDrawing(plan, f.elf, f.unitsHolder.getAllUnits(), gs, f.context)!;
    expect(drawing.label).toBe("Shoot");
    expect(drawing.cells).toEqual(f.troglodyte.getCells());
    expect(drawing.point).toEqual(f.troglodyte.getPosition());
    expect(plan).toEqual(original);
    expect([f.elf, f.fairy, f.troglodyte].map((unit) => unit.getCumulativeHp())).toEqual(health);
});

test("canonical shots at the screening unit remain drawable", () => {
    const f = fixture();
    const drawing = premiumMoveDrawing(
        f.option(GridMath.RangeAttackCellSide.RIGHT, f.troglodyte),
        f.elf,
        f.unitsHolder.getAllUnits(),
        gs,
        f.context,
    )!;
    expect(drawing.cells).toEqual(f.troglodyte.getCells());
});
