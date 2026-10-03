import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import {
    FightProperties,
    FightStateManager,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    TeamVals,
    type GameEvent,
    type HoCMath,
    type TeamType,
} from "@heroesofcrypto/common";

import type { SandboxReplayActionRecord } from "../replay/sandbox_replay";
import type { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { TerrainCellSnapshotCache } from "./sandbox/TerrainCellSnapshotCache";

type XY = HoCMath.XY;
type MoveEvent = Extract<GameEvent, { type: "unit_moved" }>;
type SummonEvent = Extract<GameEvent, { type: "unit_summoned" }>;
const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

let previousFight: FightProperties;
let fight: FightProperties;
beforeEach(() => {
    previousFight = FightStateManager.getInstance().getFightProperties();
    fight = new FightProperties();
    FightStateManager.getInstance().setFightProperties(fight);
});
afterEach(() => FightStateManager.getInstance().setFightProperties(previousFight));

const unitAt = (id: string, anchor: XY, width = 1, height = 1, team: TeamType = TeamVals.LEFT, flying = false) => {
    let position = GridMath.getPositionForFootprintAnchor(gs, anchor, width, height);
    return {
        getId: () => id,
        getName: () => id,
        getTeam: () => team,
        getAttackRange: () => 1,
        getFootprintWidth: () => width,
        getFootprintHeight: () => height,
        isSmallSize: () => width === 1 && height === 1,
        canFly: () => flying,
        getCells: () => GridMath.getFootprintCellsForPosition(gs, position, width, height),
        getPosition: () => position,
        setPosition: (x: number, y: number) => {
            position = { x, y };
        },
        syncVisual: () => {},
        getSpellsCount: () => 0,
        ensureVisual: () => undefined,
        faceBoardTarget: () => {},
        hasAnimationState: () => false,
        getVisualCenter: () => position,
    };
};
type UnitStub = ReturnType<typeof unitAt>;
const rendered = (unit: UnitStub): RenderableUnit => unit as unknown as RenderableUnit;

type Scene = {
    grid: Grid;
    syncMovedUnitGridOccupancy(unit: RenderableUnit, move: MoveEvent): void;
    syncSystemMovedUnit(id: string, position: XY, snapshot: ReadonlyMap<string, RenderableUnit>): void;
    syncSummonedUnit(event: SummonEvent): void;
    playRecordedMoveAnimation(unit: RenderableUnit, move: MoveEvent, rapidCharge: boolean): Promise<boolean>;
    playReplayCastSpellAction(record: SandboxReplayActionRecord): Promise<boolean>;
    applyTurnEngineEvents(events: GameEvent[], snapshot: ReadonlyMap<string, RenderableUnit>): void;
};
const sceneFor = (units: readonly UnitStub[]) => {
    const grid = new Grid(gs, GridVals.NORMAL);
    const byId = new Map(units.map((unit) => [unit.getId(), rendered(unit)]));
    for (const unit of units) {
        expect(grid.occupyCells(unit.getCells(), unit.getId(), unit.getTeam(), 1, true, true)).toBe(true);
    }
    let complete!: () => void;
    let cancel!: () => void;
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        grid,
        unitsHolder: { getAllUnits: () => byId },
        sc_sceneSettings: { getGridSettings: () => gs },
        drawer: { getUnitsContainer: () => undefined },
        layoutVersion: 0,
        replayPlaybackActive: true,
        isSceneDestroyed: () => false,
        shouldShowMoveDestinationSilhouette: () => false,
        hoverManager: { setSilhouetteLocked: () => {}, clearHoverSilhouette: () => {} },
        refreshUnits: () => {},
        refreshVisibleStateIfNeeded: () => {},
        updateLiveFightStats: () => {},
        flushPendingReplayRecords: () => {},
        snapshotRenderableUnits: () => byId,
        playUnitCombatSound: () => {},
        delayReplay: () => Promise.resolve(),
        applyReplayEvents: () => {},
        moveAnimManager: {
            startMoveAnimation: (
                unit: RenderableUnit,
                points: XY[],
                _speed: number,
                _destination: XY,
                _track: XY[] | undefined,
                onComplete: () => void,
                _rapidCharge: boolean,
                onCancel: () => void,
            ) => {
                complete = () => {
                    const destination = points[points.length - 1];
                    unit.setPosition(destination.x, destination.y);
                    onComplete();
                };
                cancel = onCancel;
            },
            startSwapAnimation: (
                _caster: RenderableUnit,
                _casterFrom: XY,
                _casterTo: XY,
                _target: RenderableUnit,
                _targetFrom: XY,
                _targetTo: XY,
                onComplete: () => void,
                onCancel: () => void,
            ) => {
                complete = onComplete;
                cancel = onCancel;
            },
        },
    }) as Scene;
    return { scene, grid, byId, complete: () => complete(), cancel: () => cancel() };
};

