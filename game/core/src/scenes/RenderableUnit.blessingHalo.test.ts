import { expect, test } from "bun:test";
import type { GridSettings } from "@heroesofcrypto/common";
import { Container, Sprite, Texture } from "pixi.js";

import { RenderableUnit } from "./RenderableUnit";
import { BATTLEFIELD_CREATURE_FRAMING } from "../ui/battlefieldCreatureFraming";

for (const name of ["Hydra", "Angel", "Black Dragon"]) {
    for (const mirrored of [false, true]) {
        test(`${name}'s blessing follows its reviewed head height independently of its banner (${mirrored ? "mirrored" : "normal"})`, () => {
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
                getName: () => name,
                badgeContainer: { visible: true, x: 900, y: 900 },
            });
            const settings = { getCellSize: () => 64 } as GridSettings;
            const anchor = unit.getBlessingHaloAnchor(settings);
            const bounds = sprite.getBounds();
            const global = root.toGlobal(anchor);
            expect(global.x).toBeCloseTo(bounds.x + bounds.width / 2);
            const reviewedInset = (BATTLEFIELD_CREATURE_FRAMING[name].flagOffsetYCells ?? 0) * 64;
            expect(global.y).toBeCloseTo(bounds.y + reviewedInset * Math.abs(root.scale.y));
            sprite.x += 70;
            expect(unit.getBlessingHaloAnchor(settings).x).toBeCloseTo(anchor.x + 70);
            root.destroy({ children: true });
            expect(Texture.WHITE.destroyed).toBe(false);
        });
    }
}
