import { expect, test } from "bun:test";
import { createSandMotion, updateSandMotion } from "./AbominationSandMotion";

function travel(fps: number) {
    const motion = createSandMotion({ x: 0, y: 0 }, 0);
    for (let frame = 1; frame <= fps * 2; frame++) {
        const time = (frame * 1000) / fps;
        updateSandMotion(motion, { x: time * 0.128, y: 0 }, time, 64);
    }
    return motion;
}

test("dust emissions and footfalls depend on distance, not frame rate", () => {
    const reference = travel(60);
    for (const fps of [10, 30, 120]) {
        const motion = travel(fps);
        expect(motion.wakes).toHaveLength(reference.wakes.length);
        motion.wakes.forEach((puff, index) => {
            expect(puff.x).toBeCloseTo(reference.wakes[index].x, 5);
            expect(puff.born).toBeCloseTo(reference.wakes[index].born, 5);
        });
        expect(motion.step!.x).toBeCloseTo(reference.step!.x, 5);
        expect(motion.step!.y).toBeCloseTo(reference.step!.y, 5);
        expect(motion.step!.born).toBeCloseTo(reference.step!.born, 5);
        expect(motion.velocity.x).toBeCloseTo(2, 4);
    }
});

test("dust stays behind in world space, settles after stopping, and does not emit at idle", () => {
    const motion = travel(60);
    const last = { ...motion.wakes.at(-1)! };
    const step = { ...motion.step! };
    for (let time = 2100; time <= 2400; time += 100) {
        updateSandMotion(motion, { x: 256, y: 0 }, time, 64);
    }
    expect(motion.wakes.at(-1)).toEqual(last);
    expect(motion.step).toEqual(step);
    expect(motion.velocity.x).toBeLessThan(0.08);
    for (let time = 2500; time <= 3500; time += 100) updateSandMotion(motion, { x: 256, y: 0 }, time, 64);
    expect(motion.wakes).toHaveLength(0);
    const idle = createSandMotion({ x: 0, y: 0 }, 0);
    updateSandMotion(idle, { x: 0, y: 0 }, 100, 64);
    expect(idle.wakes).toHaveLength(0);
    expect(idle.step).toBeUndefined();
});

test("teleports and hidden previews reset motion without a long false dust trail", () => {
    for (const time of [2016, 4000]) {
        const motion = travel(60);
        updateSandMotion(motion, { x: 640, y: 0 }, time, 64);
        expect(motion.wakes).toHaveLength(0);
        expect(motion.step).toBeUndefined();
        expect(motion.velocity).toEqual({ x: 0, y: 0 });
        expect(motion.distance).toBe(0);
    }
});
