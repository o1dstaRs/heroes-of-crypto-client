import { expect, test } from "bun:test";

import {
    TextureType,
    UNIT_ATLAS_ANIMATION_EXCLUSIONS,
    unitToTextureName,
    usesUnitAtlasAnimation,
} from "./PixiUnitsFactory";

test("Ash Moth renders the regular circular chip after the incorrect board model was removed", () => {
    // The battlefield uses the standard <unit>_128 chip, like every other small unit.
    expect(unitToTextureName("Ash Moth", TextureType.SMALL, 1)).toBe("ash_moth_128");
    expect(unitToTextureName("Ash Moth", TextureType.LARGE, 1)).toBe("ash_moth_512");
    expect(unitToTextureName("Squire", TextureType.SMALL, 1)).toBe("squire_128");
});

test("Ash Moth atlas art cannot override its static unit artwork", () => {
    // Board atlas animation is switched off wholesale per owner (2026-08-14), so NOTHING animates today —
    // Squire included. Asserting Squire === true here was the old control and went stale with that switch.
    expect(usesUnitAtlasAnimation("Ash Moth")).toBe(false);
    expect(usesUnitAtlasAnimation("Squire")).toBe(false);

    // The Ash Moth exclusion is the part that must outlive the switch: flipping the global flag back on
    // restores Squire's animation and must still leave Ash Moth on its static chip.
    expect(UNIT_ATLAS_ANIMATION_EXCLUSIONS.has("Ash Moth")).toBe(true);
    expect(UNIT_ATLAS_ANIMATION_EXCLUSIONS.has("Squire")).toBe(false);
});
