import { expect, test } from "bun:test";
import type { GridSettings } from "@heroesofcrypto/common";
import { Container, Sprite, Texture } from "pixi.js";

import { RenderableUnit } from "./RenderableUnit";

for (const mirrored of [false, true]) {
    test(`a blessing follows the creature silhouette independently of its banner (${mirrored ? "mirrored" : "normal"})`, () => {
        const root = new Container();
        root.scale.set(mirrored ? -1.5 : 1.5, -0.75);
        root.position.set(500, 700);
        const sprite = new Sprite(Texture.WHITE);
        sprite.anchor.set(0.5, 1);
        sprite.scale.set(140, -240);
        sprite.position.set(320, 384);
        root.addChild(sprite);
        const unit = Object.create(RenderableUnit.prototype) as RenderableUnit;
        Object.assign(unit, {
            sprite,
            badgeContainer: { visible: true, x: 900, y: 900 },
        });
        const anchor = unit.getBlessingHaloAnchor({} as GridSettings);
        const bounds = sprite.getBounds();
        const global = root.toGlobal(anchor);
        expect(global.x).toBeCloseTo(bounds.x + bounds.width / 2);
        expect(global.y).toBeCloseTo(bounds.y);
        sprite.x += 70;
        expect(unit.getBlessingHaloAnchor({} as GridSettings).x).toBeCloseTo(anchor.x + 70);
        root.destroy({ children: true });
        expect(Texture.WHITE.destroyed).toBe(false);
    });
}
