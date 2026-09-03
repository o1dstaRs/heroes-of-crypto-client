import { describe, expect, test } from "bun:test";

import { Application, Container } from "pixi.js";
import { Grid } from "@heroesofcrypto/common";

import { PixiDrawer } from "./PixiDrawer";

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
        const interactionContainer = (
            drawer as unknown as {
                interactionContainer: Container;
            }
        ).interactionContainer;

        expect(interactionContainer.parent).toBe(root);
        drawer.destroy();

        expect(interactionContainer.destroyed).toBeTrue();
        expect(interactionContainer.parent).toBeNull();
        expect(root.children).toHaveLength(0);
        root.destroy();
    });
});
