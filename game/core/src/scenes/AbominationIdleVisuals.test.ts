import { afterAll, beforeAll, expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";
import { BufferImageSource, DOMAdapter, Sprite, Texture } from "pixi.js";
import { AbominationIdleFilter, abominationIdleMotion, abominationIdleOffset } from "./AbominationIdleVisuals";
import { teamFlagPalette } from "./teamColors";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("breathing and scanning keep planted contacts fixed through a full gesture cycle", () => {
    for (let ms = 0; ms <= 18000; ms += 125) {
        expect(abominationIdleOffset(267, 729, ms)).toEqual([0, 0]);
        expect(abominationIdleOffset(498, 670, ms)).toEqual([0, 0]);
    }
    expect(abominationIdleOffset(419, 68, 950)[1]).toBeGreaterThan(6);
    expect(abominationIdleOffset(419, 68, 2850)[1]).toBeLessThan(-6);
    expect(abominationIdleMotion(2600)[2]).toBeCloseTo(1);
    expect(abominationIdleMotion(7800)[2]).toBeCloseTo(-1);
    expect(abominationIdleMotion(0)[3]).toBe(0);
    expect(abominationIdleMotion(4000)[3]).toBe(1);
    expect(abominationIdleMotion(8000)[3]).toBe(0);
    expect(abominationIdleMotion(Number.NaN)).toEqual([0, 0, 0, 0]);
});

test("cloth root stays attached while its free hem follows the shared flag wave", () => {
    const a = abominationIdleOffset(421, 610, 0);
    const b = abominationIdleOffset(421, 610, 1000);
    expect(Math.abs(a[0] - b[0])).toBeGreaterThan(8);
    expect(abominationIdleOffset(420, 402, 0)).toEqual([0, 0]);
});

test("uses actual army flag colors and a full-resolution open hand without altering source texture", () => {
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(768 * 768 * 4), width: 768, height: 768 }),
    });
    const sprite = new Sprite(texture);
    const filter = new AbominationIdleFilter(sprite);
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        filter.update(true, 4000, team, texture);
        expect(filter.resources.idle.uniforms.uReady).toBe(1);
        expect(filter.resources.idle.uniforms.uMotion[3]).toBe(1);
        const color = teamFlagPalette(team).edge;
        expect(filter.resources.idle.uniforms.uClothEdge[0]).toBeCloseTo(((color >> 16) & 255) / 255);
        expect(filter.resources.idle.uniforms.uClothEdge[1]).toBeCloseTo(((color >> 8) & 255) / 255);
    }
    expect(sprite.texture).toBe(texture);
    filter.destroy();
    sprite.destroy();
    texture.destroy(true);
});
