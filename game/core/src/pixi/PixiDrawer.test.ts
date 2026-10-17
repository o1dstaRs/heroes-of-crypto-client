import { describe, expect, test } from "bun:test";

import { Application, Container } from "pixi.js";
import { Grid } from "@heroesofcrypto/common";

import { PixiDrawer } from "./PixiDrawer";
import { FLOOR_AURA_Z_INDEX } from "./floorAuraLayer";

describe("PixiDrawer idle update", () => {
    test("clears the retired flying path without replacing its array every frame", () => {
        const flyingUnits: unknown[] = [{}];
        const drawer = Object.create(PixiDrawer.prototype) as {
            animating: boolean;
            flyingUnits: unknown[];
            isAnimating: PixiDrawer["isAnimating"];
            update: PixiDrawer["update"];
        };
        drawer.flyingUnits = flyingUnits;
        drawer.animating = true;

        drawer.update(1 / 60);

        expect(drawer.flyingUnits).toBe(flyingUnits);
        expect(drawer.flyingUnits).toHaveLength(0);
        expect(drawer.isAnimating()).toBeFalse();
    });

    test("destroys every root layer, including interaction graphics", () => {
        const root = new Container();
        const grid = {
            getSettings: () => ({
                getMinX: () => 0,
                getMinY: () => 0,
                getMaxX: () => 512,
                getMaxY: () => 512,
            }),
        } as unknown as Grid;
        const drawer = new PixiDrawer(grid, { stage: root } as Application, root);
        const layers = drawer as unknown as {
            auraGfx: Container;
            terrainContainerBack: Container;
            terrainContainerFront: Container;
        };
        expect(layers.auraGfx.parent).toBe(root);
        expect(layers.auraGfx.zIndex).toBe(FLOOR_AURA_Z_INDEX);
        expect(layers.auraGfx.zIndex).toBeGreaterThan(layers.terrainContainerBack.zIndex);
        expect(layers.auraGfx.zIndex).toBeLessThan(layers.terrainContainerFront.zIndex);
        expect(layers.auraGfx.zIndex).toBeLessThan(drawer.getUnitsContainer().zIndex);
        const interactionContainer = (
            drawer as unknown as {
                interactionContainer: Container;
            }
        ).interactionContainer;

        expect(interactionContainer.parent).toBe(root);
        drawer.destroy();

        expect(interactionContainer.destroyed).toBeTrue();
        expect(interactionContainer.parent).toBeNull();
        expect(layers.auraGfx.destroyed).toBeTrue();
        expect(root.children).toHaveLength(0);
        root.destroy();
    });
});
