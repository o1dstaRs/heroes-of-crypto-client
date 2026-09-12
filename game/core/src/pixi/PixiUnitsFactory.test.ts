import { expect, test } from "bun:test";

import { images } from "@/generated/image_imports";

import { staticBattlefieldTextureNameForUnit, TextureType, unitToTextureName } from "./PixiUnitsFactory";

const FINAL_BATTLEFIELD_CREATURES = [
    ["Blacksmith", "blacksmith", 1, 1],
    ["Squire", "squire", 1, 1],
    ["Peasant", "peasant", 1, 1],
    ["Arbalester", "arbalester", 1, 1],
    ["Pikeman", "pikeman", 1, 1],
    ["Valkyrie", "valkyrie", 1, 1],
    ["Healer", "healer", 1, 1],
    ["Battle Mage", "battle_mage", 1, 1],
    ["Crusader", "crusader", 1, 1],
    ["Griffin", "griffin", 2, 1],
    ["Monk", "monk", 1, 1],
    ["Tsar Cannon", "tsar_cannon", 2, 2],
    ["Angel", "angel", 2, 2],
    ["Champion", "champion", 2, 2],
    ["Fairy", "fairy", 1, 1],
    ["Dryad", "dryad", 1, 1],
    ["Wolf", "wolf", 2, 1],
    ["Leprechaun", "leprechaun", 1, 1],
    ["White Tiger", "white_tiger", 2, 1],
    ["Elf", "elf", 1, 1],
    ["Satyr", "satyr", 1, 1],
    ["Trent", "trent", 1, 1],
    ["Unicorn", "unicorn", 2, 1],
    ["Mantis", "mantis", 2, 1],
    ["Pegasus", "pegasus", 2, 1],
    ["Magic Dragon", "magic_dragon", 2, 2],
    ["Gargantuan", "gargantuan", 2, 2],
    ["Arachna Queen", "arachna_queen", 2, 2],
    ["Arachna Spider", "arachna_spider", 1, 1],
    ["Scavenger", "scavenger", 1, 1],
    ["Orc", "orc", 1, 1],
    ["Troglodyte", "troglodyte", 1, 1],
    ["Medusa", "medusa", 1, 1],
    ["Troll", "troll", 1, 1],
    ["Beholder", "beholder", 1, 1],
    ["Efreet", "efreet", 1, 1],
    ["Goblin Knight", "goblin_knight", 1, 1],
    ["Black Dragon", "black_dragon", 2, 2],
    ["Hydra", "hydra", 2, 2],
    ["Abomination", "abomination", 2, 2],
    ["Wandering Mage", "wandering_mage", 1, 1],
    ["Manticore", "manticore", 2, 1],
    ["Nightmare", "nightmare", 2, 1],
    ["Mermaid", "mermaid", 1, 1],
    ["Berserker", "berserker", 1, 1],
    ["Centaur", "centaur", 2, 1],
    ["Wolf Rider", "wolf_rider", 2, 1],
    ["Nomad", "nomad", 2, 1],
    ["Harpy", "harpy", 1, 1],
    ["Hyena", "hyena", 2, 1],
    ["Wyvern", "wyvern", 2, 1],
    ["Ogre Mage", "ogre_mage", 1, 1],
    ["Cyclops", "cyclops", 1, 1],
    ["Zena", "zena", 1, 1],
    ["Thunderbird", "thunderbird", 2, 2],
    ["Behemoth", "behemoth", 2, 2],
    ["Frenzied Boar", "frenzied_boar", 2, 2],
] as const;

const DISTANCE_READABLE_CREATURES = new Set<string>([
    "blacksmith",
    "squire",
    "peasant",
    "arbalester",
    "pikeman",
    "valkyrie",
    "healer",
    "battle_mage",
    "crusader",
    "griffin",
    "monk",
    "tsar_cannon",
    "angel",
    "champion",
    "scavenger",
    "fairy",
    "dryad",
    "wolf",
    "leprechaun",
    "white_tiger",
    "elf",
    "satyr",
    "trent",
    "unicorn",
    "mantis",
    "pegasus",
    "efreet",
    "goblin_knight",
    "nightmare",
    "wandering_mage",
    "troglodyte",
    "centaur",
    "mermaid",
    "berserker",
    "wolf_rider",
    "magic_dragon",
    "gargantuan",
    "arachna_queen",
    "black_dragon",
    "hydra",
    "abomination",
    "ogre_mage",
    "cyclops",
    "zena",
]);

const DISTANCE_READABLE_V2_CREATURES = new Set<string>([
    "valkyrie",
    "healer",
    "leprechaun",
    "elf",
    "satyr",
    "trent",
    "hydra",
    "arachna_queen",
    "tsar_cannon",
    "angel",
    "champion",
]);

const DISTANCE_READABLE_V3_CREATURES = new Set<string>(["goblin_knight"]);

