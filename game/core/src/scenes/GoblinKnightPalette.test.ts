import { afterAll, beforeAll, expect, test } from "bun:test";
import {
    goblinHitRegistration,
    syncGoblinWalkPalette,
    goblinAttackSourcePoint,
    GOBLIN_ATTACK_SUPPORT_OFFSETS,
} from "./GoblinKnightPalette";
import { DOMAdapter, Sprite, Texture } from "pixi.js";
import { GOBLIN_ATTACK_BLADES } from "./GoblinKnightAttackBlades";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Goblin attacks retain idle blade length and authored wrist position", () => {
    const sprite = new Sprite(Texture.EMPTY);
    for (const [state, poses] of Object.entries(GOBLIN_ATTACK_BLADES)) {
        for (let frame = 1; frame < 7; frame++) {
            syncGoblinWalkPalette(sprite, true, true, state, frame);
            const filter = sprite.filters?.[0] as unknown as {
                resources: { paletteSource: { uniforms: { uBlade: Float32Array; uCanvas: number; uHit: number } } };
            };
            const { uBlade: blade, uCanvas, uHit } = filter.resources.paletteSource.uniforms;
            expect(Math.hypot(blade[2] - blade[0], blade[3] - blade[1])).toBeCloseTo(Math.hypot(236, 232), 3);
            const support = GOBLIN_ATTACK_SUPPORT_OFFSETS[state as keyof typeof GOBLIN_ATTACK_SUPPORT_OFFSETS][frame];
            const sourceWrist = goblinAttackSourcePoint(blade[0], blade[1], support);
            expect(sourceWrist[0]).toBeCloseTo(poses[frame][0], 1);
            expect(sourceWrist[1]).toBeCloseTo(poses[frame][1], 1);
            expect(uCanvas).toBe(1280);
            expect(uHit).toBe(1);
        }
    }
});

test("Goblin side attack keeps its blade pointing forward through the windup", () => {
    for (const [hiltX, , tipX] of GOBLIN_ATTACK_BLADES.melee_attack) {
        expect(tipX).toBeGreaterThan(hiltX);
    }
});

test("Goblin hit keeps both sole centers on the exact idle supports", () => {
    const heights = [
        [731, 717],
        [730, 714],
        [731, 717],
        [730, 717],
        [735, 716],
        [735, 715],
        [735, 720],
        [731, 717],
    ];
    for (let frame = 0; frame < 8; frame++) {
        const [scale, offset, dyLeft, dyRight, left, right] = goblinHitRegistration(frame);
        expect(left * scale + offset).toBeCloseTo(302, 8);
        expect(right * scale + offset).toBeCloseTo(475, 8);
        expect(heights[frame][0] + dyLeft).toBe(733);
        expect(heights[frame][1] + dyRight).toBe(712);
        expect(scale).toBeLessThanOrEqual(1);
    }
});

test("Goblin attacks register both supports independently without stretching the torso", () => {
    for (const frames of Object.values(GOBLIN_ATTACK_SUPPORT_OFFSETS)) {
        for (const offset of frames) {
            expect(goblinAttackSourcePoint(313, 732, offset)).toEqual([313 + offset[0], 732 + offset[2]]);
            expect(goblinAttackSourcePoint(491, 711, offset)).toEqual([491 + offset[1], 711 + offset[3]]);
            for (const [x, y] of [
                [300, 200],
                [500, 200],
                [400, 400],
            ]) {
                expect(goblinAttackSourcePoint(x, y, offset)).toEqual([x, y]);
            }
            // Translation preserves each boot's width; the gap between legs absorbs stance differences.
            expect(goblinAttackSourcePoint(330, 710, offset)[0] - goblinAttackSourcePoint(280, 710, offset)[0]).toBe(
                50,
            );
            expect(goblinAttackSourcePoint(530, 710, offset)[0] - goblinAttackSourcePoint(470, 710, offset)[0]).toBe(
                60,
            );
        }
    }
});
