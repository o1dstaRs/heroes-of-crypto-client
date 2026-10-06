import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    AbilityFactory,
    AllAbilities,
    AttackHandler,
    createSequenceGameRuntime,
    EffectFactory,
    FightStateManager,
    GameActionEngine,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    HoCLib,
    MoveHandler,
    RayTraversal,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type GameEvent,
    type GridType,
    type HoCMath,
    type IDamageStatistic,
    type TeamType,
} from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";
import { RenderableUnit } from "./RenderableUnit";

type XY = HoCMath.XY;
type AreaEvent = Extract<GameEvent, { type: "area_attacked" }>;
type AreaScene = {
    getAreaThrowCells(position?: XY): XY[] | undefined;
    getAreaThrowImpactCell(unit: Unit, cell: XY): XY;
    highlightRangeAttackUnits(target: Unit): boolean;
};
const settings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const point = (cell: XY) =>
    GridMath.getPositionForCell(cell, settings.getMinX(), settings.getStep(), settings.getHalfStep());
const previousFight = FightStateManager.getInstance().getFightProperties();
beforeEach(() => {
    FightStateManager.getInstance().reset();
    HoCLib.setDeterministicRandomSource(() => 0.99);
});
afterEach(() => {
    HoCLib.setDeterministicRandomSource(undefined);
    FightStateManager.getInstance().setFightProperties(previousFight);
});

function fixture(team: TeamType, gridType: GridType = GridVals.NORMAL, attackerAnchor: XY = { x: 7, y: 7 }) {
    const grid = new Grid(settings, gridType);
    const holder = new UnitsHolder(grid);
    const effects = new EffectFactory();
    const abilities = new AbilityFactory(effects);
    const sceneLog = { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false };
    const statistics = {
        add: (_entry: IDamageStatistic) => {},
        get: (): IDamageStatistic[] => [],
        has: () => false,
        clear: () => {},
    };
    const handler = new AttackHandler(settings, grid, sceneLog, statistics);
    const place = (unit: Unit, anchor: XY) => {
        const position = GridMath.getPositionForFootprintAnchor(
            settings,
            anchor,
            unit.getFootprintWidth(),
            unit.getFootprintHeight(),
        );
        unit.setPosition(position.x, position.y);
        expect(
            grid.occupyCells(unit.getCells(), unit.getId(), unit.getTeam(), unit.getAttackRange(), false, false),
        ).toBe(true);
        holder.addUnit(unit);
        return unit;
    };
    const creature = (name: string, faction: string, unitTeam: TeamType, width?: number, height?: number) => {
        const properties = HoCConfig.getCreatureConfig(
            unitTeam,
            faction,
            name,
            `${name.toLowerCase()}_512`,
            name === "Gargantuan" ? 1 : 100,
        );
        return Unit.createUnit(
            width !== undefined && height !== undefined
                ? { ...properties, footprint_width: width, footprint_height: height }
                : properties,
            settings,
            unitTeam,
            UnitVals.CREATURE,
            abilities,
            effects,
            false,
        );
    };
    const attacker = place(
        RenderableUnit.fromBase(creature("Gargantuan", "Nature", team), undefined as never),
        attackerAnchor,
    );
    attacker.refreshPossibleAttackTypes(true);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        grid,
        unitsHolder: holder,
        attackHandler: handler,
        currentActiveUnit: attacker,
        sc_sceneSettings: { getGridSettings: () => settings },
    }) as AreaScene;
    const fight = FightStateManager.getInstance().getFightProperties();
    fight.setGridType(gridType);
    fight.startFight();
    fight.startTurn(team, 1000);
    const engine = new GameActionEngine({
        fightProperties: fight,
        grid,
        unitsHolder: holder,
        attackHandler: handler,
        moveHandler: new MoveHandler(settings, grid, holder),
        sceneLog,
        getCurrentActiveUnitId: () => attacker.getId(),
        runtime: createSequenceGameRuntime({ nowMillis: [1400] }),
    });
    const fire = (aim: XY): AreaEvent => {
        const result = engine.apply({ type: "area_throw_attack", attackerId: attacker.getId(), targetCell: aim });
        expect(result.completed).toBe(true);
        const area = result.events.find((event): event is AreaEvent => event.type === "area_attacked");
        expect(area).toBeDefined();
        return area!;
    };
    return { grid, holder, handler, attacker, scene, creature, place, fire, engine };
}

