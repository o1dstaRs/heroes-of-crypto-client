import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    AbilityFactory,
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
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type GameEvent,
    type HoCMath,
    type IDamageStatistic,
    type IRangeAttackEvaluation,
    type TeamType,
} from "@heroesofcrypto/common";
import { Container } from "pixi.js";

import { releaseBoardMirror, setBoardMirror } from "../pixi/boardMirror";
import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { optimalRangeTargetEdge, rangeAimOptions } from "./rangeTargetEdges";
import type { RangeTargetEdgeVisual } from "./HoverManager";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

type XY = HoCMath.XY;
type RangeEvent = Extract<GameEvent, { type: "unit_attacked" }>;
interface Scene {
    sc_mouseWorld: XY;
    getLogicalBattlefieldPoint(point: XY): XY;
    resolveRangeAimForTarget(attacker: RenderableUnit, target: Unit): GridMath.IClosestSideCenter | undefined;
    resolveRangeShotAim(attacker: RenderableUnit, target: Unit, from: XY): GridMath.IClosestSideCenter | undefined;
    resolveFirstRangeHitUnit(target: Unit): Unit | undefined;
    rangeTargetEdgeVisuals(attacker: RenderableUnit, target: Unit): RangeTargetEdgeVisual[];
    highlightRangeAttackUnits(target: Unit, evaluation?: IRangeAttackEvaluation): boolean;
}
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
const roots: Container[] = [];
beforeEach(() => {
    FightStateManager.getInstance().reset();
    HoCLib.setDeterministicRandomSource(() => 0.99);
});
afterEach(() => {
    HoCLib.setDeterministicRandomSource(undefined);
    FightStateManager.getInstance().setFightProperties(previousFight);
    for (const root of roots.splice(0)) {
        releaseBoardMirror(root);
        root.destroy();
    }
});

const rotateCell = (cell: XY, turns: number): XY => {
    let rotated = { ...cell };
    for (let i = 0; i < turns; i++) rotated = { x: 15 - rotated.y, y: rotated.x };
    return rotated;
};
const rotatedFootprint = (anchor: XY, width: number, height: number, turns: number) => {
    const cells = GridMath.getFootprintCellsForAnchor(anchor, width, height).map((cell) => rotateCell(cell, turns));
    return {
        anchor: { x: Math.max(...cells.map((cell) => cell.x)), y: Math.max(...cells.map((cell) => cell.y)) },
        width: turns % 2 ? height : width,
        height: turns % 2 ? width : height,
    };
};

function fixture(team: TeamType, width: number, height: number, turns = 0, mirrored = false, diagonal = false) {
    const grid = new Grid(settings, GridVals.NORMAL);
    const holder = new UnitsHolder(grid);
    const effects = new EffectFactory();
    const factory = new AbilityFactory(effects);
    const sceneLog = { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false };
    const statistics = {
        add: (_entry: IDamageStatistic) => {},
        get: (): IDamageStatistic[] => [],
        has: () => false,
        clear: () => {},
    };
    const handler = new AttackHandler(settings, grid, sceneLog, statistics);
    const enemy = team === TeamVals.LEFT ? TeamVals.RIGHT : TeamVals.LEFT;
    const create = (name: string, unitTeam: TeamType, anchor: XY, w = 1, h = 1) => {
        const body = rotatedFootprint(anchor, w, h, turns);
        const properties = HoCConfig.getCreatureConfig(
            unitTeam,
            "Might",
            name,
            `${name.toLowerCase()}_512`,
            name === "Cyclops" ? 1 : 100,
        );
        const unit = RenderableUnit.fromBase(
            Unit.createUnit(
                { ...properties, footprint_width: body.width, footprint_height: body.height },
                settings,
                unitTeam,
                UnitVals.CREATURE,
                factory,
                effects,
                false,
            ),
            undefined as never,
        );
        const position = GridMath.getPositionForFootprintAnchor(settings, body.anchor, body.width, body.height);
        unit.setPosition(position.x, position.y);
        expect(grid.occupyCells(unit.getCells(), unit.getId(), unitTeam, unit.getAttackRange(), false, false)).toBe(
            true,
        );
        holder.addUnit(unit);
        return unit;
    };
    const attacker = create("Cyclops", team, { x: diagonal ? 3 : 2, y: diagonal ? 2 : 5 });
    const front = create(
        "Berserker",
        enemy,
        diagonal ? { x: width === 1 ? 7 : 8, y: 4 } : { x: width === 1 ? 6 : 7, y: 5 },
        width,
        height,
    );
    const rear = create("Berserker", enemy, { x: 10, y: 6 }, 2, 2);
    attacker.refreshPossibleAttackTypes(true);
    const highlighted: Unit[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        grid,
        unitsHolder: holder,
        attackHandler: handler,
        currentActiveUnit: attacker,
        sc_sceneSettings: { getGridSettings: () => settings },
        sc_mouseWorld: rear.getPosition(),
        hoverManager: {
            drawAOEArea: () => {},
            addTargetHighlight: (unit: Unit) => highlighted.push(unit),
        },
    }) as Scene;
    const root = new Container();
    root.scale.set(mirrored ? -1 : 1, -1);
    setBoardMirror(root, mirrored);
    roots.push(root);
    const cursor = (cell: XY) => {
        const expected = point(rotateCell(cell, turns));
        const screen = root.toGlobal(projectBattlefieldPoint(expected, settings));
        const projectedWorld = root.toLocal(screen);
        scene.sc_mouseWorld = scene.getLogicalBattlefieldPoint(projectedWorld);
        expect(scene.sc_mouseWorld.x).toBeCloseTo(expected.x, 6);
        expect(scene.sc_mouseWorld.y).toBeCloseTo(expected.y, 6);
    };
    const evaluate = (aim: GridMath.IClosestSideCenter) =>
        handler.evaluateRangeAttack(
            holder.getAllUnits(),
            attacker,
            attacker.getPosition(),
            aim.position,
            false,
            false,
            true,
        );
    const fight = FightStateManager.getInstance().getFightProperties();
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
    const fire = (aim: GridMath.IClosestSideCenter): RangeEvent => {
        const result = engine.apply({
            type: "range_attack",
            attackerId: attacker.getId(),
            targetId: rear.getId(),
            aimCell: aim.cell,
            aimSide: aim.side,
        });
        expect(result.completed).toBe(true);
        const event = result.events.find((event): event is RangeEvent => event.type === "unit_attacked");
        expect(event).toBeDefined();
        return event!;
    };
    return { scene, attacker, front, rear, highlighted, cursor, evaluate, fire };
}

