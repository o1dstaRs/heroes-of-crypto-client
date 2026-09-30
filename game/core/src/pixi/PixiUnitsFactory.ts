/*
 * -----------------------------------------------------------------------------
 * Pixi-only UnitsFactory
 *  - No physics engine, no WebGL shader/Sprite wrappers.
 *  - Creates PixiUnit/Hero, positions them on the grid, and registers them
 *    with PixiSceneManager.
 * -----------------------------------------------------------------------------
 */

import { FactionVals } from "@heroesofcrypto/common";

import { images } from "../imageAssets";

export enum HeroType {
    NO_TYPE = 0,
    MAGICIAN = 1,
    WARRIOR_MELEE = 2,
    WARRIOR_RANGE = 3,
}

export enum HeroGender {
    NO_GENDER = 0,
    MALE = 1,
    FEMALE = 2,
}

export const generateHeroKey = (factionName: string, heroType: HeroType, heroGender: HeroGender) =>
    `${factionName}:${heroType}:${heroGender}}`;

export const FACTION_TO_HERO_TYPES: { [faction: string]: HeroType[] } = {
    [FactionVals.NATURE]: [HeroType.MAGICIAN, HeroType.WARRIOR_RANGE],
};

export const FACTION_HERO_GENDER_TO_NAME: { [heroKey: string]: string[] } = {
    [`${generateHeroKey("Nature", HeroType.MAGICIAN, HeroGender.MALE)}`]: [
        "Aelion Sage",
        "Thorne Whisper",
        "Faelan Moss",
        "Cedric Bloom",
        "Sylvan Shade",
        "Bramble Warden",
        "Linden Root",
        "Ashen Veil",
        "Fennel Dusk",
        "Rowan Glade",
        "Thistle Arc",
        "Moss Seer",
        "Alder Spirit",
        "Elm Weaver",
        "Fern Oracle",
        "Birch Enchanter",
        "Hazel Mist",
        "Laurel Spell",
        "Willow Sprite",
        "Maple Shaman",
        "Ivy Enigma",
        "Thorn Caster",
        "Oak Herald",
        "Reed Visionv",
        "Briar Seer",
        "Aspen Sage",
        "Juniper Myst",
        "Leaf Whisper",
        "Thornwood Mage",
        "Forest Enchanter",
        "Moss Sage",
        "Grove Keeper",
        "Wildroot Mage",
        "Pine Whisperer",
        "Timber Sage",
        "Bark Shaman",
        "Evergreen Mage",
        "Dew Mist",
        "Sylvan Enigma",
        "Thicket Seer",
        "Herb Whisper",
        "Wildwood Seer",
        "Vine Enchanter",
        "Leaf Sage",
        "Sprout Weaver",
        "Meadow Sage",
        "Petal Caster",
        "Thicket Oracle",
        "Seed Seer",
        "Branch Shaman",
        "Aelion",
        "Thorne",
        "Faelan",
        "Cedric",
        "Sylvan",
        "Bramble",
        "Linden",
        "Ashen",
        "Fennel",
        "Rowan",
        "Thistle",
        "Moss",
        "Alder",
        "Elm",
        "Fern",
        "Birch",
        "Hazel",
        "Laurel",
        "Willow",
        "Maple",
        "Ivy",
        "Thorn",
        "Oak",
        "Reed",
        "Briar",
        "Aspen",
        "Juniper",
        "Leaf",
        "Thornwood",
        "Forest",
        "Grove",
        "Wildroot",
        "Pine",
        "Timber",
        "Bark",
        "Evergreen",
        "Dew",
        "Sylvan",
        "Thicket",
        "Herb",
        "Wildwood",
        "Vine",
        "Sprout",
        "Meadow",
        "Petal",
        "Seed",
        "Branch",
        "Glade",
        "Sage",
        "Myst",
    ],
};

export enum TextureType {
    SMALL = 0,
    LARGE = 1,
}

