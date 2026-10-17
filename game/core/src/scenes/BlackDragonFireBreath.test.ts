import { beforeAll, expect, spyOn, test } from "bun:test";
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { blackDragonFireFrame, blackDragonFireState, syncBlackDragonFireBreath } from "./BlackDragonFireBreath";
import { BlackDragonFireFlowFilter } from "./BlackDragonFireFlowFilter";
import { BLACK_DRAGON_FIRE_MOUTHS } from "./BlackDragonFireAnchors";
import {
    blackDragonAttackElapsedMs,
    BLACK_DRAGON_ATTACK_FRAME_DURATIONS_MS,
    BLACK_DRAGON_FIRE_START_MS,
    BLACK_DRAGON_FIRE_END_MS,
    BLACK_DRAGON_ATTACK_SPEED,
    BLACK_DRAGON_FIRE_SPEED,
    BLACK_DRAGON_ATTACK_DURATION_MS,
} from "./BlackDragonFireTiming";
import { animationAtlases } from "../generated/animation_atlases";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            createElement: () => ({ getContext: () => null }),
        };
});

test("all three melee and preview directions share the registered 32-frame action", () => {
    for (const direction of ["", "_up", "_down"]) {
        expect(blackDragonFireState(`attack${direction}`)).toBe(`attack${direction}`);
        expect(blackDragonFireState(`melee_attack${direction}`)).toBe(`attack${direction}`);
        const mouths = BLACK_DRAGON_FIRE_MOUTHS[`attack${direction}`];
        expect(mouths).toHaveLength(32);
        mouths[0].forEach((value, index) => expect(value).toBeCloseTo(mouths[31][index], 6));
    }
    expect(blackDragonFireState("hit")).toBeUndefined();
    expect(blackDragonFireFrame(BLACK_DRAGON_FIRE_START_MS - 1)).toBeUndefined();
    expect(blackDragonFireFrame(BLACK_DRAGON_FIRE_START_MS)).toBe(0);
    expect(blackDragonFireFrame(BLACK_DRAGON_FIRE_END_MS - 1)).toBe(15);
    expect(blackDragonFireFrame(BLACK_DRAGON_FIRE_END_MS)).toBeUndefined();
    expect(blackDragonFireFrame(NaN)).toBeUndefined();
});

test("all three complete attacks take 950ms without dropping cels or changing phase proportions", () => {
    expect(BLACK_DRAGON_FIRE_START_MS).toBeCloseTo(300 / 1.38 / BLACK_DRAGON_ATTACK_SPEED);
    expect(BLACK_DRAGON_FIRE_END_MS - BLACK_DRAGON_FIRE_START_MS).toBeCloseTo(
        1000 / 1.35 / BLACK_DRAGON_ATTACK_SPEED,
        8,
    );
    for (const state of ["attack", "attack_up", "attack_down"]) {
        const durations = animationAtlases["Black Dragon Lab"][state].frameDurationsMs!;
        expect(durations).toEqual(BLACK_DRAGON_ATTACK_FRAME_DURATIONS_MS);
        let elapsed = 0;
        durations.forEach((duration, frame) => {
            expect(blackDragonAttackElapsedMs(frame, 0)).toBeCloseTo(elapsed, 5);
            elapsed += duration;
        });
        expect(elapsed).toBeCloseTo(950, 8);
        expect(elapsed).toBeCloseTo(BLACK_DRAGON_ATTACK_DURATION_MS, 8);
        expect(durations).toHaveLength(32);
        durations.forEach((duration, index) => {
            const previous = index < 6 ? 50 / 1.38 : index < 26 ? 50 / 1.35 : 50;
            expect(duration / previous).toBeCloseTo(1 / BLACK_DRAGON_ATTACK_SPEED, 8);
        });
        expect(durations.slice(26)).toEqual(Array(6).fill(50 / BLACK_DRAGON_ATTACK_SPEED));
    }
    expect(
        blackDragonFireFrame(blackDragonAttackElapsedMs(5, 50 / 1.38 / BLACK_DRAGON_ATTACK_SPEED - 0.01)),
    ).toBeUndefined();
    expect(blackDragonFireFrame(blackDragonAttackElapsedMs(6, 0))).toBe(0);
    expect(blackDragonFireFrame(blackDragonAttackElapsedMs(25, 50 / BLACK_DRAGON_FIRE_SPEED - 0.01))).toBe(15);
    expect(blackDragonFireFrame(blackDragonAttackElapsedMs(26, 0))).toBeUndefined();
});