const moveTo = (unit: UnitStub, anchor: XY, path: XY[] = []): MoveEvent => ({
    type: "unit_moved",
    unitId: unit.getId(),
    from: { ...unit.getPosition() },
    to: GridMath.getPositionForFootprintAnchor(gs, anchor, unit.getFootprintWidth(), unit.getFootprintHeight()),
    path,
    targetCells: GridMath.getFootprintCellsForAnchor(anchor, unit.getFootprintWidth(), unit.getFootprintHeight()),
});
const summon = (unit: UnitStub, anchor: XY, cells?: XY[]): SummonEvent => {
    const move = moveTo(unit, anchor);
    return {
        type: "unit_summoned",
        casterId: "caster",
        unitId: unit.getId(),
        team: unit.getTeam(),
        unitName: unit.getName(),
        amount: 1,
        position: move.to,
        cells: cells ?? move.targetCells,
        merged: false,
    };
};
const smokeCells = (cells: readonly XY[]) => {
    for (const cell of cells) fight.getSmokeClouds().add(cell, 2);
};

describe("smoke at recorded arrivals", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT] as const) {
        for (const [width, height] of [
            [1, 1],
            [1, 2],
            [2, 1],
            [2, 2],
        ]) {
            for (const flying of [false, true]) {
                for (const rapidCharge of [false, true]) {
                    test(`${team}, ${width}x${height}, flying ${flying}, approach ${rapidCharge}: clears only on arrival`, async () => {
                        const start = { x: team === TeamVals.LEFT ? 3 : 12, y: 5 };
                        const destination = { x: team === TeamVals.LEFT ? 6 : 9, y: 8 };
                        const unit = unitAt("mover", start, width, height, team, flying);
                        const s = sceneFor([unit]);
                        const transit = { x: 7, y: 6 };
                        const move = moveTo(unit, destination, [start, transit, destination]);
                        const neighbor = { x: destination.x + 1, y: destination.y };
                        smokeCells([...move.targetCells, transit, neighbor]);
                        const smoke = fight.getSmokeClouds();
                        const cache = new TerrainCellSnapshotCache<ReturnType<typeof smoke.toJSON>[number]>();
                        const before = cache.get(smoke);
                        fight.getVines().add(destination, 2, TeamVals.RIGHT);
                        fight.getFireWalls().add(destination, 2);

                        const pending = s.scene.playRecordedMoveAnimation(rendered(unit), move, rapidCharge);
                        expect(cache.get(smoke)).toBe(before);
                        expect(move.targetCells.every((cell) => smoke.has(cell))).toBe(true);
                        s.complete();
                        expect(await pending).toBe(true);

                        expect(move.targetCells.every((cell) => !smoke.has(cell))).toBe(true);
                        expect(smoke.has(transit)).toBe(true);
                        expect(smoke.has(neighbor)).toBe(true);
                        expect(cache.get(smoke)).not.toBe(before);
                        expect(s.grid.getRegisteredCells(unit.getId())).toEqual(move.targetCells);
                        expect(fight.getVines().has(destination)).toBe(true);
                        expect(fight.getFireWalls().has(destination)).toBe(true);
                    });
                }
            }
        }
    }

    test("cancelling an animation leaves destination smoke intact", async () => {
        const unit = unitAt("mover", { x: 3, y: 3 }, 1, 2, TeamVals.RIGHT, true);
        const s = sceneFor([unit]);
        const move = moveTo(unit, { x: 6, y: 6 });
        smokeCells(move.targetCells);
        const revision = fight.getSmokeClouds().getRevision();
        const pending = s.scene.playRecordedMoveAnimation(rendered(unit), move, true);
        s.cancel();
        expect(await pending).toBe(false);
        expect(fight.getSmokeClouds().getRevision()).toBe(revision);
        expect(move.targetCells.every((cell) => fight.getSmokeClouds().has(cell))).toBe(true);
    });

    test("an untimed arrival with no targetCells clears the unit's final footprint", async () => {
        const unit = unitAt("mover", { x: 6, y: 6 }, 2, 1);
        const s = sceneFor([unit]);
        const move = moveTo(unit, { x: 6, y: 6 });
        smokeCells(move.targetCells);
        move.targetCells = [];
        expect(await s.scene.playRecordedMoveAnimation(rendered(unit), move, false)).toBe(true);
        expect(fight.getSmokeClouds().size()).toBe(0);
    });

    test("a refused destination does not dispel cells the mover failed to occupy", () => {
        const unit = unitAt("mover", { x: 3, y: 3 }, 2, 2);
        const blocker = unitAt("blocker", { x: 6, y: 6 });
        const s = sceneFor([unit, blocker]);
        const move = moveTo(unit, { x: 6, y: 6 });
        smokeCells(move.targetCells);
        const revision = fight.getSmokeClouds().getRevision();
        unit.setPosition(move.to.x, move.to.y);
        s.scene.syncMovedUnitGridOccupancy(rendered(unit), move);
        expect(s.grid.getRegisteredCells(unit.getId())).toEqual([]);
        expect(fight.getSmokeClouds().getRevision()).toBe(revision);
    });
});

