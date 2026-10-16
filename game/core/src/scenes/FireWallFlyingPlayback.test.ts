import { describe, expect, test } from "bun:test";

import { GridConstants, GridMath, GridSettings, type GameEvent, type HoCMath } from "@heroesofcrypto/common";

import type { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";

type MoveEvent = Extract<GameEvent, { type: "unit_moved" }>;
type BurnEvent = Extract<GameEvent, { type: "fire_wall_burned" }>;

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

function setup(flying: boolean, direction: HoCMath.XY, hasBurn = true) {
    const path = [
        { x: 7, y: 7 },
        { x: 7 + direction.x, y: 7 + direction.y },
    ];
    const worldPath = path.map((cell) =>
        GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep()),
    );
    const move: MoveEvent = {
        type: "unit_moved",
        unitId: "mover",
        from: worldPath[0],
        to: worldPath[1],
        path,
        targetCells: [path[1]],
    };
    const burn: BurnEvent = {
        type: "fire_wall_burned",
        unitId: "mover",
        cells: [path[1]],
        position: move.to,
        amount: 25,
        unitsDied: 0,
    };
    const unit = {
        canFly: () => flying,
        isSmallSize: () => true,
        getFootprintWidth: () => 1,
        getFootprintHeight: () => 1,
        getId: () => "mover",
        getPosition: () => move.from,
        setPosition: () => {},
        syncVisual: () => {},
    } as unknown as RenderableUnit;
    const effects: HoCMath.XY[][] = [];
    let complete!: () => void;
    let cancel!: () => void;
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        isSceneDestroyed: () => false,
        sc_sceneSettings: { getGridSettings: () => gs },
        grid: { getMatrix: () => [], getMatrixNoUnits: () => [] },
        drawer: { getUnitsContainer: () => undefined },
        createRecordedMoveWorldPath: () => worldPath,
        shouldShowMoveDestinationSilhouette: () => false,
        shouldUseRecordedMoveTrack: () => true,
        syncMovedUnitGridOccupancy: () => {},
        shouldDeferActionToAuthoritativeReplay: () => false,
        createActionEngine: () => ({ apply: () => ({ completed: true, events: hasBurn ? [move, burn] : [move] }) }),
        clearCommittedBoardActionPreview: () => {},
        finishMovedUnitTurn: () => {},
        flushPendingReplayRecords: () => {},
        hoverManager: { setSilhouetteLocked: () => {}, clearHoverSilhouette: () => {} },
        moveAnimManager: {
            startMoveAnimation: (
                _unit: RenderableUnit,
                _path: HoCMath.XY[],
                _speed: number,
                _destination: HoCMath.XY,
                _track: HoCMath.XY[] | undefined,
                onComplete: () => void,
                _rapidCharge: boolean,
                onCancel: () => void,
            ) => {
                complete = onComplete;
                cancel = onCancel;
            },
        },
        playFireWallCrossingVfx: (_unit: RenderableUnit, points: HoCMath.XY[]) => effects.push([...points]),
    }) as {
        playRecordedMoveAnimation(
            unit: RenderableUnit,
            move: MoveEvent,
            rapidCharge: boolean,
            burn?: BurnEvent,
        ): Promise<boolean>;
        executeMoveSequence(unit: RenderableUnit, path: HoCMath.XY[]): boolean;
        createRecordedMoveWorldPath(): HoCMath.XY[];
    };
    return { scene, unit, move, burn, worldPath, effects, complete: () => complete(), cancel: () => cancel() };
}

describe("Fire Wall flying playback", () => {
    for (const direction of [
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: -1, y: 1 },
        { x: -1, y: 0 },
        { x: -1, y: -1 },
        { x: 0, y: -1 },
        { x: 1, y: -1 },
    ]) {
        for (const rapidCharge of [false, true]) {
            test(`recorded flight ${direction.x},${direction.y}, charge ${rapidCharge}: burn waits for landing`, async () => {
                const s = setup(true, direction);
                const pending = s.scene.playRecordedMoveAnimation(s.unit, s.move, rapidCharge, s.burn);
                expect(s.effects).toEqual([]);
                s.complete();
                expect(await pending).toBe(true);
                expect(s.effects).toEqual([[s.move.to]]);
            });
        }

        test(`live flight ${direction.x},${direction.y}: burn waits for landing`, () => {
            const s = setup(true, direction);
            expect(s.scene.executeMoveSequence(s.unit, s.move.path)).toBe(true);
            expect(s.effects).toEqual([]);
            s.complete();
            expect(s.effects).toEqual([[s.move.to]]);
        });
    }

    test("a cancelled flight never plays landing flames", async () => {
        const s = setup(true, { x: 1, y: 0 });
        const pending = s.scene.playRecordedMoveAnimation(s.unit, s.move, false, s.burn);
        s.cancel();
        expect(await pending).toBe(false);
        expect(s.effects).toEqual([]);
    });

    test("an untimed arrival still shows its burn", async () => {
        const s = setup(true, { x: 1, y: 0 });
        s.scene.createRecordedMoveWorldPath = () => [s.move.to];
        expect(await s.scene.playRecordedMoveAnimation(s.unit, s.move, false, s.burn)).toBe(true);
        expect(s.effects).toEqual([[s.move.to]]);
    });

    test("a flight over fire without a burn event produces no flames before or after landing", async () => {
        const s = setup(true, { x: 1, y: 0 }, false);
        const pending = s.scene.playRecordedMoveAnimation(s.unit, s.move, false);
        expect(s.effects).toEqual([]);
        s.complete();
        expect(await pending).toBe(true);
        expect(s.effects).toEqual([]);
    });

    test("walkers still schedule their crossing effects from the full route", async () => {
        const s = setup(false, { x: 1, y: 0 });
        const pending = s.scene.playRecordedMoveAnimation(s.unit, s.move, false, s.burn);
        expect(s.effects).toEqual([s.worldPath]);
        s.complete();
        expect(await pending).toBe(true);
        expect(s.effects).toEqual([s.worldPath]);
    });
});