function assertAreaMatchesImpact(f: ReturnType<typeof fixture>, aim: XY, expectedCenter: XY) {
    const displayed = f.scene.getAreaThrowCells(point(aim));
    const predictedCenter = f.scene.getAreaThrowImpactCell(f.attacker, aim);
    const predictedVictims = AllAbilities.evaluateAffectedUnits(displayed ?? [], f.holder, f.grid)?.[0] ?? [];
    const event = f.fire(aim);
    expect(event.targetCell).toEqual(expectedCenter);
    expect(predictedCenter).toEqual(event.targetCell);
    expect(event.targetPosition).toEqual(point(event.targetCell));
    expect(displayed).toEqual([...GridMath.getCellsAroundCell(settings, event.targetCell), event.targetCell]);
    expect(event.affectedUnitIds).toEqual(predictedVictims.map((unit) => unit.getId()));
    expect(new Set(event.affectedUnitIds).size).toBe(event.affectedUnitIds.length);
    return event;
}

function previewUnitShot(f: ReturnType<typeof fixture>, target: Unit) {
    const aim = GridMath.resolveRangeAttackAimEdge(
        f.grid.getMatrix(),
        settings,
        target.getCells(),
        f.attacker.getPosition(),
        f.attacker.getTeam(),
        f.attacker.hasAbilityActive("Through Shot"),
    );
    expect(aim).toBeDefined();
    const drawn: XY[][] = [];
    const highlighted: Unit[] = [];
    Object.assign(f.scene, {
        // Supply the exact legal edge intent also sent with the native action below.
        resolveRangeAimForTarget: () => aim,
        hoverManager: {
            drawAOEArea: (cells: XY[]) => drawn.push(cells),
            addTargetHighlight: (unit: Unit) => highlighted.push(unit),
        },
    });
    const evaluation = f.handler.evaluateRangeAttack(
        f.holder.getAllUnits(),
        f.attacker,
        f.attacker.getPosition(),
        aim!.position,
        f.attacker.hasAbilityActive("Through Shot"),
        false,
        true,
    );
    expect(f.scene.highlightRangeAttackUnits(target)).toBe(true);
    return { aim: aim!, drawn, highlighted, evaluation };
}

function fireUnitShot(f: ReturnType<typeof fixture>, target: Unit, preview: ReturnType<typeof previewUnitShot>) {
    const result = f.engine.apply({
        type: "range_attack",
        attackerId: f.attacker.getId(),
        targetId: target.getId(),
        aimCell: preview.aim.cell,
        aimSide: preview.aim.side,
    });
    expect(result.completed).toBe(true);
    const event = result.events.find((event) => event.type === "unit_attacked");
    expect(event).toBeDefined();
    expect(event!.targetId).toBe(target.getId());
    const damagedIds = [...new Set(event!.damage.splash?.map((entry) => entry.unitId))].sort();
    const predictedIds = preview.evaluation.affectedUnits[0].map((unit) => unit.getId()).sort();
    expect(damagedIds).toEqual(predictedIds);
    return event!;
}

const directions = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
] as const;

