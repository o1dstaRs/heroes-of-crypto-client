import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { DOMAdapter, Sprite, Texture } from "pixi.js";
import {
    QUEEN_IDLE_LEGS,
    QUEEN_IDLE_PERIOD_MS,
    queenIdleCrouch,
    queenIdleKnee,
    syncArachnaQueenLabIdle,
    ArachnaQueenIdleFilter,
} from "./ArachnaQueenLabIdle";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("queen idle keeps both leg segments rigid through every crouch phase", () => {
    for (let t = 0; t <= QUEEN_IDLE_PERIOD_MS; t += 50) {
        const crouch = queenIdleCrouch(t);
        expect(crouch).toBeGreaterThanOrEqual(0);
        expect(crouch).toBeLessThanOrEqual(15);
        for (const leg of QUEEN_IDLE_LEGS) {
            const [root, knee, foot] = leg;
            const next = queenIdleKnee(leg, crouch);
            expect(Math.hypot(next[0] - root[0], next[1] - root[1] - crouch)).toBeCloseTo(
                Math.hypot(knee[0] - root[0], knee[1] - root[1]),
                8,
            );
            expect(Math.hypot(next[0] - foot[0], next[1] - foot[1])).toBeCloseTo(
                Math.hypot(knee[0] - foot[0], knee[1] - foot[1]),
                8,
            );
        }
    }
    expect(queenIdleCrouch(0)).toBe(queenIdleCrouch(QUEEN_IDLE_PERIOD_MS));
    expect(queenIdleCrouch(NaN)).toBe(0);
});
test("queen idle filter detaches during actions, reuses its instance and releases GPU resources", () => {
    const sprite = new Sprite(Texture.WHITE);
    syncArachnaQueenLabIdle(sprite, true, 800);
    const filter = sprite.filters?.[0] as ArachnaQueenIdleFilter;
    expect(filter).toBeInstanceOf(ArachnaQueenIdleFilter);
    expect(filter.resources.queen.uniforms.uCrouch).toBeCloseTo(7.5);
    syncArachnaQueenLabIdle(sprite, false, 900);
    expect(sprite.filters?.length ?? 0).toBe(0);
    syncArachnaQueenLabIdle(sprite, true, 1600);
    expect(sprite.filters?.[0]).toBe(filter);
    expect(filter.resources.queen.uniforms.uCrouch).toBe(15);
    const destroy = spyOn(filter, "destroy");
    sprite.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
});
