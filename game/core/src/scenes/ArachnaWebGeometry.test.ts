import { expect, test } from "bun:test";
import { arachnaSpiderPose, arachnaWebSway } from "./ArachnaWebGeometry";
import { ARACHNA_WEB_DESIGN } from "./ArachnaWebDesign";
import { arachnaPulseTension } from "./ArachnaWebMotion";

test("procedural silk retains four square corner attachments and the original central opening", () => {
    const points = ARACHNA_WEB_DESIGN.strands.flatMap(({ points: path }) =>
        Array.from({ length: path.length / 2 }, (_, i) => ({ x: path[i * 2], y: path[i * 2 + 1] })),
    );
    for (const corner of [
        { x: 3, y: 3 },
        { x: 636, y: 3 },
        { x: 3, y: 636 },
        { x: 636, y: 636 },
    ]) {
        expect(Math.min(...points.map((p) => Math.hypot(p.x - corner.x, p.y - corner.y)))).toBeLessThan(5);
    }
    expect(Math.min(...points.map((p) => Math.hypot(p.x - 320, p.y - 320)))).toBeGreaterThan(52);
    expect(ARACHNA_WEB_DESIGN.routes).toHaveLength(8);
});

test("the broad tension trough travels outward, recovers and closes its four-second loop", () => {
    const troughTime = (radius: number) => (((radius - 60) / 385 + 0.28) / 1.6) * 4000;
    for (const radius of [100, 180, 260]) {
        const time = troughTime(radius);
        const trough = arachnaPulseTension(320 + radius, 320, time);
        expect(trough.height).toBeLessThan(-4.7);
        expect(trough.radial).toBeLessThan(-2.5);
        expect(arachnaPulseTension(320 + radius, 320, time + 850).height).toBeGreaterThan(0.8);
        expect(arachnaPulseTension(320 + radius, 320, time + 4000).height).toBeCloseTo(trough.height, 10);
    }
    const before = arachnaWebSway(460, 320, 3999.9);
    const after = arachnaWebSway(460, 320, 4000.1);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.01);
});

test("eight spiders travel source strands and inherit exactly the same wind as their supporting web", () => {
    for (let spider = 0; spider < 8; spider++) {
        const start = arachnaSpiderPose(spider, 0);
        const excursions = [1700, 3400, 5100, 6800].map((age) => {
            const later = arachnaSpiderPose(spider, age);
            return Math.hypot(start.x - later.x, start.y - later.y);
        });
        expect(Math.max(...excursions)).toBeGreaterThan(60);
        for (let age = 0; age <= 16000; age += 80) {
            const pose = arachnaSpiderPose(spider, age),
                next = arachnaSpiderPose(spider, age + 16);
            const sway = arachnaWebSway(pose.sourceX, pose.sourceY, age);
            expect(pose.x - pose.sourceX).toBeCloseTo(sway.x, 10);
            expect(pose.y - pose.sourceY).toBeCloseTo(sway.y, 10);
            expect(Math.hypot(next.x - pose.x, next.y - pose.y)).toBeLessThan(4);
            expect(pose.x).toBeGreaterThan(32);
            expect(pose.x).toBeLessThan(608);
            expect(pose.y).toBeGreaterThan(32);
            expect(pose.y).toBeLessThan(608);
            expect(Number.isFinite(pose.angle)).toBe(true);
        }
    }
});
