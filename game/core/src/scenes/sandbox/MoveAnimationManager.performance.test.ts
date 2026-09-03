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
