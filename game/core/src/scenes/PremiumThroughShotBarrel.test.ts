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
    type HoCMath,
    type TeamType,
} from "@heroesofcrypto/common";

import { premiumMoveDrawing } from "./PremiumTurnOverlay";

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

// Tsar Cannon (2x2, Through Shot) on the right shoots left along rows 8-9. A barrel stops the shot.
const fixture = (barrel: HoCMath.XY, targetCell: HoCMath.XY, screen?: HoCMath.XY) => {
    FightStateManager.getInstance().reset();
    const grid = new Grid(gs, GridVals.BLOCK_CENTER);
    grid.setScatteredMountains([barrel]);
    const unitsHolder = new UnitsHolder(grid);
    const create = (faction: string, name: string, team: TeamType, x: number, y: number) => {
        const effects = new EffectFactory();
        const unit = Unit.createUnit(
            HoCConfig.getCreatureConfig(team, faction, name, "", 20),
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
    const cannon = create("Life", "Tsar Cannon", TeamVals.RIGHT, 13, 9);
    const target = create("Chaos", "Troglodyte", TeamVals.LEFT, targetCell.x, targetCell.y);
    const front = screen ? create("Chaos", "Troglodyte", TeamVals.LEFT, screen.x, screen.y) : undefined;
    const attackHandler = new AttackHandler(
        gs,
        grid,
        { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false },
        { add: () => {}, get: () => [], has: () => false, clear: () => {} },
    );
    const context = { grid, unitsHolder, attackHandler };
    const option = {
        id: "through",
        label: "never parsed",
        reasons: [],
        actions: [
            { type: "range_attack", attackerId: cannon.getId(), targetId: target.getId() },
        ] satisfies GameAction[],
    };
    const draw = () => premiumMoveDrawing(option, cannon, unitsHolder.getAllUnits(), gs, context)!;
    return { grid, cannon, target, front, draw, attackHandler, unitsHolder };
};

test("a barrel behind the target ends Through Shot's line at the target, not at the untouched barrel", () => {
    // Find a cell three columns past the target on the cannon's real ray, then stand the barrel there.
    const probe = fixture({ x: 0, y: 0 }, { x: 8, y: 9 });
    const aim = probe.draw().point,
        from = probe.cannon.getPosition();
    const behindX = aim.x - 3 * gs.getStep();
    const behind = { x: behindX, y: from.y + ((aim.y - from.y) * (behindX - from.x)) / (aim.x - from.x) };
    const barrelCell = GridMath.getCellForPosition(gs, behind)!;
    const f = fixture(barrelCell, { x: 8, y: 9 });
    expect(
        f.attackHandler.evaluateRangeAttack(f.unitsHolder.getAllUnits(), f.cannon, from, aim, true).attackObstacle,
    ).toBeDefined();
    const drawing = f.draw();
    const barrel = GridMath.getPositionForFootprintAnchor(gs, barrelCell, 1, 1);
    expect(drawing.label).toBe("Shoot");
    expect(drawing.cells).toEqual(f.target.getCells());
    expect(drawing.point).not.toEqual(barrel);
    // The line ends on the target's body, well short of the barrel.
    expect(Math.abs(drawing.point.x - f.target.getPosition().x)).toBeLessThanOrEqual(gs.getStep());
    expect(f.grid.isScatteredMountainCell(barrelCell)).toBe(true);
});

test("a barrel between the screen and the target ends the line at the last unit actually pierced", () => {
    const f = fixture({ x: 6, y: 9 }, { x: 3, y: 9 }, { x: 9, y: 9 });
    const drawing = f.draw();
    expect(drawing.cells).toEqual(f.front!.getCells());
    expect(drawing.point).toEqual(f.front!.getPosition());
});
