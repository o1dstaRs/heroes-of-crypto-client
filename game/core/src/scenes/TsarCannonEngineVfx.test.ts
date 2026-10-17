import { afterAll, beforeAll, expect, test } from "bun:test";
import { BufferImageSource, Container, DOMAdapter, Sprite, Texture } from "pixi.js";
import { syncCannonEngineVfx } from "./TsarCannonEngineVfx";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
function setup() {
    const world = new Container();
    const body = new Sprite(
        new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width: 1024, height: 1024 }) }),
    );
    world.addChild(body);
    body.anchor.set(0.5, 0.83);
    body.scale.set(-0.2, -0.2);
    body.position.set(220, 350);
    return { body, world, bursts: () => world.children.filter((c) => c.label.startsWith("tsar-cannon-engine-")) };
}
test("hit sparks fire once per impact, persist into idle, expire and clean up on body destruction", () => {
    const { body, bursts } = setup();
    const first = {},
        second = {};
    for (let frame = 0; frame < 8; frame++)
        syncCannonEngineVfx(body, frame * 20, {
            stateName: "hit",
            frameIndex: frame,
            progress: frame / 7,
            instance: first,
        });
    expect(bursts()).toHaveLength(1);
    expect([bursts()[0].x, bursts()[0].y]).toEqual([body.x, body.y]);
    expect([bursts()[0].scale.x, bursts()[0].scale.y]).toEqual([body.scale.x, body.scale.y]);
    syncCannonEngineVfx(body, 200);
    expect(bursts()).toHaveLength(1);
    syncCannonEngineVfx(body, 250, { stateName: "hit", frameIndex: 0, progress: 0, instance: second });
    expect(bursts()).toHaveLength(2);
    syncCannonEngineVfx(body, 700);
    expect(bursts()).toHaveLength(1);
    const last = bursts()[0];
    body.destroy();
    expect(last.destroyed).toBe(true);
});
test("all muzzle directions release exactly once at the shot cel; melee stays effect-free", () => {
    for (const stateName of [
        "attack",
        "attack_up",
        "attack_down",
        "melee_attack",
        "melee_attack_up",
        "melee_attack_down",
    ]) {
        const { body, bursts } = setup();
        const instance = {},
            texture = body.texture;
        for (let frameIndex = 0; frameIndex < 24; frameIndex++) {
            syncCannonEngineVfx(body, frameIndex * 20, { stateName, frameIndex, progress: frameIndex / 23, instance });
            expect(bursts()).toHaveLength(stateName.startsWith("attack") && frameIndex >= 4 ? 1 : 0);
            expect(body.texture).toBe(texture);
            expect(body.scale.x).toBe(-0.2);
        }
        syncCannonEngineVfx(body, 1600);
        expect(bursts()).toHaveLength(0);
        body.destroy();
    }
});
test("death clears remaining muzzle gases and repeated impacts cannot grow an unbounded particle pool", () => {
    const { body, bursts } = setup();
    for (let i = 0; i < 10; i++)
        syncCannonEngineVfx(body, i, { stateName: "hit", frameIndex: 0, progress: 0, instance: {} });
    expect(bursts()).toHaveLength(4);
    syncCannonEngineVfx(body, 20, { stateName: "death", frameIndex: 0, progress: 0 });
    expect(bursts()).toHaveLength(0);
    body.destroy();
});
