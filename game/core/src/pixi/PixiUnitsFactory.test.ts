import { expect, test } from "bun:test";

import { TextureType, unitToTextureName, usesUnitAtlasAnimation } from "./PixiUnitsFactory";

test("Ash Moth renders the regular circular chip after the incorrect board model was removed", () => {
    // The battlefield uses the standard <unit>_128 chip, like every other small unit.
    expect(unitToTextureName("Ash Moth", TextureType.SMALL, 1)).toBe("ash_moth_128");
    expect(unitToTextureName("Ash Moth", TextureType.LARGE, 1)).toBe("ash_moth_512");
    expect(unitToTextureName("Squire", TextureType.SMALL, 1)).toBe("squire_128");
});

test("Ash Moth atlas art cannot override its static unit artwork", () => {
    expect(usesUnitAtlasAnimation("Ash Moth")).toBe(false);
    expect(usesUnitAtlasAnimation("Squire")).toBe(true);
});
