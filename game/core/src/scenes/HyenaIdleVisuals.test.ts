import { afterAll, beforeAll, expect, test } from "bun:test";
import { AlphaFilter, DOMAdapter, Sprite, Texture } from "pixi.js";
import { syncHyenaIdleVisuals } from "./HyenaIdleVisuals";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Hyena idle filter switches off for walk and action without disturbing other filters", () => {
    const sprite = new Sprite(Texture.WHITE);
    const other = new AlphaFilter();
    sprite.filters = [other];
    syncHyenaIdleVisuals(sprite, true, 0);
    expect(sprite.filters).toHaveLength(2);
    const idle = sprite.filters?.[1];
    syncHyenaIdleVisuals(sprite, true, 250);
    expect(sprite.filters).toEqual([other, idle]);
    syncHyenaIdleVisuals(sprite, false, 250);
    expect(sprite.filters).toEqual([other]);
    syncHyenaIdleVisuals(sprite, true, 0);
    expect(sprite.filters).toEqual([other, idle]);
    sprite.destroy();
});