test("flame follows the mouth and facing without changing creature bounds, then cancels on hit", () => {
    const root = new Container();
    const body = new Sprite(
        new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width: 1024, height: 1024 }) }),
    );
    const fire = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 1280, height: 1280 }),
    });
    body.anchor.set(0.5, 858 / 1024);
    body.scale.set(0.3, -0.3);
    root.addChild(body);
    const before = body.getLocalBounds().clone();
    for (const facing of [1, -1])
        for (const state of ["attack", "attack_up", "attack_down"]) {
            body.scale.x = 0.3 * facing;
            syncBlackDragonFireBreath(body, state, 12, 0, 100, fire);
            expect(root.children).toHaveLength(2);
            const flame = root.children[1] as Sprite;
            const flow = flame.filters![0] as BlackDragonFireFlowFilter;
            expect(flow.resources.fire.uniforms.uProcedural).toBe(1);
            expect(flame.visible).toBe(true);
            expect(body.getLocalBounds()).toEqual(before);
            const [x, y] = BLACK_DRAGON_FIRE_MOUTHS[state][12];
            const mouth = root.toLocal(body.toGlobal({ x: x - 512, y: y - 858 }));
            expect(flame.x).toBeCloseTo(mouth.x, 5);
            expect(flame.y).toBeCloseTo(mouth.y, 5);
            expect(Math.sign(Math.cos(flame.rotation))).toBe(facing);
            if (state.endsWith("_up")) expect(Math.sin(flame.rotation)).toBeGreaterThan(0);
            if (state.endsWith("_down")) expect(Math.sin(flame.rotation)).toBeLessThan(0);
            expect(Math.abs(flame.width) * 0.78).toBeCloseTo(260, 4);
            expect(Math.abs(flame.height) * 0.4).toBeCloseTo(140, 4);
            syncBlackDragonFireBreath(body, "hit", 0, 0, 100, fire);
            expect(flame.visible).toBe(false);
        }
    const flame = root.children[1];
    body.destroy();
    expect(flame.destroyed).toBe(true);
    root.destroy();
    fire.destroy(true);
});

test("GPU flow advances between body cels, reuses its resources and releases them with the body", () => {
    const root = new Container();
    const body = new Sprite(Texture.WHITE);
    root.addChild(body);
    const atlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 1280, height: 1280 }),
    });
    syncBlackDragonFireBreath(body, "attack", 10, 0, 70, atlas);
    const flame = root.children[1] as Sprite;
    const flow = flame.filters![0] as BlackDragonFireFlowFilter;
    expect(flow).toBeInstanceOf(BlackDragonFireFlowFilter);
    const destroy = spyOn(flow, "destroy");
    const frame = flow.resources.fire.uniforms.uFrame;
    const bodyBounds = body.getLocalBounds().clone();
    syncBlackDragonFireBreath(body, "attack", 10, 24, 70, atlas);
    expect(flame.filters![0]).toBe(flow);
    expect(flow.resources.fire.uniforms.uFrame).toBeGreaterThan(frame);
    expect(flow.resources.fire.uniforms.uTime).toBeCloseTo(0.5 + (24 * BLACK_DRAGON_FIRE_SPEED) / 1000);
    expect(flow.blendRequired).toBe(true);
    expect(body.getLocalBounds()).toEqual(bodyBounds);
    syncBlackDragonFireBreath(body, "death", 0, 0, 70, atlas);
    expect(flame.visible).toBe(false);
    syncBlackDragonFireBreath(body, "attack_up", 6, 0, 70, atlas);
    expect(root.children).toHaveLength(2);
    expect(flame.filters![0]).toBe(flow);
    expect(flow.resources.fire.uniforms.uFrame).toBe(0);
    expect(flow.resources.fire.uniforms.uProcedural).toBe(1);
    syncBlackDragonFireBreath(body, "melee_attack_down", 12, 0, 70, atlas);
    expect(flow.resources.fire.uniforms.uProcedural).toBe(1);
    body.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(flame.destroyed).toBe(true);
    root.destroy();
    atlas.destroy(true);
});
