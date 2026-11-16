import { expect, mock, test } from "bun:test";
import { GridSettings } from "@heroesofcrypto/common";
import { Container, Sprite, Texture } from "pixi.js";

import { RenderableUnit } from "./RenderableUnit";

test("the first absorbed shot still dissolves the shield when the already-resolved second shot will kill Mermaid", () => {
    const root = new Container();
    const sprite = root.addChild(new Sprite(Texture.WHITE));
    let displayedAmount = 1;
    const opticalBreak = mock(() => true);
    const unit = Object.assign(Object.create(RenderableUnit.prototype), {
        getName: () => "Mermaid",
        // The engine resolves the entire double shot before its first projectile arrives.
        isDead: () => true,
        getDisplayedAmount: () => displayedAmount,
        getFootprintWidth: () => 1,
        getFootprintHeight: () => 1,
        sprite,
        waterShieldBreakStartMs: 100,
        // #205 uses the optical shell; main draws the same lifecycle with its procedural burst.
        waterShieldVisual: { hide: mock(() => {}), updateBreak: opticalBreak },
    });
    const grid = new GridSettings(4, 400, 0, 400, 0, 0, 0);
    try {
        unit.updateWaterShieldBreak(root, grid, { x: 200, y: 200 }, 100);
        expect(unit.waterShieldBreakStartMs).toBe(100);
        expect(unit.waterShieldBreakGfx?.visible ?? opticalBreak.mock.calls.length > 0).toBe(true);
        unit.updateWaterShieldBreak(root, grid, { x: 200, y: 200 }, 250);
        expect(unit.waterShieldBreakStartMs).toBe(100);

        // Death belongs to the second contact, not the eager engine result during the first.
        displayedAmount = 0;
        unit.updateWaterShieldBreak(root, grid, { x: 200, y: 200 }, 300);
        expect(unit.waterShieldBreakStartMs).toBeUndefined();
    } finally {
        root.destroy({ children: true });
    }
});