describe("other replay arrivals", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT] as const) {
        for (const [width, height] of [
            [1, 1],
            [1, 2],
            [2, 1],
            [2, 2],
        ]) {
            test(`system move ${team}, ${width}x${height} clears the final body`, () => {
                const unit = unitAt("mover", { x: 3, y: 3 }, width, height, team);
                const s = sceneFor([unit]);
                const move = moveTo(unit, { x: 6, y: 6 });
                smokeCells(move.targetCells);
                s.scene.syncSystemMovedUnit(unit.getId(), move.to, s.byId);
                expect(fight.getSmokeClouds().size()).toBe(0);
                expect(s.grid.getRegisteredCells(unit.getId())).toEqual(unit.getCells());
            });

            test(`summon ${team}, ${width}x${height} clears its accepted footprint`, () => {
                const unit = unitAt("summon", { x: 3, y: 3 }, width, height, team);
                const s = sceneFor([unit]);
                const event = summon(unit, { x: 6, y: 6 });
                smokeCells(event.cells);
                s.scene.syncSummonedUnit(event);
                expect(fight.getSmokeClouds().size()).toBe(0);
                expect(s.grid.getRegisteredCells(unit.getId())).toEqual(event.cells);
            });
        }
    }

    test("a refused system move keeps destination smoke", () => {
        const unit = unitAt("mover", { x: 3, y: 3 });
        const blocker = unitAt("blocker", { x: 6, y: 6 });
        const s = sceneFor([unit, blocker]);
        const move = moveTo(unit, { x: 6, y: 6 });
        smokeCells(move.targetCells);
        s.scene.syncSystemMovedUnit(unit.getId(), move.to, s.byId);
        expect(fight.getSmokeClouds().has(move.targetCells[0])).toBe(true);
        expect(s.grid.getRegisteredCells(unit.getId())).toEqual([]);
    });

    test("summon fallback clears its own accepted body, leaving refused event cells untouched", () => {
        const unit = unitAt("summon", { x: 3, y: 3 }, 1, 2);
        const s = sceneFor([unit]);
        const refused = [{ x: -1, y: 6 }];
        const event = summon(unit, { x: 6, y: 6 }, refused);
        const own = moveTo(unit, { x: 6, y: 6 }).targetCells;
        smokeCells([...refused, ...own]);
        s.scene.syncSummonedUnit(event);
        expect(s.grid.getRegisteredCells(unit.getId())).toEqual(own);
        expect(own.every((cell) => !fight.getSmokeClouds().has(cell))).toBe(true);
        expect(fight.getSmokeClouds().has(refused[0])).toBe(true);
    });

    test("a fully refused summon keeps smoke and reports its occupancy failure", () => {
        const unit = unitAt("summon", { x: 3, y: 3 }, 1, 2);
        const blocker = unitAt("blocker", { x: 6, y: 6 });
        const s = sceneFor([unit, blocker]);
        const event = summon(unit, { x: 6, y: 6 });
        smokeCells(event.cells);
        const report = spyOn(console, "error").mockImplementation(() => {});
        try {
            s.scene.syncSummonedUnit(event);
            expect(s.grid.getRegisteredCells(unit.getId())).toEqual([]);
            expect(event.cells.every((cell) => fight.getSmokeClouds().has(cell))).toBe(true);
            expect(report).toHaveBeenCalledTimes(1);
        } finally {
            report.mockRestore();
        }
    });

    test("a merged summon uses its existing registered body when the event omits cells", () => {
        const unit = unitAt("summon", { x: 6, y: 6 }, 2, 1);
        const s = sceneFor([unit]);
        smokeCells(unit.getCells());
        const event = { ...summon(unit, { x: 6, y: 6 }, []), merged: true };
        s.scene.syncSummonedUnit(event);
        expect(fight.getSmokeClouds().size()).toBe(0);
    });

    test("Castling clears both rectangular arrivals after the swap completes", async () => {
        const caster = unitAt("caster", { x: 3, y: 3 }, 1, 2, TeamVals.LEFT);
        const target = unitAt("target", { x: 10, y: 10 }, 2, 1, TeamVals.RIGHT);
        const s = sceneFor([caster, target]);
        const casterAfter = moveTo(caster, { x: 10, y: 10 });
        const targetAfter = moveTo(target, { x: 3, y: 3 });
        const newlyOccupied = [...casterAfter.targetCells, ...targetAfter.targetCells].filter(
            (cell) => !s.grid.getOccupantUnitId(cell),
        );
        smokeCells(newlyOccupied);
        const record = {
            action: { type: "cast_spell", casterId: caster.getId(), targetId: target.getId(), spellName: "Castling" },
            events: [],
            stateAfter: {
                units: [
                    { properties: { id: caster.getId() }, baseCell: { x: 10, y: 10 }, cells: casterAfter.targetCells },
                    { properties: { id: target.getId() }, baseCell: { x: 3, y: 3 }, cells: targetAfter.targetCells },
                ],
            },
        } as unknown as SandboxReplayActionRecord;
        const pending = s.scene.playReplayCastSpellAction(record);
        expect(fight.getSmokeClouds().size()).toBe(2);
        s.complete();
        expect(await pending).toBe(true);
        expect(fight.getSmokeClouds().size()).toBe(0);
        expect(s.grid.getRegisteredCells(caster.getId())).toEqual(casterAfter.targetCells);
        expect(s.grid.getRegisteredCells(target.getId())).toEqual(targetAfter.targetCells);
    });

    test("a cancelled Castling leaves newly covered smoke untouched", async () => {
        const caster = unitAt("caster", { x: 3, y: 3 }, 1, 2);
        const target = unitAt("target", { x: 10, y: 10 }, 2, 1);
        const s = sceneFor([caster, target]);
        const casterAfter = moveTo(caster, { x: 10, y: 10 });
        const targetAfter = moveTo(target, { x: 3, y: 3 });
        const newlyOccupied = [...casterAfter.targetCells, ...targetAfter.targetCells].filter(
            (cell) => !s.grid.getOccupantUnitId(cell),
        );
        smokeCells(newlyOccupied);
        const record = {
            action: { type: "cast_spell", casterId: caster.getId(), targetId: target.getId(), spellName: "Castling" },
            events: [],
            stateAfter: {
                units: [
                    {
                        properties: { id: caster.getId() },
                        baseCell: { x: 10, y: 10 },
                        cells: casterAfter.targetCells,
                    },
                    { properties: { id: target.getId() }, baseCell: { x: 3, y: 3 }, cells: targetAfter.targetCells },
                ],
            },
        } as unknown as SandboxReplayActionRecord;
        const revision = fight.getSmokeClouds().getRevision();
        const pending = s.scene.playReplayCastSpellAction(record);
        s.cancel();
        expect(await pending).toBe(false);
        expect(fight.getSmokeClouds().getRevision()).toBe(revision);
        expect(newlyOccupied.every((cell) => fight.getSmokeClouds().has(cell))).toBe(true);
    });
});

