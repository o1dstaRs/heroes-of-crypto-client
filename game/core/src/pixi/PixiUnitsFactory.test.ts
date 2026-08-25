import { expect, test } from "bun:test";

import { images } from "@/generated/image_imports";

import { staticBattlefieldTextureNameForUnit, TextureType, unitToTextureName } from "./PixiUnitsFactory";

/**
 * Whether this checkout has the real art bundle. CI generates a stub image map that answers `in` with true
 * for EVERY key, so any assertion of the form "this asset is not shipped, so we fall back" is vacuous there.
 * A key that cannot exist in the real bundle separates the two.
 */
const SHIPS_REAL_ART = !("__hoc_stub_probe_key_that_never_ships" in images);

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
    // A creature with no rectangular and no two-cell art falls the rest of the way to its one-cell chip.
    // The exact rung it lands on is asserted against the REAL bundle only: CI replaces the generated image
    // map with a stub whose `in` reports every key as present (deliberately, so asset tests need no art
    // download), which makes an "is this shipped?" question unanswerable there. What must hold everywhere is
    // that the name resolves to something — a texture nothing can resolve renders as nothing at all.
    for (const [name, width, height] of [
        ["White Tiger", 2, 1],
        ["Hyena", 1, 2],
    ] as const) {
        const resolved = unitToTextureName(name, TextureType.SMALL, width, height);
        expect(resolved in images).toBe(true);
        expect(resolved.startsWith(name.toLowerCase().replace(/ /g, "_"))).toBe(true);
        if (!SHIPS_REAL_ART) {
            continue;
        }
        expect(resolved).toBe(`${name.toLowerCase().replace(/ /g, "_")}_128`);
    }
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
