import { expect, test } from "bun:test";
import { FAIRY_LAB_IDLE_CYCLE_MS } from "./FairyLabIdle";
import { fairyIdleMotion } from "./FairyLabIdleVisuals";

test("Fairy breath is visible in the neutral pause and settles before the gesture", () => {
    expect(fairyIdleMotion(0)).toEqual([0, -0, 0]);
    const inhale = fairyIdleMotion(400);
    expect(inhale[1]).toBeCloseTo(-14);
    expect(inhale[2]).toBeCloseTo(0.055);
    for (const time of [1500, 1780, 1930, 2500, 2779]) {
        expect(fairyIdleMotion(time)).toEqual([0, 0, 0]);
    }
    expect(Math.abs(fairyIdleMotion(1499)[1])).toBeLessThan(0.001);
    expect(Math.abs(fairyIdleMotion(2781)[1])).toBeLessThan(0.001);
});

test("Fairy breath joins the closing and opening pauses without a loop jump", () => {
    const before = fairyIdleMotion(FAIRY_LAB_IDLE_CYCLE_MS - 0.001);
    const after = fairyIdleMotion(FAIRY_LAB_IDLE_CYCLE_MS + 0.001);
    for (let axis = 0; axis < 3; axis++) expect(Math.abs(before[axis] - after[axis])).toBeLessThan(0.001);
    expect(fairyIdleMotion(FAIRY_LAB_IDLE_CYCLE_MS + 400)).toEqual(fairyIdleMotion(400));
    expect(fairyIdleMotion(Number.NaN)).toEqual(fairyIdleMotion(0));
    expect(fairyIdleMotion(-500)).toEqual(fairyIdleMotion(0));
});
