import { expect, test } from "bun:test";
import { MoveAnimationManager, type IMoveAnimationContext } from "./MoveAnimationManager";

const setup = () => {
    const events: string[] = [];
    let position = { x: 0, y: 0 };
    const unit = {
        getName: () => "Champion",
        getUnitProperties: () => ({ name: "Champion" }),
        getPosition: () => position,
        setPosition: (x: number, y: number) => {
            position = { x, y };
        },
        isSmallSize: () => false,
        canFly: () => false,
        hasAbilityActive: () => false,
        startBoardWalkAnimation: () => {},
        stopBoardWalkAnimation: () => {},
        finishBoardWalkAnimationAfterFullCycle: () => false,
        setBoardFacingFromMovement: () => {},
        setBoardWalkDistanceCells: () => {},
        syncVisual: () => {},
        setSpriteRotation: () => {},
    };
    const context = {
        getGridSettings: () => ({ getCellSize: () => 100 }),
        updateSceneLog: () => {},
        finishTurn: () => events.push("finish-turn"),
        setMoveBlocked: () => {},
        getHoverManager: () => ({ setSilhouetteLocked: () => {}, clearHoverSilhouette: () => {} }),
        getWorldRoot: () => ({}),
        requestVisibleStateUpdate: () => {},
        startMovementSound: () => {
            events.push("sound-start");
            return () => events.push("sound-stop");
        },
    } as unknown as IMoveAnimationContext;
    const manager = new MoveAnimationManager(context);
    const start = (
        points = [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 50 },
        ],
        speed = 100,
    ) =>
        manager.startMoveAnimation(unit as never, points, speed, { x: 1, y: 1 }, undefined, () =>
            events.push("strike-ready"),
        );
    return { manager, events, start };
};

test("one movement loop spans path corners and stops before the following strike", () => {
    const { manager, events, start } = setup();
    start();
    manager.update(0.25);
    manager.update(0.3);
    expect(events).toEqual(["sound-start"]);
    manager.update(0.5);
    expect(events).toEqual(["sound-start", "sound-stop", "strike-ready"]);
    manager.update(1);
    expect(events).toHaveLength(3);
});

test.each(["cancel", "forceFinish"] as const)("%s releases movement audio", (action) => {
    const { manager, events, start } = setup();
    start();
    manager[action]();
    manager[action]();
    expect(events.filter((event) => event === "sound-stop")).toHaveLength(1);
    expect(events.includes("strike-ready")).toBe(action === "forceFinish");
});

test("zero-length and non-moving paths never start movement audio", () => {
    for (const [points, speed] of [
        [
            [
                { x: 0, y: 0 },
                { x: 0, y: 0 },
            ],
            100,
        ],
        [
            [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
            ],
            0,
        ],
    ] as const) {
        const { manager, events, start } = setup();
        start(
            points.map((point) => ({ ...point })),
            speed,
        );
        manager.update(1);
        expect(events).toEqual(["strike-ready"]);
    }
});