describe("Sandbox Area Throw's actual landing projection", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const enemy = team === TeamVals.LEFT ? TeamVals.RIGHT : TeamVals.LEFT;
        for (const [dx, dy] of directions) {
            const aim = { x: 7 + dx * 6, y: 7 + dy * 6 };
            test(`team ${team}, clear direction ${dx},${dy} retains the aimed cell`, () => {
                assertAreaMatchesImpact(fixture(team), aim, aim);
            });
            for (const [width, height] of [
                [1, 1],
                [1, 2],
                [2, 1],
                [2, 2],
            ]) {
                test(`team ${team}, direction ${dx},${dy}, first ${width}x${height} enemy intercepts both boulders`, () => {
                    const f = fixture(team);
                    const ray = RayTraversal.traceGridRayCells(settings, f.attacker.getPosition(), point(aim));
                    const anchor = ray[Math.floor(ray.length * 0.6)][0];
                    const target = f.place(f.creature("Berserker", "Might", enemy, width, height), anchor);
                    const event = assertAreaMatchesImpact(f, aim, target.getBaseCell());
                    expect(event.affectedUnitIds).toContain(target.getId());
                    const entries = event.damage.splash?.filter((entry) => entry.unitId === target.getId());
                    expect(entries).toHaveLength(2);
                    expect(entries!.every((entry) => entry.amount > 0)).toBe(true);
                });
            }
        }
        for (const aim of [
            { x: 0, y: 0 },
            { x: 0, y: 15 },
            { x: 15, y: 0 },
            { x: 15, y: 15 },
        ]) {
            test(`team ${team}, edge ${aim.x},${aim.y} clips the displayed blast to the board`, () => {
                const f = fixture(team);
                assertAreaMatchesImpact(f, aim, aim);
                expect(f.scene.getAreaThrowCells(point(aim))).toHaveLength(4);
            });
        }
        test(`team ${team}, friendly units and earlier cemetery barrels do not pull the aim`, () => {
            const f = fixture(team, GridVals.BLOCK_CENTER, { x: 3, y: 7 });
            f.grid.setScatteredMountains([
                { x: 5, y: 7 },
                { x: 9, y: 7 },
            ]);
            f.place(f.creature("Peasant", "Life", team), { x: 6, y: 7 });
            const aim = { x: 9, y: 7 };
            assertAreaMatchesImpact(f, aim, aim);
            expect(f.grid.getScatteredMountainsStanding()).toEqual([{ x: 5, y: 7 }]);
        });
        test(`team ${team}, a Normal-map artifact barrel uses the same free landing projection`, () => {
            const f = fixture(team, GridVals.NORMAL, { x: 3, y: 7 });
            expect(f.grid.placeArtifactBarrel(team, 0, { x: 5, y: 7 })).toBe(true);
            expect(f.grid.placeArtifactBarrel(enemy, 0, { x: 9, y: 7 })).toBe(true);
            expect(f.grid.placeArtifactBarrel(enemy, 1, { x: 9, y: 8 })).toBe(true);
            const victim = f.place(f.creature("Berserker", "Might", enemy, 1, 1), { x: 10, y: 8 });
            expect(f.grid.getGridType()).toBe(GridVals.NORMAL);
            expect(f.grid.hasScatteredMountains()).toBe(true);
            const event = assertAreaMatchesImpact(f, { x: 9, y: 7 }, { x: 9, y: 7 });
            expect(event.affectedUnitIds).toContain(victim.getId());
            expect(f.grid.getScatteredMountainsStanding()).toEqual([{ x: 5, y: 7 }]);
            expect(f.grid.getArtifactBarrels()).toEqual([{ team, index: 0, cell: { x: 5, y: 7 } }]);
        });
        for (const [width, height] of [
            [1, 1],
            [1, 2],
            [2, 1],
            [2, 2],
        ]) {
            test(`team ${team}, occupied ${width}x${height} aim defers to the normal unit shot`, () => {
                const f = fixture(team, GridVals.NORMAL, { x: 3, y: 7 });
                const target = f.place(f.creature("Berserker", "Might", enemy, width, height), { x: 10, y: 7 });
                for (const cell of target.getCells()) {
                    expect(f.scene.getAreaThrowCells(point(cell))).toBeUndefined();
                }
                const before = target.getCumulativeHp();
                const shotsBefore = f.attacker.getRangeShots();
                const refused = f.engine.apply({
                    type: "area_throw_attack",
                    attackerId: f.attacker.getId(),
                    targetCell: target.getBaseCell(),
                });
                expect(refused.completed).toBe(false);
                expect(f.attacker.getRangeShots()).toBe(shotsBefore);
                expect(target.getCumulativeHp()).toBe(before);
                const preview = previewUnitShot(f, target);
                expect(preview.drawn).toEqual([preview.evaluation.affectedCells[0]]);
                expect(preview.highlighted).toEqual(preview.evaluation.affectedUnits.flat());
                fireUnitShot(f, target, preview);
                expect(target.getCumulativeHp()).toBeLessThan(before);
            });
        }
        for (const [width, height] of [
            [2, 1],
            [1, 2],
        ]) {
            test(`team ${team}, occupied ${width}x${height} shows the struck footprint cell rather than its base`, () => {
                const f = fixture(team, GridVals.NORMAL, { x: 3, y: 7 });
                const anchor = { x: 10, y: height === 2 ? 8 : 7 };
                const target = f.place(f.creature("Berserker", "Might", enemy, width, height), anchor);
                const rayOnly = f.place(f.creature("Peasant", "Life", enemy), { x: width === 2 ? 8 : 9, y: 6 });
                const baseOnly = f.place(f.creature("Peasant", "Life", enemy), {
                    x: width === 2 ? 11 : 9,
                    y: height === 2 ? 9 : 6,
                });
                const preview = previewUnitShot(f, target);
                expect(preview.drawn).toHaveLength(1);
                expect(preview.drawn[0].at(-1)).toEqual({ x: width === 2 ? 9 : 10, y: 7 });
                expect(preview.drawn[0].at(-1)).not.toEqual(target.getBaseCell());
                expect(preview.highlighted).toContain(rayOnly);
                expect(preview.highlighted).not.toContain(baseOnly);
                fireUnitShot(f, target, preview);
            });
        }
        test(`team ${team}, occupied Wingshield reduces the normal shot's projected area to its impact cell`, () => {
            const f = fixture(team, GridVals.NORMAL, { x: 3, y: 7 });
            const shield = f.place(f.creature("Angel", "Life", enemy), { x: 10, y: 7 });
            const neighbour = f.place(f.creature("Peasant", "Life", enemy), { x: 8, y: 6 });
            const preview = previewUnitShot(f, shield);
            expect(preview.drawn).toEqual([preview.evaluation.affectedCells[0]]);
            expect(preview.drawn[0]).toHaveLength(1);
            expect(preview.highlighted).toEqual([shield]);
            const before = neighbour.getCumulativeHp();
            const result = f.engine.apply({
                type: "range_attack",
                attackerId: f.attacker.getId(),
                targetId: shield.getId(),
                aimCell: preview.aim.cell,
                aimSide: preview.aim.side,
            });
            expect(result.completed).toBe(true);
            expect(neighbour.getCumulativeHp()).toBe(before);
        });
        test(`team ${team}, Through Shot highlights its line without drawing a splash rectangle`, () => {
            const f = fixture(team, GridVals.NORMAL, { x: 3, y: 7 });
            f.attacker.grantAbility("Through Shot");
            const target = f.place(f.creature("Berserker", "Might", enemy, 1, 1), { x: 10, y: 7 });
            const preview = previewUnitShot(f, target);
            expect(preview.drawn).toEqual([]);
            expect(preview.highlighted).toContain(target);
        });
        for (const primaryDies of [false, true]) {
            test(`team ${team}, first-impact projection ${primaryDies ? "stays on the front before the second boulder advances after a kill" : "keeps both boulders on the surviving interceptor"}`, () => {
                const f = fixture(team, GridVals.NORMAL, { x: 3, y: 7 });
                const front = f.place(f.creature("Peasant", "Life", enemy), { x: 7, y: 7 });
                if (primaryDies) front.setAmountAlive(1);
                const rear = f.place(f.creature("Berserker", "Might", enemy, 1, 1), { x: 10, y: 7 });
                const rearHp = rear.getCumulativeHp();
                const preview = previewUnitShot(f, rear);
                expect(preview.evaluation.affectedUnits.map((group) => group.map((unit) => unit.getId()))).toEqual([
                    [front.getId()],
                    [rear.getId()],
                ]);
                const result = f.engine.apply({
                    type: "range_attack",
                    attackerId: f.attacker.getId(),
                    targetId: rear.getId(),
                    aimCell: preview.aim.cell,
                    aimSide: preview.aim.side,
                });
                expect(result.completed).toBe(true);
                const event = result.events.find((event) => event.type === "unit_attacked");
                expect(event).toBeDefined();
                expect(front.isDead()).toBe(primaryDies);
                expect(event!.damage.splash?.map((entry) => entry.unitId)).toEqual(
                    primaryDies ? [front.getId(), rear.getId()] : [front.getId(), front.getId()],
                );
                if (primaryDies) expect(rear.getCumulativeHp()).toBeLessThan(rearHp);
                else expect(rear.getCumulativeHp()).toBe(rearHp);
                expect(preview.drawn).toEqual([preview.evaluation.affectedCells[0]]);
                expect(preview.highlighted.map((unit) => unit.getId())).toEqual([front.getId()]);
            });
        }
        test(`team ${team}, Wingshield intercepts the throw and protects its neighbours`, () => {
            const f = fixture(team, GridVals.NORMAL, { x: 3, y: 7 });
            const shield = f.place(f.creature("Angel", "Life", enemy), { x: 8, y: 7 });
            f.place(f.creature("Berserker", "Might", enemy, 1, 1), { x: 9, y: 7 });
            const event = assertAreaMatchesImpact(f, { x: 12, y: 7 }, shield.getBaseCell());
            expect(event.affectedUnitIds).toEqual([shield.getId()]);
        });
        test(`team ${team}, solid mountain cells use obstacle targeting`, () => {
            const f = fixture(team, GridVals.BLOCK_CENTER, { x: 3, y: 7 });
            const mountain = f.grid.getCenterCells()[0];
            expect(mountain).toBeDefined();
            expect(f.scene.getAreaThrowCells(point(mountain))).toBeUndefined();
            expect(f.scene.getAreaThrowCells(point({ x: 16, y: 7 }))).toBeUndefined();
        });
    }
});
