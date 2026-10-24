import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
    Unit,
    UnitsHolder,
    UnitVals,
    type HoCMath,
    type TeamType,
} from "@heroesofcrypto/common";
import { Graphics } from "pixi.js";
import type { RangeTargetEdgeVisual } from "./HoverManager";
import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { drawRangedInspection, RangedInspectionCache } from "./rangedInspection";

const previousFight = FightStateManager.getInstance().getFightProperties();
beforeEach(() => FightStateManager.getInstance().reset());
afterEach(() => FightStateManager.getInstance().setFightProperties(previousFight));

const settings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

function createTestUnit(options: {
    name?: string;
    team: TeamType;
    footprintWidth?: number;
    footprintHeight?: number;
    abilities?: string[];
}): Unit {
    const name = options.name ?? "Berserker";
    const effects = new EffectFactory();
    const properties = HoCConfig.getCreatureConfig(
        options.team,
        name === "Black Dragon" ? "Chaos" : "Might",
        name,
        "",
        10,
    );
    const abilities = options.abilities ?? properties.abilities;
    return Unit.createUnit(
        {
            ...properties,
            footprint_width: options.footprintWidth ?? 1,
            footprint_height: options.footprintHeight ?? 1,
            abilities,
            abilities_descriptions: abilities.map(() => ""),
            abilities_stack_powered: abilities.map(() => false),
            abilities_auras: abilities.map(() => false),
        },
        settings,
        options.team,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
}

function placeUnit(grid: Grid, holder: UnitsHolder, unit: Unit, anchor: HoCMath.XY): void {
    const position = GridMath.getPositionForFootprintAnchor(
        settings,
        anchor,
        unit.getFootprintWidth(),
        unit.getFootprintHeight(),
    );
    unit.setPosition(position.x, position.y);
    expect(grid.occupyCells(unit.getCells(), unit.getId(), unit.getTeam(), unit.getAttackRange(), false, false)).toBe(
        true,
    );
    holder.addUnit(unit);
}

function fixture(abilities = ["Handyman", "Piercing Spear", "Boost Health"], production = false) {
    const grid = new Grid(settings, GridVals.BLOCK_CENTER);
    const sceneLog = { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false };
    const statistics = { add: () => {}, get: () => [], has: () => false, clear: () => {} };
    const context = {
        grid,
        unitsHolder: new UnitsHolder(grid),
        attackHandler: new AttackHandler(settings, grid, sceneLog, statistics),
    };
    const shooter = RenderableUnit.fromBase(
        createTestUnit({
            name: "Centaur",
            team: 1,
            footprintWidth: 2,
            footprintHeight: 1,
            abilities,
        }),
        undefined as never,
    );
    const target = createTestUnit({
        name: "Black Dragon",
        team: 2,
        footprintWidth: production ? 2 : 1,
        footprintHeight: production ? 2 : 1,
    });
    context.grid.setScatteredMountains(
        production
            ? [
                  [9, 6],
                  [7, 14],
                  [7, 1],
                  [6, 14],
                  [8, 14],
                  [6, 4],
                  [9, 11],
                  [8, 6],
                  [9, 2],
              ].map(([x, y]) => ({ x, y }))
            : [{ x: 6, y: 3 }],
    );
    placeUnit(context.grid, context.unitsHolder, shooter, production ? { x: 14, y: 2 } : { x: 3, y: 3 });
    placeUnit(context.grid, context.unitsHolder, target, production ? { x: 8, y: 8 } : { x: 9, y: 3 });
    const arrows: HoCMath.XY[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        ...context,
        sc_sceneSettings: { getGridSettings: () => context.grid.getSettings() },
        currentShiftedUnit: shooter,
        sc_hoverInfoArr: [],
        getViewerTeam: () => 1,
        isEnemyActiveTurn: () => true,
        highlightScatteredObstaclesAlongTrajectory: () => {},
        hoverManager: {
            drawAttackArrow: (_from: HoCMath.XY, to: HoCMath.XY) => arrows.push(to),
            addTargetHighlight: () => {},
        },
    }) as {
        rangeTargetEdgeVisuals(shooter: RenderableUnit, target: Unit): RangeTargetEdgeVisual[];
        renderIncomingThreatPreview(target: Unit): boolean;
        drawInspectedRangedTargets(g: Graphics): void;
        currentShiftedUnit?: RenderableUnit;
    };
    let evaluations = 0;
    const input = {
        shooter,
        grid: context.grid,
        units: context.unitsHolder.getAllUnits(),
        viewerTeam: 1 as TeamType,
        canShoot: true,
        edgesForTarget: (unit: Unit) => {
            evaluations++;
            return scene.rangeTargetEdgeVisuals(shooter, unit);
        },
    };
    return {
        ...context,
        shooter,
        target,
        input,
        scene,
        arrows,
        evaluations: () => evaluations,
        cache: new RangedInspectionCache(),
    };
}

