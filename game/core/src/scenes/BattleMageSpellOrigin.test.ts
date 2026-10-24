import { expect, test } from "bun:test";
import { Container, Sprite, Texture, TextureSource } from "pixi.js";
import type { GridSettings } from "@heroesofcrypto/common";
import { RenderableUnit } from "./RenderableUnit";

test("book emission follows both cast and idle canvases, facing and camera mirroring", () => {
    for (const casting of [false, true])
        for (const facing of [-1, 1])
            for (const mirror of [-1, 1]) {
                const parent = new Container();
                parent.scale.set(mirror * 0.4, -0.25);
                const size = casting ? 1152 : 768;
                const texture = new Texture({ source: new TextureSource({ width: size, height: size }) });
                const sprite = new Sprite(texture);
                sprite.anchor.set(0.5, 0.95);
                sprite.scale.set(facing * 0.2, -0.2);
                sprite.position.set(200, 300);
                parent.addChild(sprite);
                const unit = Object.assign(Object.create(RenderableUnit.prototype), {
                    sprite,
                    getName: () => "Battle Mage",
                    oneShotAnim: casting ? { stateName: "cast" } : undefined,
                }) as RenderableUnit;
                const point = unit.getSpellProjectileOrigin({} as GridSettings);
                expect(point.x).toBeCloseTo(200 + ((casting ? 0.67 : 0.72) - 0.5) * size * facing * 0.2);
                expect(point.y).toBeCloseTo(300 + (0.37 - 0.95) * size * -0.2);
                parent.destroy({ children: true });
                texture.destroy(true);
            }
});
