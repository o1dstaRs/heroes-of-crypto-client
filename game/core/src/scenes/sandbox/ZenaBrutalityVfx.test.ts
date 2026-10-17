import { describe, expect, test } from "bun:test";
import { Container, Graphics, Sprite, Texture, TextureSource } from "pixi.js";
import { ZenaBrutalityVfx, type BrutalityPose } from "./ZenaBrutalityVfx";
import { BRUTALITY_ANATOMY } from "./brutality_anatomy";
import { FINAL_STATIC_BATTLEFIELD_TEXTURES } from "../../pixi/battlefieldTextureKeys";

const setup = (stretch = 1, facing = 1) => {
    const texture = new Texture({ source: new TextureSource({ width: 512, height: 512 }) });
    const world = new Container();
    world.scale.set(1, -1 / stretch);
    const pose: BrutalityPose = {
        texture,
        x: 150,
        y: 200,
        anchorX: 0.5,
        anchorY: 0.97,
        scaleX: facing * 0.5,
        scaleY: -0.5 * stretch,
    };
    const effect = new ZenaBrutalityVfx((container) => {
        world.addChild(container);
        return stretch;
    });
    return { texture, world, pose, effect };
};

describe("Zena brutality", () => {
    test.each([-1, 1])("the victim's real head lifts, spins away from the strike and lands, facing=%s", (facing) => {
        const { effect, pose, world, texture } = setup(1, facing);
        expect(effect.spawn(pose, "Peasant", 128, { x: facing, y: 0 })).toBe(true);
        const root = world.children[0];
        const head = root.getChildByLabel("severed-head")!;
        const start = { x: head.x, y: head.y };
        const body = root.getChildByLabel("headless-body")!;
        expect((body.children[0] as Sprite).texture).toBe(texture);
        expect(((head.children[0] as Container).children[0] as Sprite).texture).toBe(texture);
        expect(body.mask).toBeInstanceOf(Graphics);
        expect((head.children[0] as Container).mask).toBeInstanceOf(Graphics);
        effect.update(0.2 / 1.2);
        expect((head.x - start.x) * facing).toBeGreaterThan(0);
        expect(head.y).toBeGreaterThan(start.y);
        expect(Math.abs(head.rotation)).toBeGreaterThan(1);
        effect.update(0.74 / 1.2);
        expect(head.y).toBeCloseTo(0, 5);
        effect.update(0.13 / 1.2);
        expect(head.y).toBeGreaterThan(0);
        effect.update(0.13 / 1.2);
        expect(head.y).toBeCloseTo(0, 5);
        expect(body.alpha).toBe(0);
        effect.clear();
        texture.destroy(true);
    });

    test.each([1, 1.8])("initial split preserves the exact world pose and artwork aspect, stretch=%s", (stretch) => {
        const { effect, pose, world, texture } = setup(stretch);
        effect.spawn(pose, "Wolf", 128, { x: -1, y: 0.5 });
        const root = world.children[0];
        const head = root.getChildByLabel("severed-head")!;
        const [left, top, right, bottom] = BRUTALITY_ANATOMY.Wolf.head;
        const expected = {
            x: pose.x + ((left + right) / 2 - pose.anchorX) * texture.width * pose.scaleX,
            y: (pose.y + ((top + bottom) / 2 - pose.anchorY) * texture.height * pose.scaleY) * world.scale.y,
        };
        const global = head.toGlobal({ x: 0, y: 0 });
        expect(global.x).toBeCloseTo(expected.x, 5);
        expect(global.y).toBeCloseTo(expected.y, 5);
        const sprite = root.getChildByLabel("headless-body")!.children[0] as Sprite;
        expect(Math.abs(sprite.getGlobalTransform().a)).toBeCloseTo(0.5, 5);
        expect(Math.abs(sprite.getGlobalTransform().d)).toBeCloseTo(0.5, 5);
        effect.clear();
        texture.destroy(true);
    });

    test("expiry and repeated clears release every effect child without destroying shared creature textures", () => {
        const { effect, pose, world, texture } = setup();
        effect.spawn(pose, "Manticore", 128, { x: 1, y: 1 });
        const root = world.children[0];
        const head = root.getChildByLabel("severed-head")!;
        expect(effect.active).toBe(true);
        effect.update(2.65 / 1.2 - 0.001);
        expect(effect.active).toBe(true);
        expect(root.destroyed).toBe(false);
        effect.update(0.002);
        expect(effect.active).toBe(false);
        expect(root.destroyed).toBe(true);
        expect(head.destroyed).toBe(true);
        expect(texture.destroyed).toBe(false);
        effect.spawn(pose, "Elf", 128, { x: -1, y: 0 });
        const second = world.children[0];
        effect.clear();
        effect.clear();
        expect(second.destroyed).toBe(true);
        expect(texture.source.destroyed).toBe(false);
        texture.destroy(true);
    });

    test("an army-wide kill stays bounded and the cannon ejects its muzzle using the same art", () => {
        const { effect, pose, world, texture } = setup();
        expect(effect.spawn({ ...pose, texture: Texture.WHITE }, "Peasant", 128, { x: 1, y: 0 })).toBe(false);
        expect(world.children).toHaveLength(0);
        expect(effect.spawn(pose, "Tsar Cannon", 128, { x: 1, y: 0 })).toBe(true);
        const oldest = world.children[0];
        const muzzle = oldest.getChildByLabel("severed-head")!.children[0].children[0] as Sprite;
        expect(muzzle.texture).toBe(texture);
        for (let i = 0; i < 30; i++) effect.spawn(pose, "Peasant", 128, { x: 1, y: 0 });
        expect(world.children).toHaveLength(24);
        expect(oldest.destroyed).toBe(true);
        expect(texture.destroyed).toBe(false);
        effect.clear();
        texture.destroy(true);
    });

    test("every current battlefield creature has an explicit severed part", () => {
        const names = new Set(Object.keys(BRUTALITY_ANATOMY).map((name) => name.toLowerCase().replaceAll(" ", "_")));
        for (const name of Object.keys(FINAL_STATIC_BATTLEFIELD_TEXTURES)) {
            expect(names.has(name)).toBe(true);
        }
        for (const { head, neck } of Object.values(BRUTALITY_ANATOMY)) {
            expect(head[0]).toBeLessThan(head[2]);
            expect(head[1]).toBeLessThan(head[3]);
            expect(head.every((value) => value >= 0 && value <= 1)).toBe(true);
            if (neck) expect(neck.every((value) => value >= 0 && value <= 1)).toBe(true);
        }
    });
});