const FINAL_STATIC_BATTLEFIELD_TEXTURES: Readonly<Record<string, string>> = {
    // Life
    blacksmith: "blacksmith_battlefield_side_right_distance_readable_v1",
    squire: "squire_battlefield_side_right_distance_readable_v1",
    peasant: "peasant_battlefield_side_right_distance_readable_v1",
    arbalester: "arbalester_battlefield_side_right_distance_readable_v1",
    pikeman: "pikeman_battlefield_side_right_distance_readable_v1",
    valkyrie: "valkyrie_battlefield_side_right_distance_readable_v2",
    healer: "healer_battlefield_side_right_distance_readable_v2",
    battle_mage: "battle_mage_battlefield_side_right_distance_readable_v1",
    crusader: "crusader_battlefield_side_right_distance_readable_v1",
    griffin: "griffin_battlefield_side_right_distance_readable_v1",
    monk: "monk_battlefield_side_right_distance_readable_v1",
    tsar_cannon: "tsar_cannon_battlefield_side_right_distance_readable_v2",
    angel: "angel_battlefield_side_right_distance_readable_v2",
    champion: "champion_battlefield_side_right_distance_readable_v2",
    // Nature
    fairy: "fairy_battlefield_side_right_distance_readable_v1",
    dryad: "dryad_battlefield_side_right_distance_readable_v1",
    wolf: "wolf_battlefield_side_right_distance_readable_v1",
    leprechaun: "leprechaun_battlefield_side_right_distance_readable_v2",
    white_tiger: "white_tiger_battlefield_side_right_distance_readable_v1",
    elf: "elf_battlefield_side_right_distance_readable_v2",
    satyr: "satyr_battlefield_side_right_distance_readable_v2",
    trent: "trent_battlefield_side_right_distance_readable_v2",
    unicorn: "unicorn_battlefield_side_right_distance_readable_v1",
    mantis: "mantis_battlefield_side_right_distance_readable_v1",
    pegasus: "pegasus_battlefield_side_right_distance_readable_v1",
    magic_dragon: "magic_dragon_battlefield_side_right_distance_readable_v1",
    gargantuan: "gargantuan_battlefield_side_right_distance_readable_v1",
    arachna_queen: "arachna_queen_battlefield_side_right_distance_readable_v2",
    arachna_spider: "arachna_spider_battlefield_side_right_final_v1",
    // Chaos
    scavenger: "scavenger_battlefield_side_right_distance_readable_v1",
    orc: "orc_battlefield_side_right_final_v1",
    troglodyte: "troglodyte_battlefield_side_right_distance_readable_v1",
    medusa: "medusa_battlefield_side_right_final_v1",
    troll: "troll_battlefield_side_right_final_v1",
    beholder: "beholder_battlefield_side_right_final_v1",
    efreet: "efreet_battlefield_side_right_distance_readable_v1",
    goblin_knight: "goblin_knight_battlefield_side_right_distance_readable_v3",
    black_dragon: "black_dragon_battlefield_side_right_distance_readable_v5",
    hydra: "hydra_battlefield_side_right_distance_readable_v2",
    abomination: "abomination_battlefield_side_right_distance_readable_v1",
    wandering_mage: "wandering_mage_battlefield_side_right_distance_readable_v1",
    manticore: "manticore_battlefield_side_right_final_v1",
    nightmare: "nightmare_battlefield_side_right_distance_readable_v6",
    // Might
    mermaid: "mermaid_battlefield_side_right_distance_readable_v1",
    berserker: "berserker_battlefield_side_right_distance_readable_v1",
    centaur: "centaur_battlefield_side_right_distance_readable_v1",
    wolf_rider: "wolf_rider_battlefield_side_right_distance_readable_v1",
    nomad: "nomad_battlefield_side_right_final_v1",
    harpy: "harpy_battlefield_side_right_final_v1",
    hyena: "hyena_battlefield_side_right_final_v1",
    wyvern: "wyvern_battlefield_side_right_final_v1",
    ogre_mage: "ogre_mage_battlefield_side_right_distance_readable_v1",
    cyclops: "cyclops_battlefield_side_right_distance_readable_v1",
    zena: "zena_battlefield_side_right_distance_readable_v5",
    thunderbird: "thunderbird_battlefield_side_right_final_v1",
    behemoth: "behemoth_battlefield_side_right_final_v1",
    frenzied_boar: "frenzied_boar_battlefield_side_right_final_v1",
};

/**
 * Art tiers are authored SQUARE: `_128` covers one cell and `_256` covers a 2x2 block. A rectangular
 * footprint has no tier of its own, so it asks for the two-cell tier whenever either of its sides is two
 * cells long — that is the only shipped artwork large enough to span the long side.
 */
const spansTwoCells = (footprintWidth: number, footprintHeight: number): boolean =>
    footprintWidth > 1 || footprintHeight > 1;

const occupiesOneCell = (footprintWidth: number, footprintHeight: number): boolean =>
    footprintWidth === 1 && footprintHeight === 1;

