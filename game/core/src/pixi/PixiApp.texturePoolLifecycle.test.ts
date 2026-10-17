import { expect, test } from "bun:test";
import { FilterSystem, TexturePool, type Texture } from "pixi.js";
import { PixiApp } from "./PixiApp";

const idleFilter = () => {
    const filter = new FilterSystem({} as never) as unknown as {
        _pushFilterData(): { inputTexture: Texture | null; backTexture: Texture | null };
        _popFilterData(): unknown;
        _filterStackIndex: number;
        _filterStack: { inputTexture: Texture | null; backTexture: Texture | null }[];
    };
    const slot = filter._pushFilterData();
    const texture = TexturePool.getOptimalTexture({ width: 256, height: 256, resolution: 1, antialias: false });
    slot.inputTexture = texture;
    slot.backTexture = texture;
    filter._popFilterData();
    TexturePool.returnTexture(texture);
    return { filter, slot, texture };
};

test("PixiApp resize forgets renderer slots before their destroyed targets can enter another frame", () => {
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: { devicePixelRatio: 1 } });
    const { filter, slot, texture } = idleFilter();
    const app = new PixiApp();
    const renderer = { filter, resolution: 1, resize: () => {} };
    Object.assign(app, {
        app: { renderer, canvas: { style: {} } },
        renderTexturePoolBucket: [256, 256],
    });
    try {
        app.resize(1280, 720);
        expect(texture.destroyed).toBe(true);
        expect(slot.inputTexture === null).toBe(true);
        expect(slot.backTexture === null).toBe(true);
        expect(filter._filterStackIndex).toBe(0);
    } finally {
        TexturePool.clear();
        if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
        else Reflect.deleteProperty(globalThis, "window");
    }
});

test("PixiApp teardown clears renderer slots and returned textures while preserving other live borrowers", () => {
    const { filter, slot, texture } = idleFilter();
    const heldByText = TexturePool.getOptimalTexture({ width: 64, height: 64, resolution: 1, antialias: false });
    const heldElsewhere = TexturePool.getOptimalTexture({ width: 128, height: 128, resolution: 1, antialias: false });
    const stateAtRendererDestroy: boolean[] = [];
    const app = new PixiApp();
    Object.assign(app, {
        ticker: { stop: () => {} },
        app: {
            renderer: { filter },
            destroy: () => {
                stateAtRendererDestroy.push(texture.destroyed, slot.inputTexture === null, slot.backTexture === null);
                TexturePool.returnTexture(heldByText);
            },
        },
    });
    try {
        app.destroy();
        app.destroy();
        expect(stateAtRendererDestroy).toEqual([true, true, true]);
        expect(heldByText.destroyed).toBe(true);
        expect(heldElsewhere.destroyed).toBe(false);
        TexturePool.returnTexture(heldElsewhere);
        expect(TexturePool.getOptimalTexture({ width: 128, height: 128, resolution: 1, antialias: false })).toBe(
            heldElsewhere,
        );
    } finally {
        if (!heldByText.destroyed) heldByText.destroy(true);
        if (!heldElsewhere.destroyed) heldElsewhere.destroy(true);
        TexturePool.clear();
    }
});
