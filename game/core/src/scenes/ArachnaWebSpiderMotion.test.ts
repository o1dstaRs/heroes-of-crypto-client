import { expect, test } from "bun:test";
import { arachnaSpiderRig } from "./ArachnaWebSpiderMotion";
import { arachnaSpiderPose, arachnaWebSway } from "./ArachnaWebGeometry";
const rigAt = (i: number, age: number) => arachnaSpiderRig(i, age, arachnaSpiderPose, arachnaWebSway);
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test("rocking preserves planted contacts and rigid leg lengths through running and turnarounds", () => {
    let plantedComparisons = 0;
    for (let i = 0; i < 8; i++)
        for (let age = 0; age < 20000; age += 37) {
            const rig = rigAt(i, age),
                next = rigAt(i, age + 8);
            for (let n = 0; n < 8; n++) {
                const leg = rig.legs[n],
                    later = next.legs[n];
                expect(distance(leg.hip, leg.knee)).toBeCloseTo(leg.upper, 5);
                expect(distance(leg.knee, leg.ankle)).toBeCloseTo(leg.lower, 5);
                expect(distance(leg.ankle, leg.toe)).toBeCloseTo(0.085, 5);
                expect(
                    Math.max(Math.abs(leg.toe.x), Math.abs(leg.toe.y), Math.abs(leg.knee.x), Math.abs(leg.knee.y)),
                ).toBeLessThan(1.45);
                if (leg.planted && later.planted && distance(leg.rest, later.rest) < 1) {
                    expect(distance(leg.rest, later.rest)).toBeLessThan(1e-8);
                    plantedComparisons++;
                }
            }
        }
    expect(plantedComparisons).toBeGreaterThan(10000);
});

test("body and abdomen have visible, continuous, asynchronous rocking", () => {
    const xs: number[] = [],
        rolls: number[] = [],
        lag: number[] = [];
    for (let t = 0; t <= 5600; t += 16) {
        const a = rigAt(0, t),
            b = rigAt(0, t + 16);
        xs.push(a.shift.x);
        rolls.push(a.roll);
        lag.push(a.abdomenYaw - a.yaw);
        expect(distance(a.shift, b.shift)).toBeLessThan(0.03);
        expect(Math.abs(a.yaw - b.yaw)).toBeLessThan(0.03);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.18);
    expect(Math.max(...rolls) - Math.min(...rolls)).toBeGreaterThan(0.45);
    expect(Math.max(...lag) - Math.min(...lag)).toBeGreaterThan(0.28);
    expect(
        Math.max(...[0, 700, 1400, 2100].map((t) => Math.abs(rigAt(0, t).shift.x - rigAt(1, t).shift.x))),
    ).toBeGreaterThan(0.05);
});
