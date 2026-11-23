import { beforeAll, expect, spyOn, test } from "bun:test";
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { blackDragonFireFrame, blackDragonFireState, syncBlackDragonFireBreath } from "./BlackDragonFireBreath";
import { BlackDragonFireFlowFilter } from "./BlackDragonFireFlowFilter";
import { BLACK_DRAGON_FIRE_MOUTHS } from "./BlackDragonFireAnchors";
import { recordAtlasFrameDivider } from "./authoredFramePixels";
import { BLACK_DRAGON_FIRE_START_MS, BLACK_DRAGON_FIRE_END_MS, BLACK_DRAGON_FIRE_SPEED } from "./BlackDragonFireTiming";

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

test("a body atlas loaded at half size breathes from the same mouth", () => {
    const fire = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 1280, height: 1280 }),
    });
    const flameAt = (size: number, scale: number) => {
        const root = new Container();
        const texture = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: size, height: size }),
        });
        recordAtlasFrameDivider(texture, 1024 / size);
        const body = new Sprite(texture);
        body.anchor.set(0.5, 858 / 1024);
        body.scale.set(scale, -scale);
        root.addChild(body);
        syncBlackDragonFireBreath(body, "attack", 12, 0, 100, fire);
        const flame = root.children[1] as Sprite;
        const at = { x: flame.x, y: flame.y, rotation: flame.rotation };
        root.destroy({ children: true });
        return at;
    };
    const full = flameAt(1024, 0.3);
    const half = flameAt(512, 0.6);
    expect(half.x).toBeCloseTo(full.x, 5);
    expect(half.y).toBeCloseTo(full.y, 5);
    expect(half.rotation).toBeCloseTo(full.rotation, 5);
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
