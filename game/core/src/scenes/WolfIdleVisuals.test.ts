import { afterAll, beforeAll, expect, test } from "bun:test";
import { AlphaFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import {
    syncWolfIdleVisuals,
    wolfPaletteValue,
    wolfRegisteredY,
    wolfHowlBlend,
    wolfIdleFrameScale,
    wolfIdleTextureFrame,
    wolfTailMotion,
    wolfIdlePlaybackDurations,
} from "./WolfIdleVisuals";

import { WOLF_POSE_BODY, WOLF_POSE_QUANTILES, WOLF_REFERENCE_QUANTILES } from "./WolfIdleCalibration";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const durations = [1200, ...Array(8).fill(90), 480, ...Array(8).fill(90), 700, ...Array(11).fill(110), 1300];

test("Wolf idle plays 30 percent faster with the frame and filter clocks aligned", () => {
    const faster = wolfIdlePlaybackDurations(durations);
    expect(faster.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(6330 / 1.3);
    expect(faster.slice(1, 18).reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(1920 / 1.3);
    for (const time of [0, 1200, 1350, 1500, 2160, 3119, 3700]) {
        const expected = wolfHowlBlend(time, durations),
            actual = wolfHowlBlend(time / 1.3, faster);
        expect(actual.from).toBe(expected.from);
        expect(actual.to).toBe(expected.to);
        expect(actual.mix).toBeCloseTo(expected.mix);
    }
    expect(durations[0]).toBe(1200);
});

test("Wolf rests on the exact original texture throughout both pauses", () => {
    for (const frame of [0, 18, 19, 22, 29, 30]) {
        expect(wolfIdleTextureFrame(frame)).toBe(0);
        expect(wolfIdleFrameScale(frame)).toBe(1);
    }
    expect(wolfIdleTextureFrame(9)).toBe(0);
    expect(wolfIdleFrameScale(1)).toBe(1);
    expect(wolfIdleFrameScale(9)).toBe(wolfIdleFrameScale(1));
});

test("Wolf enters and leaves the howl continuously through the unchanged base figure", () => {
    const position = (time: number) => {
        const { from, to, mix } = wolfHowlBlend(time, durations);
        return from * (1 - mix) + to * mix;
    };
    expect(wolfHowlBlend(1200, durations)).toEqual({ from: 0, to: 0, mix: 0 });
    expect(wolfHowlBlend(1201, durations)).toMatchObject({ from: 0, to: 1 });
    expect(position(1201)).toBeGreaterThan(0);
    expect(position(1201)).toBeLessThan(0.0001);
    expect(position(3119)).toBeGreaterThan(0);
    expect(position(3119)).toBeLessThan(0.0001);
    expect(wolfHowlBlend(3120, durations)).toEqual({ from: 0, to: 0, mix: 0 });
    expect(wolfHowlBlend(2160, durations)).toMatchObject({ from: 9, to: 9 });
    expect(wolfHowlBlend(1500 + 6330, durations)).toEqual(wolfHowlBlend(1500, durations));
    expect(wolfHowlBlend(NaN, durations)).toEqual({ from: 0, to: 0, mix: 0 });
    // Reconstruct each pose's contribution: no discontinuity at any keyframe boundary.
    const weights = (time: number) => {
        const { from, to, mix } = wolfHowlBlend(time, durations);
        const result = Array(18).fill(0);
        result[from] += 1 - mix;
        result[to] += mix;
        return result;
    };
    for (let t = 1199; t <= 3120; t++) {
        const before = weights(t),
            after = weights(t + 1);
        expect(Math.max(...before.map((v, i) => Math.abs(v - after[i])))).toBeLessThan(0.017);
    }
});

test("Wolf lowers through every neighbouring pose without an extra final morph or per-pose pauses", () => {
    const position = (time: number) => {
        const { from, to, mix } = wolfHowlBlend(time, durations);
        return from * (1 - mix) + to * mix;
    };
    for (const [start, end, direction] of [
        [1200, 2040, 1],
        [2280, 3120, -1],
    ]) {
        const visited = new Set<number>();
        for (let time = start + 1; time < end; time++) {
            const { from, to } = wolfHowlBlend(time, durations);
            expect(Math.abs(to - from)).toBeLessThanOrEqual(1);
            visited.add(from);
            visited.add(to);
        }
        expect([...visited].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        // Check actual motion on each side of every pose boundary: easing a separate
        // transition at each frame produces a stop here, even with continuous weights.
        for (let pose = 1; pose <= 8; pose++) {
            let low = start,
                high = end;
            for (let iteration = 0; iteration < 40; iteration++) {
                const middle = (low + high) / 2;
                if ((position(middle) - pose) * direction < 0) low = middle;
                else high = middle;
            }
            const crossing = (low + high) / 2;
            const before = ((position(crossing) - position(crossing - 0.1)) / 0.1) * direction;
            const after = ((position(crossing + 0.1) - position(crossing)) / 0.1) * direction;
            expect(before).toBeGreaterThan(0.001);
            expect(after).toBeGreaterThan(0.001);
            expect(Math.abs(before - after)).toBeLessThan(0.0001);
        }
    }
});

test("Wolf tail fades only at howl boundaries and keeps moving across the idle loop seam", () => {
    for (const time of [1200, 1700, 3000, 3120]) {
        expect(wolfTailMotion(time, durations).envelope).toBe(0);
    }
    expect(wolfTailMotion(500, durations).envelope).toBe(1);
    expect(wolfTailMotion(3700, durations).envelope).toBe(1);
    expect(wolfTailMotion(3700 + 6330, durations)).toEqual(wolfTailMotion(3700, durations));
    for (const time of [6330 - 0.1, 0, 0.1]) {
        expect(wolfTailMotion(time, durations).envelope).toBe(1);
    }
    const before = wolfTailMotion(6330 - 0.1, durations),
        after = wolfTailMotion(0.1, durations);
    expect(Math.abs(after.phase - before.phase)).toBeLessThan(0.002);
    for (const alongTail of [0.25, 0.5, 1]) {
        const a = Math.sin(before.phase - alongTail * 0.55) * before.envelope;
        const b = Math.sin(after.phase - alongTail * 0.55) * after.envelope;
        expect(Math.abs(b - a)).toBeLessThan(0.002);
    }
});

test("Wolf calibrates the full-body poses without any neck mesh or transparent carrier", () => {
    const sprite = new Sprite(Texture.WHITE),
        gameplay = new AlphaFilter();
    sprite.filters = [gameplay];
    for (let frame = 1; frame <= 17; frame++) {
        syncWolfIdleVisuals(sprite, frame, 1500, durations);
        expect(sprite.texture).toBe(Texture.WHITE);
        expect(sprite.children).toHaveLength(0);
        expect(sprite.filters).toEqual([gameplay]);
    }
    syncWolfIdleVisuals(sprite, -1, 4000, durations);
    expect(sprite.filters).toEqual([gameplay]);
    sprite.destroy();
});

test("Wolf matches rib cage depth, floor and material quantiles in all nine authored poses", () => {
    for (let pose = 0; pose < 9; pose++) {
        const [top, belly] = WOLF_POSE_BODY[pose];
        expect(wolfRegisteredY(top, pose)).toBe(265);
        expect(wolfRegisteredY(belly, pose)).toBe(485);
        expect(wolfRegisteredY(697, pose)).toBe(697);
        // Raising the head retains its authored proportions: above the back only translate.
        expect(wolfRegisteredY(120, pose) - wolfRegisteredY(30, pose)).toBe(90);
        for (let material = 0; material < 5; material++)
            for (let channel = 0; channel < 3; channel++) {
                const source = WOLF_POSE_QUANTILES[pose][material][channel],
                    target = WOLF_REFERENCE_QUANTILES[material][channel];
                for (let i = 1; i < source.length - 1; i++)
                    if (source[i] > source[i - 1] && source[i + 1] > source[i]) {
                        expect(wolfPaletteValue(pose, material, channel, source[i])).toBeCloseTo(target[i], 5);
                    }
            }
    }
});
