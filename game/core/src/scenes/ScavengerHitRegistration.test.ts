import { afterAll, beforeAll, expect, test } from "bun:test";
import { BufferImageSource, DOMAdapter, Point, Sprite, Texture } from "pixi.js";

import {
    applyScavengerHitRegistration,
    clearScavengerHitRegistration,
    scavengerHitRegisteredSoles,
    SCAVENGER_IDLE_SOLES,
} from "./ScavengerHitRegistration";

const originalAdapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({
        ...originalAdapter,
        createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
    }),
);
afterAll(() => DOMAdapter.set(originalAdapter));

const texture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 192, height: 192 }),
});
const solePosition = (sprite: Sprite, point: readonly number[]) =>
    sprite.toGlobal(new Point(point[0] / 4 - sprite.anchor.x * 192, point[1] / 4 - sprite.anchor.y * 192));

test("locks both soles through all hit frames in both facings, including skipped frames", () => {
    for (const facing of [-1, 1]) {
        const sprite = new Sprite(texture);
        sprite.position.set(240, 350);
        sprite.scale.set(facing * 0.7, -0.6);
        sprite.anchor.set(0.5, (744 - (38 * 700) / 757) / 768);
        const expected = SCAVENGER_IDLE_SOLES.map((sole) => solePosition(sprite, sole));
        for (const frame of [0, 1, 2, 3, 4, 5, 6, 7, 0, 5, 7]) {
            applyScavengerHitRegistration(sprite, frame);
            scavengerHitRegisteredSoles(frame).forEach((sole, index) => {
                const actual = solePosition(sprite, sole);
                expect(actual.x).toBeCloseTo(expected[index].x, 5);
                expect(actual.y).toBeCloseTo(expected[index].y, 5);
            });
            expect(sprite.scale.y).toBe(-0.6);
            expect(sprite.scale.x).toBe(facing * 0.7);
            expect(sprite.skew.y).toBe(0);
            expect(sprite.rotation).toBe(0);
        }
        clearScavengerHitRegistration(sprite);
        expect(sprite.scale.x).toBeCloseTo(facing * 0.7, 8);
        expect(sprite.skew.y).toBeCloseTo(0, 8);
        expect(sprite.anchor.x).toBe(0.5);
        SCAVENGER_IDLE_SOLES.forEach((sole, index) => {
            const actual = solePosition(sprite, sole);
            expect(actual.x).toBeCloseTo(expected[index].x, 5);
            expect(actual.y).toBeCloseTo(expected[index].y, 5);
        });
    }
});
