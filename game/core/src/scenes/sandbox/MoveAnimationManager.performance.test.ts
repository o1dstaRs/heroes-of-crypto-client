import { describe, expect, test } from "bun:test";

import { Sprite, Texture } from "pixi.js";

import { MoveAnimationManager, type IMoveAnimationContext } from "./MoveAnimationManager";

interface TestAfterimage {
    sprite: Sprite;
    life: number;
    maxLife: number;
}

interface TestTrack {
    life: number;
}

interface MoveAnimationInternals {
    afterimages: TestAfterimage[];
    lingeringTracks: TestTrack[];
}

const makeContext = () => {
    let blocked = false;
    const context = {
        getGridSettings: () => ({ getCellSize: () => 10 }),
        setMoveBlocked: (value: boolean) => {
            blocked = value;
        },
    } as IMoveAnimationContext;
    return { context, isBlocked: () => blocked };
};

const makeMovingUnit = () => {
    let walking = false;
    let blur = -1;
    return {
        unit: {
            startBoardWalkAnimation: () => {
                walking = true;
            },
            stopBoardWalkAnimation: () => {
                walking = false;
            },
            hasAbilityActive: () => true,
            getUnitProperties: () => ({ name: "Knight" }),
            canFly: () => false,
            setMotionBlur: (value: number) => {
                blur = value;
            },
        },
        isWalking: () => walking,
        blur: () => blur,
    };
};

describe("movement effect allocation", () => {
    test("measures gait distance along diagonal, partial and corner segments", () => {
        let distance = 0;
        let totalDistance = 0;
        let position = { x: 0, y: 0 };
        const unit = {
            startBoardWalkAnimation: (_direction: number, total: number) => {
                totalDistance = total;
            },
            setBoardWalkDistanceCells: (value: number) => {
                distance = value;
            },
            setBoardFacingFromMovement: () => {},
            setPosition: (x: number, y: number) => {
                position = { x, y };
            },
            getPosition: () => position,
            isSmallSize: () => true,
            canFly: () => true,
            getUnitProperties: () => ({ name: "Fairy" }),
        };
        const manager = new MoveAnimationManager({
            getGridSettings: () => ({ getCellSize: () => 100 }),
            setMoveBlocked: () => {},
        } as unknown as IMoveAnimationContext);
        manager.startMoveAnimation(
            unit as never,
            [
                { x: 0, y: 0 },
                { x: 100, y: 100 },
                { x: 100, y: 400 },
            ],
            100 / 1.2,
            { x: 1, y: 4 },
        );
        expect(totalDistance).toBeCloseTo(Math.SQRT2 + 3);
        manager.update(0.65);
        expect(distance).toBeCloseTo(0.65);
        manager.update(0);
        expect(distance).toBeCloseTo(0.65);
        manager.update(0.65);
        expect(distance).toBeCloseTo(1.3);
        expect(position.x).toBeCloseTo(130 / Math.SQRT2);
        manager.update(1.3);
        expect(distance).toBeCloseTo(2.6);
        expect(position.x).toBe(100);
        expect(position.y).toBeCloseTo(100 + (2.6 - Math.SQRT2) * 100);
    });

    test("compacts afterimages and dust tracks without replacing their arrays", () => {
        const manager = new MoveAnimationManager({} as IMoveAnimationContext);
        const internals = manager as unknown as MoveAnimationInternals;
        const survivingSprite = new Sprite(Texture.WHITE);
        const expiredSprite = new Sprite(Texture.WHITE);
        const afterimages = [
            { sprite: survivingSprite, life: 1, maxLife: 1 },
            { sprite: expiredSprite, life: 0.1, maxLife: 1 },
        ];
        const tracks = [{ life: 1 }, { life: 0.1 }];
        internals.afterimages = afterimages;
        internals.lingeringTracks = tracks;

        manager.update(0.25);

        expect(internals.afterimages).toBe(afterimages);
        expect(afterimages).toEqual([{ sprite: survivingSprite, life: 0.75, maxLife: 1 }]);
        expect(expiredSprite.destroyed).toBe(true);
        expect(internals.lingeringTracks).toBe(tracks);
        expect(tracks).toEqual([{ life: 0.75 }]);
        survivingSprite.destroy();
    });

    test("cancels a move without firing its gameplay completion", () => {
        const { context, isBlocked } = makeContext();
        const moving = makeMovingUnit();
        const manager = new MoveAnimationManager(context);
        let completed = 0;
        let cancelled = 0;

        manager.startMoveAnimation(
            moving.unit as never,
            [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ],
            10,
            { x: 1, y: 0 },
            undefined,
            () => completed++,
            true,
            () => cancelled++,
        );

        expect(manager.isMoving()).toBe(true);
        expect(isBlocked()).toBe(true);
        expect(moving.isWalking()).toBe(true);

        manager.cancel();
        manager.cancel();

        expect(manager.isMoving()).toBe(false);
        expect(isBlocked()).toBe(false);
        expect(moving.isWalking()).toBe(false);
        expect(moving.blur()).toBe(0);
        expect(completed).toBe(0);
        expect(cancelled).toBe(1);
    });

    test("cancels a swap without moving units to their destination", () => {
        const { context, isBlocked } = makeContext();
        const manager = new MoveAnimationManager(context);
        const positions: Array<[number, number]> = [];
        const unit = { setPosition: (x: number, y: number) => positions.push([x, y]) };
        let completed = 0;
        let cancelled = 0;

        manager.startSwapAnimation(
            unit as never,
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            unit as never,
            { x: 10, y: 0 },
            { x: 0, y: 0 },
            () => completed++,
            () => cancelled++,
        );
        manager.cancel();

        expect(manager.isMoving()).toBe(false);
        expect(isBlocked()).toBe(false);
        expect(positions).toEqual([]);
        expect(completed).toBe(0);
        expect(cancelled).toBe(1);
    });
});
