import { expect, test } from "bun:test";
import { Sprite, Text, Texture } from "pixi.js";

import { HoverManager, type ISandboxHoverContext } from "./HoverManager";

test("uses the persistent cursor layer as a scene-lifetime cleanup signal", () => {
    const cursorChildren: Array<Sprite | Text> = [];
    const context = {
        attachToCursorOverlay: (child: Sprite | Text) => cursorChildren.push(child),
        attachToWorldRoot: () => undefined,
        texAny: () => Texture.WHITE,
        getCurrentActiveUnit: () => undefined,
    } as unknown as ISandboxHoverContext;
    const hover = new HoverManager(context);
    const internals = hover as unknown as {
        destroyed: boolean;
        phantomGrayscaleFilter?: { destroy(): void };
    };
    let filterDestroyCalls = 0;
    internals.phantomGrayscaleFilter = { destroy: () => filterDestroyCalls++ };

    expect(cursorChildren).toHaveLength(1);
    cursorChildren[0].destroy();

    expect(internals.destroyed).toBe(true);
    expect(internals.phantomGrayscaleFilter).toBeUndefined();
    expect(filterDestroyCalls).toBe(1);
});

test("ignores duplicate lifecycle teardown", () => {
    const cursorChildren: Array<Sprite | Text> = [];
    const hover = new HoverManager({
        attachToCursorOverlay: (child: Sprite | Text) => cursorChildren.push(child),
    } as unknown as ISandboxHoverContext);
    const internals = hover as unknown as {
        phantomGrayscaleFilter?: { destroy(): void };
    };
    let filterDestroyCalls = 0;
    internals.phantomGrayscaleFilter = { destroy: () => filterDestroyCalls++ };

    cursorChildren[0].emit("destroyed", cursorChildren[0]);
    cursorChildren[0].destroy();

    expect(filterDestroyCalls).toBe(1);
});
