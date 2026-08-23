import { expect, test } from "bun:test";

import {
    TextureType,
    UNIT_ATLAS_ANIMATION_EXCLUSIONS,
    unitToTextureName,
    usesUnitAtlasAnimation,
} from "./PixiUnitsFactory";

test("uses tall full-body textures for authored board creatures", () => {
    expect(unitToTextureName("Wandering Mage", TextureType.SMALL, 1)).toBe("wandering_mage_board_128");
    expect(unitToTextureName("Thief", TextureType.SMALL, 1)).toBe("thief_board_128");
    expect(unitToTextureName("Scavenger", TextureType.SMALL, 1)).toBe("thief_board_128");
    expect(unitToTextureName("Scavenger", TextureType.LARGE, 1)).toBe("thief_model_full");
    expect(unitToTextureName("Wandering Mage", TextureType.LARGE, 1)).toBe("wandering_mage_512");
    expect(unitToTextureName("Troll", TextureType.SMALL, 1)).toBe("troll_board_128");
    expect(unitToTextureName("Troll", TextureType.LARGE, 1)).toBe("troll_512");
    expect(unitToTextureName("Efreet", TextureType.SMALL, 1)).toBe("efreet_battlefield_side_right_v7");
    expect(unitToTextureName("Efreet", TextureType.LARGE, 1)).toBe("efreet_512");
    expect(unitToTextureName("Arachna Queen", TextureType.SMALL, 2)).toBe("arachna_queen_board_256");
    expect(unitToTextureName("Arachna Queen", TextureType.LARGE, 2)).toBe("arachna_queen_512");
    expect(unitToTextureName("Arachna Spider", TextureType.SMALL, 1)).toBe("arachna_spider_128");
    expect(unitToTextureName("Squire", TextureType.SMALL, 1)).toBe("squire_128");
    expect(unitToTextureName("Thunderbird", TextureType.SMALL, 2)).toBe("thunderbird_battlefield_side_right_v2");
    expect(unitToTextureName("Thunderbird", TextureType.LARGE, 2)).toBe("thunderbird_512_v2");
});

test("uses the approved static battlefield sprites for every level-three creature", () => {
    const names = [
        "Griffin",
        "Crusader",
        "Monk",
        "Mantis",
        "Unicorn",
        "Pegasus",
        "Goblin Knight",
        "Efreet",
        "Nightmare",
        "Cyclops",
        "Ogre Mage",
        "Zena",
    ];

    for (const name of names) {
        const base = name.toLowerCase().replace(/ /g, "_");
        const version = name === "Efreet" ? "v7" : name === "Mantis" || name === "Zena" ? "v3" : "v2";
        expect(unitToTextureName(name, TextureType.SMALL, 1)).toBe(`${base}_battlefield_side_right_${version}`);
        expect(unitToTextureName(name, TextureType.LARGE, 1)).toBe(`${base}_512`);
    }
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