describe("Shift-click ranged target cells", () => {
    test("production Centaur shot exposes the upper Dragon cell while the lower cell stays behind barrels", () => {
        const f = fixture(undefined, true);
        const before = f.grid.getScatteredMountainsStanding();
        const result = f.cache.get(f.input);
        expect(result.cells.find(({ cell }) => cell.x === 8 && cell.y === 8)?.reachable).toBe(true);
        expect(result.cells.find(({ cell }) => cell.x === 8 && cell.y === 7)?.reachable).toBe(false);
        expect(result.cells).toHaveLength(4);
        expect(result.edges.every((edge) => edge.shootable)).toBe(true);
        expect(f.grid.getScatteredMountainsStanding()).toEqual(before);
        const graphics = new Graphics();
        drawRangedInspection(graphics, result, f.grid.getSettings());
        expect(graphics.getLocalBounds().width).toBeGreaterThan(0);
        graphics.destroy();
    });

    test("a barrel blocks an ordinary shooter and clearing it refreshes the cached cells", () => {
        const f = fixture();
        const blocked = f.cache.get(f.input);
        expect(blocked.cells.map((entry) => entry.reachable)).toEqual([false]);
        expect(blocked.edges).toHaveLength(0);
        expect(f.cache.get(f.input)).toBe(blocked);
        expect(f.evaluations()).toBe(1);
        f.grid.clearScatteredMountainAt(6, 3);
        expect(f.cache.get(f.input).cells.map((entry) => entry.reachable)).toEqual([true]);
        expect(f.evaluations()).toBe(2);
    });

    for (const ability of ["Large Caliber", "Area Throw"]) {
        test(`${ability} correctly exposes a target behind a barrel`, () => {
            const f = fixture([ability]);
            expect(f.cache.get(f.input).cells.map((entry) => entry.reachable)).toEqual([true]);
            expect(f.grid.getScatteredMountainsStanding()).toEqual([{ x: 6, y: 3 }]);
        });
    }

    test("Through Shot still stops at barrels; Double Shot does not promise a clear first hit", () => {
        for (const ability of ["Through Shot", "Double Shot"]) {
            const f = fixture([ability]);
            expect(f.cache.get(f.input).cells.map((entry) => entry.reachable)).toEqual([false]);
        }
    });

    test("unit screening blocks ordinary shots and Through Shot exposes units behind the screen", () => {
        for (const through of [false, true]) {
            const f = fixture(through ? ["Through Shot"] : []);
            f.grid.clearScatteredMountainAt(6, 3);
            const screen = createTestUnit({ team: 2 });
            placeUnit(f.grid, f.unitsHolder, screen, { x: 6, y: 3 });
            expect(f.cache.get(f.input).cells.find(({ cell }) => cell.x === 9)?.reachable).toBe(through);
        }
    });

    test("hidden opponents, allies, and unplaced units never become inspected targets", () => {
        const f = fixture();
        placeUnit(f.grid, f.unitsHolder, createTestUnit({ team: 1 }), { x: 0, y: 0 });
        const bench = createTestUnit({ team: 2 });
        bench.setPosition(-5000, -5000);
        f.unitsHolder.addUnit(bench);
        f.target.hasBuffActive = (name) => name === "Hidden";
        expect(f.cache.get(f.input).cells).toEqual([]);
        f.target.hasBuffActive = () => false;
        expect(f.cache.get(f.input).cells).toHaveLength(1);
        f.input.viewerTeam = 2;
        f.shooter.hasBuffActive = (name) => name === "Hidden";
        expect(f.cache.get(f.input).cells).toEqual([]);
    });

    test("pinned or empty shooters clear the overlay, and closing inspection invalidates it", () => {
        const f = fixture();
        const original = f.cache.get(f.input);
        expect(f.cache.get({ ...f.input, canShoot: false }).cells).toEqual([]);
        expect(f.cache.get(f.input)).not.toBe(original);
        f.cache.clear();
        expect(f.cache.get(f.input)).not.toBe(original);
    });

    test("Centaur threat arrows choose an exposed edge and never point through a blocking barrel", () => {
        const blocked = fixture();
        FightStateManager.getInstance().getFightProperties().startFight();
        expect(blocked.scene.renderIncomingThreatPreview(blocked.target)).toBe(false);
        expect(blocked.arrows).toEqual([]);
        const exposed = fixture(undefined, true);
        expect(exposed.scene.renderIncomingThreatPreview(exposed.target)).toBe(true);
        expect(exposed.arrows).toHaveLength(1);
    });

    test("the scene draws the inspection during combat and removes it when Shift-click is toggled off", () => {
        const f = fixture(undefined, true);
        FightStateManager.getInstance().getFightProperties().startFight();
        const graphics = new Graphics();
        f.scene.drawInspectedRangedTargets(graphics);
        expect(graphics.getLocalBounds().width).toBeGreaterThan(0);
        graphics.clear();
        f.scene.currentShiftedUnit = undefined;
        f.scene.drawInspectedRangedTargets(graphics);
        expect(graphics.getLocalBounds().width).toBe(0);
        graphics.destroy();
    });

    test("repeated threat previews and frame draws share one batch of ray evaluations", () => {
        const f = fixture(undefined, true);
        FightStateManager.getInstance().getFightProperties().startFight();
        const original = f.scene.rangeTargetEdgeVisuals.bind(f.scene);
        let evaluations = 0;
        f.scene.rangeTargetEdgeVisuals = (shooter, target) => {
            evaluations++;
            return original(shooter, target);
        };
        const graphics = new Graphics();
        for (let frame = 0; frame < 20; frame++) {
            f.scene.renderIncomingThreatPreview(f.target);
            graphics.clear();
            f.scene.drawInspectedRangedTargets(graphics);
        }
        expect(evaluations).toBe(1);
        graphics.destroy();
    });

    for (const unavailable of ["pinned", "out of ammunition"]) {
        test(`the scene shows no attack cells when the inspected shooter is ${unavailable}`, () => {
            const f = fixture(undefined, true);
            FightStateManager.getInstance().getFightProperties().startFight();
            if (unavailable === "pinned") {
                placeUnit(f.grid, f.unitsHolder, createTestUnit({ team: 2 }), { x: 14, y: 3 });
            } else {
                while (f.shooter.getRangeShots() > 0) f.shooter.decreaseNumberOfShots();
            }
            const graphics = new Graphics();
            f.scene.drawInspectedRangedTargets(graphics);
            expect(graphics.getLocalBounds().width).toBe(0);
            expect(f.scene.renderIncomingThreatPreview(f.target)).toBe(false);
            graphics.destroy();
        });
    }
});
