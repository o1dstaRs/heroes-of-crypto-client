import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { DOMAdapter, Sprite, Texture } from "pixi.js";
import {
    SPIDER_IDLE_LEGS,
    SPIDER_IDLE_PERIOD_MS,
    spiderIdleCrouch,
    spiderIdleKnee,
    syncArachnaSpiderLabIdle,
    ArachnaSpiderIdleFilter,
} from "./ArachnaSpiderLabIdle";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("spider idle keeps both leg segments rigid through every crouch phase", () => {
    for (let t = 0; t <= SPIDER_IDLE_PERIOD_MS; t += 50) {
        const crouch = spiderIdleCrouch(t);
        expect(crouch).toBeGreaterThanOrEqual(0);
        expect(crouch).toBeLessThanOrEqual(10);
        for (const leg of SPIDER_IDLE_LEGS) {
            const [root, knee, foot] = leg;
            const next = spiderIdleKnee(leg, crouch);
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
    expect(spiderIdleCrouch(0)).toBe(spiderIdleCrouch(SPIDER_IDLE_PERIOD_MS));
    expect(spiderIdleCrouch(NaN)).toBe(0);
});
test("spider idle filter detaches during actions, reuses its instance and releases GPU resources", () => {
    const sprite = new Sprite(Texture.WHITE);
    syncArachnaSpiderLabIdle(sprite, true, 800);
    const filter = sprite.filters?.[0] as ArachnaSpiderIdleFilter;
    expect(filter).toBeInstanceOf(ArachnaSpiderIdleFilter);
    expect(filter.resources.queen.uniforms.uCrouch).toBeCloseTo(5);
    syncArachnaSpiderLabIdle(sprite, false, 900);
    expect(sprite.filters?.length ?? 0).toBe(0);
    syncArachnaSpiderLabIdle(sprite, true, 1600);
    expect(sprite.filters?.[0]).toBe(filter);
    expect(filter.resources.queen.uniforms.uCrouch).toBe(10);
    const destroy = spyOn(filter, "destroy");
    sprite.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
});