const DISTANCE_READABLE_V4_CREATURES = new Set<string>();

const DISTANCE_READABLE_V5_CREATURES = new Set<string>(["zena", "black_dragon"]);

const DISTANCE_READABLE_V6_CREATURES = new Set<string>(["nightmare"]);

test("uses every approved final figure only for battlefield textures", () => {
    expect(FINAL_BATTLEFIELD_CREATURES).toHaveLength(57);

    for (const [name, slug, width, height] of FINAL_BATTLEFIELD_CREATURES) {
        const texture = `${slug}_battlefield_side_right_${
            DISTANCE_READABLE_CREATURES.has(slug) ? "distance_readable" : "final"
        }_${DISTANCE_READABLE_V6_CREATURES.has(slug) ? "v6" : DISTANCE_READABLE_V5_CREATURES.has(slug) ? "v5" : DISTANCE_READABLE_V4_CREATURES.has(slug) ? "v4" : DISTANCE_READABLE_V3_CREATURES.has(slug) ? "v3" : DISTANCE_READABLE_V2_CREATURES.has(slug) ? "v2" : "v1"}`;
        expect(staticBattlefieldTextureNameForUnit(name, width, height)).toBe(texture);
        expect(unitToTextureName(name, TextureType.SMALL, width, height)).toBe(texture);
        expect(texture in images).toBe(true);
    }
});

test("keeps card and sidebar portraits unchanged", () => {
    for (const [name, slug, width, height] of FINAL_BATTLEFIELD_CREATURES) {
        const expectedPortrait =
            name === "Scavenger"
                ? "thief_model_full"
                : name === "Wandering Mage"
                  ? "wandering_mage_512"
                  : name === "Thunderbird"
                    ? "thunderbird_512_v2"
                    : `${slug}_512`;
        expect(unitToTextureName(name, TextureType.LARGE, width, height)).toBe(expectedPortrait);
    }
});

test("uses the reviewed distance-readable restyles for the screenshot battlefield units", () => {
    for (const [name, slug, footprint, version] of [
        ["Arachna Queen", "arachna_queen", 2, "v2"],
        ["Gargantuan", "gargantuan", 2, "v1"],
        ["Magic Dragon", "magic_dragon", 2, "v1"],
    ] as const) {
        expect(staticBattlefieldTextureNameForUnit(name, footprint, footprint)).toBe(
            `${slug}_battlefield_side_right_distance_readable_${version}`,
        );
        expect(unitToTextureName(name, TextureType.LARGE, footprint, footprint)).toBe(`${slug}_512`);
    }
    expect(staticBattlefieldTextureNameForUnit("Arachna Spider", 1, 1)).toBe(
        "arachna_spider_battlefield_side_right_final_v1",
    );
});

test("uses the new Black Dragon, Hydra, and Abomination only on the battlefield", () => {
    for (const [name, slug, version] of [
        ["Black Dragon", "black_dragon", "v5"],
        ["Hydra", "hydra", "v2"],
        ["Abomination", "abomination", "v1"],
    ] as const) {
        expect(staticBattlefieldTextureNameForUnit(name, 2, 2)).toBe(
            `${slug}_battlefield_side_right_distance_readable_${version}`,
        );
        expect(unitToTextureName(name, TextureType.SMALL, 2, 2)).toBe(
            `${slug}_battlefield_side_right_distance_readable_${version}`,
        );
        expect(unitToTextureName(name, TextureType.LARGE, 2, 2)).toBe(`${slug}_512`);
    }
});

test("uses the distance-readable restyles for Angel, Champion and Tsar Cannon", () => {
    for (const [name, slug, version] of [
        ["Angel", "angel", "v2"],
        ["Champion", "champion", "v2"],
        ["Tsar Cannon", "tsar_cannon", "v2"],
    ] as const) {
        expect(staticBattlefieldTextureNameForUnit(name, 2, 2)).toBe(
            `${slug}_battlefield_side_right_distance_readable_${version}`,
        );
        expect(unitToTextureName(name, TextureType.LARGE, 2, 2)).toBe(`${slug}_512`);
    }
});

test("keeps the final figure independent from the logical footprint", () => {
    const texture = "griffin_battlefield_side_right_distance_readable_v1";
    expect(unitToTextureName("Griffin", TextureType.SMALL, 1, 1)).toBe(texture);
    expect(unitToTextureName("Griffin", TextureType.SMALL, 2, 1)).toBe(texture);
    expect(unitToTextureName("Griffin", TextureType.SMALL, 2, 2)).toBe(texture);
});

test("does not reintroduce removed or not-yet-playable figures", () => {
    for (const name of ["Skeleton", "Imp", "Zombie", "Dark Champion", "Phoenix", "Faerie Dragon"]) {
        expect(staticBattlefieldTextureNameForUnit(name, 1, 1)).toBeUndefined();
    }
});