/** Cells to authored pixels: every battlefield tier is named after the pixel side it covers. */
const FOOTPRINT_CELL_PIXELS = 128;

/**
 * The name a dedicated rectangular asset would carry (`_256x128` for 2x1, `_128x256` for 1x2), returned
 * only when that file is actually shipped. Nothing declares one yet, and a texture name the resolver
 * cannot satisfy renders as nothing at all — strictly worse than shipped art of the wrong shape.
 */
const rectangularBattlefieldTextureName = (
    base: string,
    footprintWidth: number,
    footprintHeight: number,
): string | undefined => {
    if (footprintWidth === footprintHeight) return undefined;
    const name = `${base}_${footprintWidth * FOOTPRINT_CELL_PIXELS}x${footprintHeight * FOOTPRINT_CELL_PIXELS}`;
    return name in images ? name : undefined;
};

/**
 * Approved final full-body field sprite. Every file keeps the shared 768px canvas and its creature's
 * authored zone, so the logical footprint selects placement only and never swaps or deforms the artwork.
 * Cards and sidebars continue to use their existing portrait textures.
 */
export const staticBattlefieldTextureNameForUnit = (
    unitName: string,
    _footprintWidth = 1,
    _footprintHeight = _footprintWidth,
): string | undefined => {
    const base = unitName.toLowerCase().replace(/ /g, "_");
    return FINAL_STATIC_BATTLEFIELD_TEXTURES[base];
};

export const unitToTextureName = (
    unitName: string,
    textureType: TextureType,
    footprintWidth = 1,
    footprintHeight = footprintWidth,
) => {
    const base = unitName.toLowerCase().replace(/ /g, "_");
    // The stable protocol id remains WANDERING_MAGE, but the creature is presented as Wandering Mage. Its
    // authored field model is tall, while selection cards use the waist-up crop of that exact model.
    if (base === "wandering_mage" && textureType === TextureType.LARGE) {
        return "wandering_mage_512";
    }
    // Scavenger keeps its gameplay identity/config, but now uses the authored Thief visual set.
    if (base === "scavenger" && textureType === TextureType.LARGE) {
        return "thief_model_full";
    }
    if (base === "thunderbird" && textureType === TextureType.LARGE) {
        return "thunderbird_512_v2";
    }
    const approvedStaticBattlefieldTexture = staticBattlefieldTextureNameForUnit(
        unitName,
        footprintWidth,
        footprintHeight,
    );
    if (textureType === TextureType.SMALL && approvedStaticBattlefieldTexture) {
        return approvedStaticBattlefieldTexture;
    }
    const oneCell = occupiesOneCell(footprintWidth, footprintHeight);
    // Troll uses the project-owned full-body battlefield figure; cards keep the original 512 portrait.
    if (base === "troll" && textureType === TextureType.SMALL && oneCell) {
        return "troll_board_128";
    }
    // The approved Ember Executioner is a dedicated transparent battlefield cutout. Keep the existing
    // Efreet portrait for cards/sidebar while the board uses the new side-facing full-height silhouette.
    if (base === "efreet" && textureType === TextureType.SMALL && oneCell) {
        return "efreet_board_128";
    }
    // Arachna Queen uses the approved wide side-facing battlefield cutout. Arachna Spider is a separate
    // creature and deliberately keeps its existing art.
    if (
        base === "arachna_queen" &&
        textureType === TextureType.SMALL &&
        spansTwoCells(footprintWidth, footprintHeight)
    ) {
        return "arachna_queen_board_256";
    }
    // Card/sidebar art is a portrait of the creature, not of the cells it stands on: one 512 per creature
    // whatever its footprint.
    if (textureType === TextureType.LARGE) return `${base}_512`;
    if (footprintWidth !== footprintHeight) {
        // A rectangle takes the best art that exists, in descending order of fit: its own asset, then the
        // two-cell tier that at least spans its long side, then the one-cell chip.
        const rectangular = rectangularBattlefieldTextureName(base, footprintWidth, footprintHeight);
        if (rectangular) return rectangular;
        const twoCellTier = `${base}_256`;
        if (twoCellTier in images) return twoCellTier;
        return base === "thief" ? `${base}_board_128` : `${base}_128`;
    }
    // Authored full-body creatures use a deliberately tall 128x192 battlefield texture instead of a
    // circular portrait. Their regular 512 artwork remains available for cards and sidebar UI.
    if (base === "thief" && oneCell) return `${base}_board_128`;
    if (oneCell) return `${base}_128`;
    return `${base}_256`;
};
