import { afterAll, beforeAll, expect, test } from "bun:test";
import { Container, DOMAdapter, Sprite, Texture, TextureSource } from "pixi.js";
import { SkewerSpears, skewerSpearEnvelope, type SkewerSpearPose } from "./SkewerSpear";
import { RenderableUnit } from "../RenderableUnit";
import { Sandbox } from "../Sandbox";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("extension grows during the thrust, reaches exactly its endpoint, and disappears before recovery", () => {
    expect(skewerSpearEnvelope(1.99).alpha).toBe(0);
    let previous = 0;
    for (let p = 2; p <= 2.7; p += 0.05) {
        const e = skewerSpearEnvelope(p);
        expect(e.reach).toBeGreaterThanOrEqual(previous);
        expect(e.reach).toBeLessThanOrEqual(1);
        previous = e.reach;
    }
    expect(skewerSpearEnvelope(3.2)).toEqual({ reach: 1, alpha: 1 });
    expect(skewerSpearEnvelope(4).alpha).toBe(0);
});

test.each([1, -1])("tip follows the actual mirrored sprite and authored cel clock, facing %s", (facing) => {
    const parent = new Container();
    parent.scale.set(-0.5, -0.3);
    const texture = new Texture({ source: new TextureSource({ width: 1280, height: 768 }) });
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.96875);
    sprite.scale.set(facing * 0.2, -0.2);
    sprite.position.set(300, 400);
    parent.addChild(sprite);
    const action = {
        stateName: "melee_attack",
        frames: Array(6).fill(texture),
        frameIndex: 2,
        elapsed: 30,
        frameDurationsMs: [50, 100, 60, 120, 170, 130],
    };
    const unit = Object.assign(Object.create(RenderableUnit.prototype), {
        sprite,
        oneShotAnim: action,
        getName: () => "Pikeman",
    }) as RenderableUnit;
    const pose = unit.getSkewerSpearPose()!;
    expect(pose.phase).toBe(2.5);
    expect(pose.origin.x).toBeCloseTo(300 + (1172 - 640) * facing * 0.2);
    expect(pose.origin.y).toBeCloseTo(400 + (327 - 744) * -0.2);
    // The extension is collinear with, and exactly 35% of, the painted full shaft.
    expect(pose.end.x - pose.origin.x).toBeCloseTo((1172 - 360) * facing * 0.2 * 0.35);
    expect(pose.end.y - pose.origin.y).toBeCloseTo((327 - 310) * -0.2 * 0.35);
    action.stateName = "hit";
    expect(unit.getSkewerSpearPose()).toBeUndefined();
    parent.destroy({ children: true });
    texture.destroy(true);
});

test("retarget, cancellation and repeated teardown release owned geometry and shader", () => {
    const root = new Container();
    let pose: SkewerSpearPose | undefined = { origin: { x: 40, y: 90 }, phase: 3 };
    const effect = new SkewerSpears((c) => root.addChild(c));
    effect.spawn("a", { x: 200, y: 170 }, 64, () => pose);
    const old = root.children[0];
    expect(effect.active).toBe(true);
    expect(old.rotation).toBeCloseTo(Math.atan2(80, 160));
    effect.spawn("a", { x: -200, y: -20 }, 64, () => pose);
    expect(old.destroyed).toBe(true);
    expect(root.children).toHaveLength(1);
    pose = undefined;
    effect.update();
    expect(root.children).toHaveLength(0);
    expect(effect.active).toBe(false);
    pose = { origin: { x: 0, y: 0 }, phase: 3 };
    for (let i = 0; i < 40; i++) effect.spawn(String(i), { x: 200, y: 0 }, 64, () => pose);
    expect(root.children).toHaveLength(16);
    effect.clear();
    effect.clear();
    expect(root.children).toHaveLength(0);
    root.destroy();
});

test("combat uses recorded pierced positions, rejects the response's opposite side and ordinary hits", () => {
    const calls: unknown[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        spawnPikemanSpearToCell: (_a: unknown, p: unknown) => calls.push(p),
    });
    const source = {
        getId: () => "pikeman",
        getName: () => "Pikeman",
        hasAbilityActive: () => true,
        getPosition: () => ({ x: 0, y: 0 }),
    };
    const target = { getPosition: () => ({ x: 64, y: 0 }) };
    const hit = (x: number) => ({
        source: "skewer_strike",
        position: { x, y: 0 },
        unitId: "already-removed-victim",
        amount: 10,
        unitsDied: 1,
    });
    scene.spawnSkewerWindSpearVfx(source, target, { secondary: [hit(-128)] });
    expect(calls).toHaveLength(0);
    scene.spawnSkewerWindSpearVfx(source, target, { secondary: [hit(-128), hit(128)] });
    expect(calls).toEqual([{ x: 128, y: 0 }]);
    scene.spawnSkewerWindSpearVfx(source, target, { secondary: [] });
    expect(calls).toHaveLength(1);
    scene.spawnSkewerWindSpearVfx(source, target, { secondary: [{ ...hit(128), amount: 0 }] });
    expect(calls).toHaveLength(2); // Mermaid shield absorbed the real pierced contact.
    scene.spawnSkewerWindSpearVfx(source, target, { secondary: [{ ...hit(128), source: "fire_breath" }] });
    scene.spawnSkewerWindSpearVfx(source, target, { secondary: [hit(64)] });
    scene.spawnSkewerWindSpearVfx(source, target, undefined);
    expect(calls).toHaveLength(2);
    const barrel = {
        type: "obstacle_attacked",
        source: "skewer_strike",
        attackerId: "pikeman",
        targetPosition: { x: 128, y: 0 },
    };
    scene.spawnSkewerWindSpearVfx(source, target, undefined, [barrel]);
    expect(calls).toHaveLength(3);
    scene.spawnSkewerWindSpearVfx(source, target, undefined, [{ ...barrel, attackerId: "someone-else" }]);
    scene.spawnSkewerWindSpearVfx(source, target, undefined, [{ ...barrel, targetPosition: { x: 128, y: 64 } }]);
    scene.spawnSkewerWindSpearVfx(source, target, undefined, [{ ...barrel, source: "fire_breath" }]);
    scene.spawnSkewerWindSpearVfx(source, target, undefined, [{ ...barrel, source: undefined }]);
    expect(calls).toHaveLength(3);
    scene.spawnSkewerWindSpearVfx(source, target, undefined, [{ ...barrel, source: undefined }], true);
    expect(calls).toHaveLength(4); // A barrel aimed at, then another barrel pierced behind it.
});
