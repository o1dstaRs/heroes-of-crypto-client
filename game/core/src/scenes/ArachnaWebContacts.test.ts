import { expect, test } from "bun:test";
import { ArachnaContactField, attachArachnaFoot } from "./ArachnaWebContacts";
import { arachnaSilkContacts, arachnaSpiderPose } from "./ArachnaWebGeometry";
import { arachnaSpiderRig } from "./ArachnaWebSpiderMotion";

test("foot pressure makes a local depression and lifts cleanly without moving square attachments", () => {
    const field = new ArachnaContactField();
    field.update([{ x: 250, y: 300, load: 1, age: 100, strength: 0 }]);
    expect(field.sample(250, 300)).toBeLessThan(-2.3);
    expect(Math.abs(field.sample(290, 300))).toBeLessThan(0.01);
    expect(field.sample(3, 300)).toBe(0);
    field.update([]);
    expect(field.sample(250, 300)).toBe(0);
});

test("touchdown sends a travelling pulse that decays completely after lift-off", () => {
    const field = new ArachnaContactField();
    field.update([{ x: 250, y: 300, load: 0, age: 100, strength: 1 }]);
    const early = Math.abs(field.sample(261, 300));
    const farEarly = Math.abs(field.sample(283, 300));
    expect(early).toBeGreaterThan(0.1);
    field.update([{ x: 250, y: 300, load: 0, age: 300, strength: 1 }]);
    expect(Math.abs(field.sample(283, 300))).toBeGreaterThan(farEarly + 0.02);
    expect(Math.abs(field.sample(261, 300))).toBeLessThan(early * 0.1);
    field.update([{ x: 250, y: 300, load: 0, age: 700, strength: 1 }]);
    expect(field.sample(283, 300)).toBe(0);
});

test("actual silk footholds and local deflection keep articulated legs connected", () => {
    const field = new ArachnaContactField();
    for (let time = 0; time < 12000; time += 137) {
        field.update(arachnaSilkContacts(time));
        for (let spider = 0; spider < 8; spider++) {
            const rig = arachnaSpiderRig(
                spider,
                time,
                (i, t) => arachnaSpiderPose(i, t, field),
                (x, y, t) => field.motion(x, y, t),
                attachArachnaFoot,
            );
            for (const leg of rig.legs) {
                expect(Math.hypot(leg.hip.x - leg.knee.x, leg.hip.y - leg.knee.y)).toBeCloseTo(leg.upper, 5);
                expect(Math.hypot(leg.ankle.x - leg.knee.x, leg.ankle.y - leg.knee.y)).toBeCloseTo(leg.lower, 5);
                expect(
                    Math.max(Math.abs(leg.toe.x), Math.abs(leg.toe.y), Math.abs(leg.knee.x), Math.abs(leg.knee.y)),
                ).toBeLessThan(1.45);
                if (leg.planted) {
                    const attached = attachArachnaFoot(leg.rest);
                    expect(Math.hypot(attached.x - leg.rest.x, attached.y - leg.rest.y)).toBeLessThan(1e-8);
                }
            }
        }
    }
});
