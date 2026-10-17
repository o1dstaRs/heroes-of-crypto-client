import { expect, test } from "bun:test";
import { harpyCastlingDurations, sampleHarpyCastling } from "./HarpyCastlingMotion";
import { MoveAnimationManager, type IMoveAnimationContext } from "./MoveAnimationManager";
import type { RenderableUnit } from "../RenderableUnit";

const origin = { x: 100, y: 200 };
const target = { x: 500, y: 400 };
test("Castling leaves the target still until pickup, carries it home, then sends Harpy to the vacated cell", () => {
    const durations = harpyCastlingDurations(4.5);
    let time = 0;
    const samples = durations.map((duration) => {
        const pose = sampleHarpyCastling(time + duration / 2, durations, origin, target, origin, target);
        time += duration;
        return pose;
    });
    for (const pose of samples.slice(0, 4)) expect(pose.passenger).toEqual(target);
    expect(samples[2].caster).toEqual(target);
    expect(samples[3].attached).toBe(true);
    expect(samples[3].passengerLift).toBeCloseTo(0.5);
    expect(samples[4].caster).toEqual(samples[4].passenger);
    expect(samples[4].passengerLift).toBe(1);
    expect(samples[5].passenger).toEqual(origin);
    expect(samples[5].passengerLift).toBeCloseTo(0.5);
    expect(samples[6].passengerLift).toBe(0);
    expect(samples[7].passenger).toEqual(origin);
    expect(samples[7].attached).toBe(false);
    const final = sampleHarpyCastling(time + 1, durations, origin, target, origin, target);
    expect(final.finished).toBe(true);
    expect(final.caster).toEqual(target);
    expect(final.passenger).toEqual(origin);
    expect(final.casterLift).toBe(0);
});

function fixture() {
    const makeUnit = (name: string, initial: { x: number; y: number }) => {
        const position = { ...initial };
        let elevation = 0;
        let grip: unknown;
        let frame = -1;
        const unit = {
            getName: () => name,
            hasAnimationState: () => true,
            getPosition: () => position,
            setPosition: (x: number, y: number) => {
                position.x = x;
                position.y = y;
            },
            returnToIdleAnimation: () => {
                frame = -1;
            },
            setTransportVisual: (height: number, target?: unknown) => {
                elevation = height;
                grip = target;
            },
            getCastlingShoulderPoint: () => ({ x: position.x, y: position.y + elevation + 90 }),
            getVisualCenter: () => ({ x: position.x, y: position.y + elevation }),
            startBoardWalkAnimation: () => {},
            finishBoardWalkAnimationAfterFullCycle: () => false,
            setBoardFacingFromMovement: () => {},
            setBoardWalkDistanceCells: () => {},
            setHarpyCastFrame: (value: number) => {
                frame = value;
                return true;
            },
            syncVisual: () => {},
        } as unknown as RenderableUnit;
        return { unit, position, elevation: () => elevation, grip: () => grip, frame: () => frame };
    };
    const a = makeUnit("Harpy", origin);
    const b = makeUnit("Squire", target);
    let blocked = false;
    let completed = 0;
    let canceled = 0;
    const manager = new MoveAnimationManager({
        getGridSettings: () => ({ getCellSize: () => 100 }),
        getWorldRoot: () => ({}),
        setMoveBlocked: (value: boolean) => {
            blocked = value;
        },
        requestVisibleStateUpdate: () => {},
    } as unknown as IMoveAnimationContext);
    manager.startSwapAnimation(
        a.unit,
        a.position,
        b.position,
        b.unit,
        b.position,
        a.position,
        () => completed++,
        () => canceled++,
    );
    return { a, b, manager, blocked: () => blocked, completed: () => completed, canceled: () => canceled };
}

test("transport snapshots live positions, keeps the grip, and completes exactly once", () => {
    const f = fixture();
    expect(f.blocked()).toBe(true);
    f.manager.update(0.1);
    expect(f.b.position).toEqual(target);
    let sawCarry = false;
    for (let i = 0; i < 300; i++) {
        f.manager.update(1 / 60);
        if (f.b.elevation() > 50 && f.a.grip() === f.b.unit) {
            sawCarry = true;
            expect(f.a.position).toEqual(f.b.position);
        }
    }
    expect(sawCarry).toBe(true);
    expect(f.a.position).toEqual(target);
    expect(f.b.position).toEqual(origin);
    expect(f.a.elevation()).toBe(0);
    expect(f.b.elevation()).toBe(0);
    expect(f.a.grip()).toBeUndefined();
    expect(f.a.frame()).toBe(-1);
    expect(f.completed()).toBe(1);
    expect(f.manager.isMoving()).toBe(false);
    expect(f.blocked()).toBe(false);
});

test.each(["forceFinish", "cancel"] as const)("%s clears carried poses and releases the scene", (method) => {
    const f = fixture();
    f.manager.update(1.3);
    f.manager[method]();
    f.manager[method]();
    expect(f.a.grip()).toBeUndefined();
    expect(f.a.elevation()).toBe(0);
    expect(f.b.elevation()).toBe(0);
    expect(f.a.position).toEqual(target);
    expect(f.b.position).toEqual(origin);
    expect(f.completed()).toBe(method === "forceFinish" ? 1 : 0);
    expect(f.canceled()).toBe(method === "cancel" ? 1 : 0);
    expect(f.blocked()).toBe(false);
});