describe("Cyclops hover outlines follow the arrow and authoritative shot", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        for (const [width, height] of [
            [1, 2],
            [2, 1],
        ]) {
            for (const turns of [0, 1, 2, 3]) {
                for (const mirrored of [false, true]) {
                    for (const diagonal of [false, true]) {
                        test(`team ${team}, ${width}x${height} interceptor, rotation ${turns}, diagonal ${diagonal}, mirrored ${mirrored}`, () => {
                            const f = fixture(team, width, height, turns, mirrored, diagonal);
                            const shotAim = f.scene.resolveRangeShotAim(f.attacker, f.rear, f.attacker.getPosition());
                            expect(shotAim).toBeDefined();
                            const edges = f.scene.rangeTargetEdgeVisuals(f.attacker, f.rear);
                            const arrow = optimalRangeTargetEdge(
                                edges,
                                f.attacker.getPosition(),
                                rangeAimOptions(false),
                            );
                            expect(arrow?.aimPosition).toEqual(shotAim!.position);
                            const evaluation = f.evaluate(shotAim!);
                            expect(evaluation.affectedUnits[0][0].getId()).toBe(f.front.getId());
                            const predictions: string[][] = [];
                            for (const cell of [
                                { x: 9, y: 5 },
                                { x: 9, y: 6 },
                                { x: 10, y: 6 },
                                { x: 9, y: 5 },
                            ]) {
                                f.cursor(cell);
                                expect(
                                    f.scene.resolveRangeShotAim(f.attacker, f.rear, f.attacker.getPosition()),
                                ).toEqual(shotAim);
                                f.highlighted.length = 0;
                                expect(f.scene.highlightRangeAttackUnits(f.rear)).toBe(true);
                                predictions.push(f.highlighted.map((unit) => unit.getId()));
                            }
                            const rearHp = f.rear.getCumulativeHp();
                            const event = f.fire(shotAim!);
                            expect(event.damage.splash?.map((entry) => entry.unitId)).toEqual([f.front.getId()]);
                            expect(f.rear.getCumulativeHp()).toBe(rearHp);
                            for (const predicted of predictions) expect(predicted).toContain(f.front.getId());
                            for (const predicted of predictions) expect(predicted).toEqual([f.front.getId()]);
                            expect(f.scene.resolveFirstRangeHitUnit(f.rear)).toBe(f.front);
                        });
                    }
                }
            }
        }
        test(`team ${team}, the supplied resolved ray drives the highlight instead of recomputing another aim`, () => {
            const f = fixture(team, 1, 2);
            f.cursor({ x: 9, y: 5 });
            const edge = f.scene
                .rangeTargetEdgeVisuals(f.attacker, f.rear)
                .find(
                    (candidate) =>
                        f
                            .evaluate({ cell: candidate.cell, side: candidate.side, position: candidate.aimPosition })
                            .affectedUnits[0][0].getId() === f.rear.getId(),
                );
            expect(edge).toBeDefined();
            const aim = { cell: edge!.cell, side: edge!.side, position: edge!.aimPosition };
            const evaluation = f.evaluate(aim);
            expect(f.scene.highlightRangeAttackUnits(f.rear, evaluation)).toBe(true);
            const event = f.fire(aim);
            const actualIds = [...new Set(event.damage.splash?.map((entry) => entry.unitId))].sort();
            expect(f.highlighted.map((unit) => unit.getId()).sort()).toEqual(actualIds);
        });
        test(`team ${team}, the old cursor edge can bypass an interceptor reached by the actual optimal shot`, () => {
            const f = fixture(team, 1, 2);
            f.cursor({ x: 9, y: 6 });
            const cursorAim = f.scene.resolveRangeAimForTarget(f.attacker, f.rear);
            const shotAim = f.scene.resolveRangeShotAim(f.attacker, f.rear, f.attacker.getPosition());
            expect(cursorAim).toBeDefined();
            expect(shotAim).toBeDefined();
            expect(cursorAim!.cell).toEqual({ x: 9, y: 6 });
            expect(shotAim!.cell).toEqual({ x: 9, y: 5 });
            expect(f.evaluate(cursorAim!).affectedUnits[0][0].getId()).toBe(f.rear.getId());
            expect(f.evaluate(shotAim!).affectedUnits[0][0].getId()).toBe(f.front.getId());
            expect(f.scene.highlightRangeAttackUnits(f.rear)).toBe(true);
            expect(f.highlighted.map((unit) => unit.getId())).toEqual([f.front.getId()]);
            expect(f.fire(shotAim!).damage.splash?.map((entry) => entry.unitId)).toEqual([f.front.getId()]);
        });
    }
});
