import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { Container, DOMAdapter, Sprite, Texture } from "pixi.js";

import { UnitChip } from "../scenes/UnitChip";
import { DEFAULT_PORTRAIT_FRAMING } from "../ui/portraitFraming";
import { CHAOS_PORTRAIT_BACKGROUND_MATRIX } from "../ui/creaturePortraitPalette";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("roster filters grade separate art/background layers and release their owned resources", () => {
    const chip = new UnitChip({
        unitName: "Hydra",
        portrait: {
            texture: Texture.EMPTY,
            backgroundTexture: Texture.EMPTY,
            backgroundTone: "chaos",
            artPalette: "hydra",
            framing: DEFAULT_PORTRAIT_FRAMING,
        },
    });
    const sprites: Sprite[] = [];
    const walk = (container: Container) => {
        for (const child of container.children) {
            if (child instanceof Sprite) sprites.push(child);
            walk(child);
        }
    };
    walk(chip);
    const graded = sprites.filter((sprite) => sprite.filters?.length);
    expect(graded).toHaveLength(2);
    const filters = graded.map((sprite) => sprite.filters![0]);
    expect((filters[0] as { matrix?: readonly number[] }).matrix).toEqual(CHAOS_PORTRAIT_BACKGROUND_MATRIX);
    const destroyed = filters.map((filter) => spyOn(filter, "destroy"));
    chip.destroy({ children: true });
    destroyed.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
});
