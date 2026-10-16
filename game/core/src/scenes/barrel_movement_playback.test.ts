import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    FightStateManager,
    Grid,
    GridMath,
    GridSettings,
    GridVals,
    TeamVals,
    type GameEvent,
    type HoCMath,
} from "@heroesofcrypto/common";
import type { SandboxReplayActionRecord } from "../replay/sandbox_replay";
import type { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { RankedPlayScene } from "./RankedPlayScene";

type XY = HoCMath.XY;
type Move = Extract<GameEvent, { type: "unit_moved" }>;
const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
const originalFight = FightStateManager.getInstance().getFightProperties();
beforeEach(() => FightStateManager.getInstance().reset());
afterEach(() => FightStateManager.getInstance().setFightProperties(originalFight));
const barrel = { x: 3, y: 3 };
const start = { x: 5, y: 3 };
const destination = { x: 2, y: 3 };
const acceptedPath = [start, { x: 5, y: 4 }, { x: 4, y: 5 }, { x: 3, y: 5 }, { x: 2, y: 4 }, destination];
const requestedPath = [start, { x: 4, y: 3 }, barrel, destination];

function fixture(width: number, height: number, ranked = false) {
    let position = GridMath.getPositionForFootprintAnchor(settings, start, width, height);
    const unit = {
        getId: () => "walker",
        getName: () => "Walker",
        getTeam: () => TeamVals.RIGHT,
        getAttackRange: () => 1,
        isSmallSize: () => width === 1 && height === 1,
        getFootprintWidth: () => width,
        getFootprintHeight: () => height,
        getCells: () => GridMath.getFootprintCellsForPosition(settings, position, width, height),
        getPosition: () => position,
        setPosition: (x: number, y: number) => {
            position = { x, y };
        },
        setActiveTurn: () => {},
        syncVisual: () => {},
        canFly: () => false,
    } as unknown as RenderableUnit;
    const grid = new Grid(settings, GridVals.NORMAL);
    grid.placeArtifactBarrel(TeamVals.LEFT, 0, barrel);
    grid.occupyCells(unit.getCells(), unit.getId(), unit.getTeam(), 1, false, false);
    const move: Move = {
        type: "unit_moved",
        unitId: unit.getId(),
        from: position,
        to: GridMath.getPositionForFootprintAnchor(settings, destination, width, height),
        path: acceptedPath,
        targetCells: GridMath.getFootprintCellsForAnchor(destination, width, height),
    };
    let worldPath: XY[] = [];
    let track: XY[] | undefined;
    let complete!: () => void;
    const scene = Object.assign(Object.create(ranked ? RankedPlayScene.prototype : Sandbox.prototype), {
        grid,
        sc_sceneSettings: { getGridSettings: () => settings },
        drawer: { getUnitsContainer: () => undefined },
        isSceneDestroyed: () => false,
        shouldDeferActionToAuthoritativeReplay: () => false,
        shouldShowMoveDestinationSilhouette: () => false,
        createActionEngine: () => ({ apply: () => ({ completed: true, events: [move] }) }),
        clearCommittedBoardActionPreview: () => {},
        finishMovedUnitTurn: () => {},
        flushPendingReplayRecords: () => {},
        hoverManager: { setSilhouetteLocked: () => {}, clearHoverSilhouette: () => {} },
        moveAnimManager: {
            startMoveAnimation: (
                _unit: RenderableUnit,
                points: XY[],
                _speed: number,
                _dest: XY,
                route: XY[] | undefined,
                done: () => void,
            ) => {
                worldPath = points;
                track = route;
                complete = done;
            },
        },
    }) as {
        executeMoveSequence(unit: RenderableUnit, path: XY[], footprint?: XY[]): boolean;
        playRecordedMoveAnimation(unit: RenderableUnit, event: Move): Promise<boolean>;
    };
    const expectRoute = () => {
        expect(track).toEqual(acceptedPath);
        expect(worldPath).toEqual(
            acceptedPath.map((anchor) => GridMath.getPositionForFootprintAnchor(settings, anchor, width, height)),
        );
        for (const point of worldPath)
            expect(GridMath.getFootprintCellsForPosition(settings, point, width, height)).not.toContainEqual(barrel);
        expect(grid.getOccupantUnitId(barrel)).toBe("B");
    };
    return {
        scene,
        grid,
        unit,
        move,
        expectRoute,
        complete: () => {
            unit.setPosition(move.to.x, move.to.y);
            complete();
        },
    };
}

describe("barrel-safe accepted movement playback", () => {
    for (const [width, height] of [
        [1, 1],
        [2, 2],
        [1, 2],
        [2, 1],
    ]) {
        test(`sandbox ${width}x${height} follows the accepted detour instead of the requested route or footprint`, () => {
            const h = fixture(width, height);
            expect(
                h.scene.executeMoveSequence(
                    h.unit,
                    h.unit.isSmallSize() ? requestedPath : h.move.targetCells,
                    h.move.targetCells,
                ),
            ).toBe(true);
            h.expectRoute();
            h.complete();
            expect(h.grid.getOccupantUnitId(barrel)).toBe("B");
        });
        for (const ranked of [false, true])
            test(`${ranked ? "ranked" : "sandbox replay"} ${width}x${height} follows the same detour`, async () => {
                const h = fixture(width, height, ranked);
                const pending = h.scene.playRecordedMoveAnimation(h.unit, h.move);
                h.expectRoute();
                h.complete();
                expect(await pending).toBe(true);
                expect(h.grid.getOccupantUnitId(barrel)).toBe("B");
                for (const cell of h.move.targetCells) expect(h.grid.getOccupantUnitId(cell)).toBe(h.unit.getId());
            });
    }

    for (const obstacle of [false, true])
        test(`${obstacle ? "barrel" : "melee"} attack playback takes the accepted approach from the event`, async () => {
            const h = fixture(1, 1, true);
            let seen: XY[] | undefined;
            Object.assign(h.scene, {
                beginDullingDefensePresentation: () => {},
                unitsHolder: {
                    getAllUnits: () =>
                        new Map([
                            ["walker", h.unit],
                            ["target", h.unit],
                        ]),
                },
                replayMeleeApproach: (_unit: RenderableUnit, _from: XY, path: XY[]) => {
                    seen = path;
                    return Promise.resolve(false);
                },
            });
            const record = {
                action: obstacle
                    ? {
                          type: "obstacle_attack",
                          attackerId: "walker",
                          targetPosition: { x: 0, y: 0 },
                          attackFrom: destination,
                          path: requestedPath,
                      }
                    : {
                          type: "melee_attack",
                          attackerId: "walker",
                          targetId: "target",
                          attackFrom: destination,
                          path: requestedPath,
                      },
                events: [
                    {
                        type: obstacle ? "obstacle_attacked" : "unit_attacked",
                        attackerId: "walker",
                        approachPath: acceptedPath,
                    },
                ],
            } as unknown as SandboxReplayActionRecord;
            const scene = h.scene as unknown as {
                playReplayObstacleAttackAction(record: SandboxReplayActionRecord): Promise<boolean>;
                playReplayAttackRecord(record: SandboxReplayActionRecord): Promise<boolean>;
            };
            expect(
                await (obstacle ? scene.playReplayObstacleAttackAction(record) : scene.playReplayAttackRecord(record)),
            ).toBe(false);
            expect(seen).toEqual(acceptedPath);
        });
});
