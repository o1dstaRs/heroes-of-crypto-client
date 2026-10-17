import { expect, test } from "bun:test";
import { animationAtlases } from "../generated/animation_atlases";
import {
    ANGEL_CAST_SPEED,
    ANGEL_CAST_DURATION_MS,
    angelCastAura,
    angelIdleCanvasRegistration,
    angelActionCanvasRegistration,
} from "./AngelBlessingIdle";

test("breathing idle is separate from the accelerated sword cast", () => {
    expect(animationAtlases["Angel Lab"].idle.frameCount).toBe(24);
    const durations = animationAtlases["Angel Lab"].cast.frameDurationsMs!;
    expect(durations).toHaveLength(19);
    expect(ANGEL_CAST_DURATION_MS).toBeCloseTo(2400 / 1.4 / 1.25 / 1.5);
    expect(durations.reduce((sum, duration) => sum + duration, 0)).toBeCloseTo(ANGEL_CAST_DURATION_MS);
    expect(durations[9]).toBeCloseTo(960 / ANGEL_CAST_SPEED);
});

test("cast aura peaks during its overhead hold and never repeats with idle time", () => {
    for (const time of [0, 1080, 2040, 3120, 6000, -1, NaN]) expect(angelCastAura(time / ANGEL_CAST_SPEED)).toBe(0);
    for (const time of [1320, 1560, 1820]) expect(angelCastAura(time / ANGEL_CAST_SPEED)).toBeCloseTo(1);
    expect(angelCastAura(1200 / ANGEL_CAST_SPEED)).toBeCloseTo(0.5);
    expect(angelCastAura(1930 / ANGEL_CAST_SPEED)).toBeCloseTo(0.5);
});

test("padded action canvases preserve body and foot registration at every tier", () => {
    for (const divider of [1, 2, 4]) {
        const { orig, trim } = angelIdleCanvasRegistration(768 / divider, 1280 / divider);
        expect(orig.width).toBe(768 / divider);
        expect(orig.height).toBe(768 / divider);
        expect(trim.y + 512 / divider).toBe(0);
        expect(trim.y + 1247 / divider).toBe(735 / divider);
        const reaction = angelActionCanvasRegistration(1024 / divider, 896 / divider);
        expect(reaction.orig.width).toBe(768 / divider);
        expect(reaction.trim.x + 128 / divider).toBe(0);
        expect(reaction.trim.y + 863 / divider).toBe(735 / divider);
    }
});