describe("recorded smoke removals", () => {
    test("dispel and expiry remove only recorded cells and are idempotent", () => {
        const s = sceneFor([]);
        const dispelled = { x: 5, y: 5 };
        const expired = { x: 6, y: 5 };
        const remains = { x: 7, y: 5 };
        smokeCells([dispelled, expired, remains]);
        const events: GameEvent[] = [
            { type: "smoke_dispel", cells: [dispelled, dispelled] },
            { type: "smoke_expired", cells: [expired, { x: 8, y: 5 }] },
        ];
        s.scene.applyTurnEngineEvents(events, s.byId);
        expect(fight.getSmokeClouds().toJSON()).toEqual([{ ...remains, l: 2 }]);
        const revision = fight.getSmokeClouds().getRevision();
        s.scene.applyTurnEngineEvents(events, s.byId);
        expect(fight.getSmokeClouds().getRevision()).toBe(revision);
    });

    test("replaying placement does not restore a cloud or refresh its already-resolved lap budget", () => {
        const s = sceneFor([]);
        const present = { x: 5, y: 5 };
        const cleared = { x: 6, y: 5 };
        fight.getSmokeClouds().add(present, 1);
        const revision = fight.getSmokeClouds().getRevision();
        s.scene.applyTurnEngineEvents(
            [{ type: "smoke_placed", casterId: "caster", cells: [present, cleared], lapsRemaining: 4 }],
            s.byId,
        );
        expect(fight.getSmokeClouds().toJSON()).toEqual([{ ...present, l: 1 }]);
        expect(fight.getSmokeClouds().getRevision()).toBe(revision);
    });
});
