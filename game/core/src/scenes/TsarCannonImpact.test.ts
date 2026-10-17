import { expect, test } from "bun:test";
import { cannonContactCenter, cannonExplosionFrame, lastCannonHit } from "./TsarCannonImpact";
import { CANNON_ATTACK_DURATIONS, CANNON_SHOT_RELEASE_FRAME } from "./TsarCannonReactions";
const victim = (x: number, y: number) => ({ getPosition: () => ({ x, y }) });

test("Through Shot ends at the last intersected creature, regardless of engine group order", () => {
    const near = victim(100, 0),
        far = victim(300, 0),
        behind = victim(-100, 0);
    expect(lastCannonHit({ x: 0, y: 0 }, { x: 1000, y: 0 }, [far, behind, near])).toBe(far);
    expect(lastCannonHit({ x: 400, y: 0 }, { x: 0, y: 0 }, [near, far])).toBe(near);
    const high = victim(30, 300),
        low = victim(10, 100);
    expect(lastCannonHit({ x: 0, y: 0 }, { x: 50, y: 500 }, [high, low])).toBe(high);
    expect(lastCannonHit({ x: 0, y: 0 }, { x: 1000, y: 0 }, [])).toBeUndefined();
});
test("one-cell ball detonates when its front reaches the final creature", () => {
    expect(cannonContactCenter({ x: 0, y: 0 }, { x: 300, y: 0 }, 100)).toEqual({ x: 250, y: 0 });
    expect(cannonContactCenter({ x: 400, y: 0 }, { x: 100, y: 0 }, 100)).toEqual({ x: 150, y: 0 });
    expect(cannonContactCenter({ x: 0, y: 0 }, { x: 0, y: 20 }, 100)).toEqual({ x: 0, y: 0 });
});
test("attack runs twice as fast while release and explosion remain frame driven", () => {
    expect(CANNON_ATTACK_DURATIONS.reduce((a, b) => a + b, 0)).toBe(474);
    expect(CANNON_ATTACK_DURATIONS.slice(0, CANNON_SHOT_RELEASE_FRAME).reduce((a, b) => a + b, 0)).toBe(100);
    expect(cannonExplosionFrame(0)).toBe(0);
    expect(cannonExplosionFrame(20)).toBe(1);
    expect(cannonExplosionFrame(799)).toBe(15);
    expect(cannonExplosionFrame(800)).toBe(-1);
});
