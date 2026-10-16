import { expect, test } from "bun:test";
import { BERSERKER_IDLE_POSE_ORDER, BERSERKER_POSE_TONES, BERSERKER_REFERENCE_TONES } from "./BerserkerIdleCalibration";
import {
    BERSERKER_IDLE_PAUSE_MS,
    BERSERKER_WAITING_SPEED,
    berserkerPaletteValue,
    berserkerPoseSourceY,
    berserkerWaitingMotion,
    berserkerWaitingOffset,
} from "./BerserkerIdleVisuals";
import { animationAtlases } from "../generated/animation_atlases";

test("Berserker rest is 25 percent shorter while sword timing stays authored", () => {
    const durations = animationAtlases["Berserker Sword"].idle.frameDurationsMs!;
    expect(BERSERKER_IDLE_PAUSE_MS).toBe(3150);
    expect(durations[0]).toBe(BERSERKER_IDLE_PAUSE_MS);
    expect(durations.slice(1)).toEqual([
        110, 110, 110, 130, 110, 110, 110, 110, 240, 1000, 240, 110, 110, 110, 110, 130, 110, 110, 110,
    ]);
    expect(durations.reduce((a, b) => a + b, 0)).toBe(6430);
});

test("Berserker palette maps measured body tones to the base and never grades neutral", () => {
    for (let c = 0; c < 3; c++)
        for (let value = 0; value < 256; value++) expect(berserkerPaletteValue(0, c, value)).toBe(value);
    for (let pose = 1; pose < BERSERKER_POSE_TONES.length; pose++)
        for (let c = 0; c < 3; c++) {
            const tones: readonly number[] = BERSERKER_POSE_TONES[pose][c];
            for (let i = 0; i < tones.length; i++) {
                // Equal source quantiles collapse naturally to a single output tone.
                const first = tones.indexOf(tones[i]);
                expect(berserkerPaletteValue(pose, c, tones[i])).toBeCloseTo(BERSERKER_REFERENCE_TONES[c][first], 7);
            }
            for (let value = 1; value < 256; value++)
                expect(berserkerPaletteValue(pose, c, value)).toBeGreaterThanOrEqual(
                    berserkerPaletteValue(pose, c, value - 1),
                );
        }
});

test("Berserker waits with connected subtle motion, fixed boots and a smooth neutral seam", () => {
    const durations = animationAtlases["Berserker Sword"].idle.frameDurationsMs!;
    const cycle = durations.reduce((a, b) => a + b, 0);
    expect(berserkerWaitingMotion(0, durations)).toEqual({ x: 0, y: 0 });
    for (const t of [3150, 3500, 5000, 6429, NaN]) expect(berserkerWaitingMotion(t, durations)).toEqual({ x: 0, y: 0 });
    for (let t = 0; t < 3150; t += 17) {
        const motion = berserkerWaitingMotion(t, durations);
        expect(Math.abs(motion.x)).toBeLessThanOrEqual(4);
        expect(Math.abs(motion.y)).toBeLessThanOrEqual(1);
        for (const y of [820, 850, 920, 976]) expect(berserkerWaitingOffset(y, motion)).toEqual({ x: 0, y: 0 });
        expect(berserkerWaitingOffset(410, motion)).toEqual(berserkerWaitingOffset(480, motion));
        expect(berserkerWaitingMotion(t + cycle, durations)).toEqual(motion);
        const next = berserkerWaitingMotion(t + 1, durations);
        expect(Math.abs(next.x - motion.x)).toBeLessThan(0.012);
    }
    expect(Math.abs(berserkerWaitingMotion(800, durations).x)).toBeGreaterThan(1);
    expect(Math.abs(berserkerWaitingMotion(3149, durations).x)).toBeLessThan(0.00001);
});

test("Berserker sway runs another 20 percent faster within the same rest interval", () => {
    const durations = animationAtlases["Berserker Sword"].idle.frameDurationsMs!;
    expect(BERSERKER_WAITING_SPEED / 1.3).toBeCloseTo(1.2, 10);
    const halfPeriod = durations[0] / (2 * 1.3 * 1.2);
    expect(berserkerWaitingMotion(halfPeriod - 10, durations).x).toBeGreaterThan(0);
    expect(Math.abs(berserkerWaitingMotion(halfPeriod, durations).x)).toBeLessThan(1e-10);
    expect(berserkerWaitingMotion(halfPeriod + 10, durations).x).toBeLessThan(0);
});

test("Berserker late sword poses register the crown without resizing head, boots or weapons", () => {
    for (const frame of [9, 11]) {
        const pose = BERSERKER_IDLE_POSE_ORDER[frame];
        expect(pose).toBe(9);
        // Measured native crowns: preceding 404px, dipped 427px, following 403px.
        expect(berserkerPoseSourceY(405, pose)).toBe(427);
        for (const y of [405, 450, 510, 535]) expect(berserkerPoseSourceY(y, pose) - y).toBe(22);
        for (const y of [650, 820, 976]) expect(berserkerPoseSourceY(y, pose)).toBe(y);
        for (const x of [400, 460, 675, 750]) expect(berserkerPoseSourceY(450, pose, x)).toBe(450);
        for (let y = 535; y < 650; y++) {
            expect(berserkerPoseSourceY(y + 1, pose)).toBeGreaterThan(berserkerPoseSourceY(y, pose));
        }
    }
    for (const pose of [0, 1, 2, 3, 4, 5, 6, 7, 8, 10]) expect(berserkerPoseSourceY(427, pose)).toBe(427);
});
