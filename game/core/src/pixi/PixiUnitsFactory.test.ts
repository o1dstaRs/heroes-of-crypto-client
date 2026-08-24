import { expect, test } from "bun:test";

import { staticBattlefieldTextureNameForUnit, TextureType, unitToTextureName } from "./PixiUnitsFactory";

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

/**
 * There is no rectangular art tier: every battlefield asset is authored square (`_128` for one cell,
 * `_256` for a 2x2). A rectangle therefore asks for the two-cell art and degrades to the nearest shipped
 * name, because a texture name nothing can resolve renders as nothing at all.
 */
test("degrades a rectangular footprint to the nearest shipped battlefield art", () => {
    // Thunderbird owns real two-cell battlefield art, so a two-cell-wide body gets it.
    expect(unitToTextureName("Thunderbird", TextureType.SMALL, 2, 1)).toBe("thunderbird_battlefield_side_right_v2");
    expect(unitToTextureName("Thunderbird", TextureType.SMALL, 1, 2)).toBe("thunderbird_battlefield_side_right_v2");
    // The approved level-three figures are authored one cell tall and remain the closest match for a
    // rectangle; only a genuinely square multi-cell body needs its own 2x2 artwork instead.
    expect(unitToTextureName("Griffin", TextureType.SMALL, 2, 1)).toBe("griffin_battlefield_side_right_v2");
    expect(staticBattlefieldTextureNameForUnit("Griffin", 2, 1)).toBe("griffin_battlefield_side_right_v2");
    expect(staticBattlefieldTextureNameForUnit("Griffin", 2, 2)).toBeUndefined();
    // Nothing ships `white_tiger_256x128` or `white_tiger_256`, so the one-cell chip is what is left.
    expect(unitToTextureName("White Tiger", TextureType.SMALL, 2, 1)).toBe("white_tiger_128");
    expect(unitToTextureName("Hyena", TextureType.SMALL, 1, 2)).toBe("hyena_128");
    // Card and sidebar art is a portrait of the creature and never depends on the footprint.
    expect(unitToTextureName("White Tiger", TextureType.LARGE, 2, 1)).toBe("white_tiger_512");
});

test("leaves the square tiers exactly as they were", () => {
    // The third argument used to be the scalar `size`; passing it alone still means a square footprint.
    expect(unitToTextureName("Squire", TextureType.SMALL, 1)).toBe(
        unitToTextureName("Squire", TextureType.SMALL, 1, 1),
    );
    expect(unitToTextureName("Black Dragon", TextureType.SMALL, 2)).toBe("black_dragon_256");
    expect(unitToTextureName("Black Dragon", TextureType.SMALL, 2, 2)).toBe("black_dragon_256");
    expect(unitToTextureName("Squire", TextureType.SMALL)).toBe("squire_128");
});
