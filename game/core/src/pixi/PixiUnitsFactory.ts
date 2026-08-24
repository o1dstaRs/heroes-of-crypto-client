/*
 * -----------------------------------------------------------------------------
 * Pixi-only UnitsFactory
 *  - No physics engine, no WebGL shader/Sprite wrappers.
 *  - Creates PixiUnit/Hero, positions them on the grid, and registers them
 *    with PixiSceneManager.
 * -----------------------------------------------------------------------------
 */

import { FactionVals } from "@heroesofcrypto/common";

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

const LEVEL_THREE_STATIC_BATTLEFIELD_TEXTURES: Readonly<Record<string, string>> = {
    griffin: "griffin_battlefield_side_right_v2",
    crusader: "crusader_battlefield_side_right_v2",
    monk: "monk_battlefield_side_right_v2",
    mantis: "mantis_battlefield_side_right_v3",
    unicorn: "unicorn_battlefield_side_right_v2",
    pegasus: "pegasus_battlefield_side_right_v2",
    goblin_knight: "goblin_knight_battlefield_side_right_v2",
    efreet: "efreet_battlefield_side_right_v7",
    nightmare: "nightmare_battlefield_side_right_v2",
    cyclops: "cyclops_battlefield_side_right_v2",
    ogre_mage: "ogre_mage_battlefield_side_right_v2",
    zena: "zena_battlefield_side_right_v3",
};

/** Approved full-body level-three field sprite; cards continue to use the existing 512 artwork. */
export const staticBattlefieldTextureNameForUnit = (unitName: string, unitSize = 1): string | undefined => {
    const base = unitName.toLowerCase().replace(/ /g, "_");
    if (base === "thunderbird" && unitSize === 2) return "thunderbird_battlefield_side_right_v2";
    if (unitSize !== 1) return undefined;
    return LEVEL_THREE_STATIC_BATTLEFIELD_TEXTURES[base];
};

export const unitToTextureName = (unitName: string, textureType: TextureType, unitSize = 1) => {
    const base = unitName.toLowerCase().replace(/ /g, "_");
    // The stable protocol id remains WANDERING_MAGE, but the creature is presented as Wandering Mage. Its
    // authored field model is tall, while selection cards use the waist-up crop of that exact model.
    if (base === "wandering_mage") {
        return textureType === TextureType.LARGE ? "wandering_mage_512" : "wandering_mage_board_128";
    }
    // Scavenger keeps its gameplay identity/config, but now uses the authored Thief visual set.
    if (base === "scavenger") {
        return textureType === TextureType.LARGE ? "thief_model_full" : "thief_board_128";
    }
    if (base === "thunderbird" && textureType === TextureType.LARGE) {
        return "thunderbird_512_v2";
    }
    const approvedStaticBattlefieldTexture = staticBattlefieldTextureNameForUnit(unitName, unitSize);
    if (textureType === TextureType.SMALL && approvedStaticBattlefieldTexture) {
        return approvedStaticBattlefieldTexture;
    }
    // Troll uses the project-owned full-body battlefield figure; cards keep the original 512 portrait.
    if (base === "troll" && textureType === TextureType.SMALL && unitSize === 1) {
        return "troll_board_128";
    }
    // The approved Ember Executioner is a dedicated transparent battlefield cutout. Keep the existing
    // Efreet portrait for cards/sidebar while the board uses the new side-facing full-height silhouette.
    if (base === "efreet" && textureType === TextureType.SMALL && unitSize === 1) {
        return "efreet_board_128";
    }
    // Arachna Queen uses the approved wide side-facing battlefield cutout. Arachna Spider is a separate
    // creature and deliberately keeps its existing art.
    if (base === "arachna_queen" && textureType === TextureType.SMALL && unitSize === 2) {
        return "arachna_queen_board_256";
    }
    if (textureType === TextureType.LARGE) return `${base}_512`;
    // Authored full-body creatures use a deliberately tall 128x192 battlefield texture instead of a
    // circular portrait. Their regular 512 artwork remains available for cards and sidebar UI.
    if (base === "thief" && unitSize === 1) return `${base}_board_128`;
    if (unitSize === 1) return `${base}_128`;
    return `${base}_256`;
};
