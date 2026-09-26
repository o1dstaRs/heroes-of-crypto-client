import { describe, expect, test } from "bun:test";
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import type { GridSettings } from "@heroesofcrypto/common";

import { animationAtlases } from "../generated/animation_atlases";
import { RenderableUnit } from "./RenderableUnit";

type ShotState = "attack" | "attack_up" | "attack_down";
const gs = {} as GridSettings;

function makeShot(state: ShotState, facing: number) {
    const world = new Container();
    world.scale.set(1.3, -0.8);
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 512, height: 512 }),
    });
    const sprite = new Sprite(texture);
    world.addChild(sprite);
    sprite.position.set(200, 100);
    sprite.anchor.set(0.5, 433 / 512);
    sprite.scale.set(facing * 0.5, -0.5);
    const unit = Object.assign(Object.create(RenderableUnit.prototype), {
        sprite,
        arbalesterLabIdleEnabled: true,
        oneShotAnim: { stateName: state, frameIndex: 5, frames: [texture] },
        getName: () => "Arbalester",
    }) as RenderableUnit;
    return { world, texture, unit };
}

describe("Arbalester upward shot muzzle", () => {
    test("the authored raised rail becomes a higher world origin in either facing", () => {
        const meta = animationAtlases.Arbalester.attack_up;
        const original = meta.projectileOrigin;
        meta.projectileOrigin = { x: 400, y: 105 };
        try {
            for (const facing of [-1, 1]) {
                const { world, texture, unit } = makeShot("attack_up", facing);
                const origin = unit.getRangedProjectileOrigin({ x: facing * 1000, y: 500 }, gs);
                expect(origin.x).toBeCloseTo(200 + facing * 72);
                expect(origin.y).toBeCloseTo(264);
                // Source y=165 previously placed the bolt 30 world pixels below this raised rail.
                expect(origin.y - (100 + (433 - 165) * 0.5)).toBeCloseTo(30);
                world.destroy({ children: true });
                texture.destroy(true);
            }
        } finally {
            meta.projectileOrigin = original;
        }
    });

    test("missing metadata falls back to the same release rail while other directions retain their origins", () => {
        for (const [state, sourceX, sourceY] of [
            ["attack_up", 400, 105],
            ["attack", 425, 230],
            ["attack_down", 425, 295],
        ] as const) {
            const meta = animationAtlases.Arbalester[state];
            const original = meta.projectileOrigin;
            meta.projectileOrigin = undefined;
            try {
                for (const facing of [-1, 1]) {
                    const { world, texture, unit } = makeShot(state, facing);
                    const origin = unit.getRangedProjectileOrigin({ x: facing * 1000, y: 500 }, gs);
                    expect(origin.x).toBeCloseTo(200 + facing * (sourceX - 256) * 0.5);
                    expect(origin.y).toBeCloseTo(100 + (433 - sourceY) * 0.5);
                    world.destroy({ children: true });
                    texture.destroy(true);
                }
            } finally {
                meta.projectileOrigin = original;
            }
        }
    });

    test("valid authored muzzle coordinates keep priority over the fallback", () => {
        const meta = animationAtlases.Arbalester.attack_up;
        const original = meta.projectileOrigin;
        meta.projectileOrigin = { x: 392, y: 99 };
        try {
            const { world, texture, unit } = makeShot("attack_up", 1);
            const origin = unit.getRangedProjectileOrigin({ x: 1000, y: 500 }, gs);
            expect(origin.x).toBeCloseTo(268);
            expect(origin.y).toBeCloseTo(267);
            world.destroy({ children: true });
            texture.destroy(true);
        } finally {
            meta.projectileOrigin = original;
        }
    });
});
