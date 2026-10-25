import { expect, test } from "bun:test";
import { Container, Sprite, Texture, TextureSource } from "pixi.js";
import { StunStars, STUN_STAR_COUNT, stunStarPose } from "./StunStars";

test.each([1, -1])(
    "stars orbit the flag centre and follow a moved flag through an anisotropic mirrored camera (%s)",
    (mirror) => {
        const world = new Container();
        world.scale.set(mirror * 0.8, -0.45);
        const texture = new Texture({ source: new TextureSource({ width: 100, height: 160 }) });
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5, 1);
        sprite.scale.y = -1;
        sprite.position.set(200, 100);
        world.addChild(sprite);
        const effect = new StunStars();
        effect.update(sprite, 1000, 64, 32, 24);
        effect.update(sprite, 1200, 64, 32, 24);
        const geometry = effect.root.children.map((child) => (child as import("pixi.js").Graphics).context);
        const glintContext = (effect.root.children[0].children[0] as import("pixi.js").Graphics).context;
        expect(effect.root.children).toHaveLength(STUN_STAR_COUNT * 5);
        expect(effect.root.scale.y).toBeCloseTo(-0.8 / 0.45);
        const before = effect.root.getGlobalPosition();
        expect(before.x).toBeCloseTo(sprite.getGlobalPosition().x);
        expect(before.y).toBeCloseTo(sprite.getGlobalPosition().y);
        sprite.x += 70;
        sprite.y += 30;
        effect.update(sprite, 1400, 64, 32, 24);
        const after = effect.root.getGlobalPosition();
        expect(after.x - before.x).toBeCloseTo(mirror * 56);
        expect(after.y - before.y).toBeCloseTo(-13.5);
        expect(effect.root.children.map((child) => (child as import("pixi.js").Graphics).context)).toEqual(geometry);
        sprite.visible = false;
        effect.update(sprite, 1500, 64, 32, 24);
        expect(effect.root.visible).toBe(false);
        sprite.visible = true;
        effect.update(sprite, 1600, 64, 32, 24);
        expect(effect.root.alpha).toBe(0);
        effect.update(sprite, 1800, 64, 32, 24);
        expect(effect.root.alpha).toBe(1);
        effect.destroy();
        expect(effect.root.destroyed).toBe(true);
        expect(glintContext.destroyed).toBe(true);
        expect(geometry.every((context) => context.destroyed)).toBe(true);
        expect(world.children).toEqual([sprite]);
        expect(texture.destroyed).toBe(false);
        world.destroy({ children: true });
        texture.destroy(true);
    },
);

test("bounded orbit moves continuously through front/back and all five stars remain separated", () => {
    for (let ms = 0; ms < 7000; ms += 17) {
        const poses = Array.from({ length: STUN_STAR_COUNT }, (_, i) => stunStarPose(i, ms));
        for (let i = 0; i < poses.length; i++) {
            const p = poses[i],
                next = stunStarPose(i, ms + 17);
            expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(p.y)).toBeLessThan(1.07);
            expect(Math.abs(next.x - p.x)).toBeLessThan(0.05);
            expect(p.roll).toBeGreaterThan(0.4);
        }
    }
});

test.each([1, -1])(
    "the whole edge-on orbit and its tails cross flag digits at the same screen angle (%s)",
    (mirror) => {
        const world = new Container();
        world.scale.set(mirror * 0.8, -0.45);
        const flag = new Container();
        flag.position.set(200, 100);
        world.addChild(flag);
        const effect = new StunStars();
        effect.update(flag, 1200, 64, 32, 24, { tiltDeg: 90, rotationDeg: 35 });
        const centre = flag.getGlobalPosition();
        for (const child of effect.root.children) {
            const point = child.getGlobalPosition();
            expect(point.y - centre.y).toBeCloseTo((point.x - centre.x) * Math.tan((35 * Math.PI) / 180));
        }
        const first = effect.root.children[0];
        const tumble = first.rotation;
        effect.update(flag, 1200, 64, 32, 24, { tiltDeg: 0, rotationDeg: 0 });
        expect(first.rotation).toBe(tumble);
        expect(effect.root.children.some((child) => Math.abs(child.getGlobalPosition().y - centre.y) > 1)).toBe(true);
        effect.destroy();
        world.destroy({ children: true });
    },
);
