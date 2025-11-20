/*
 * -----------------------------------------------------------------------------
 * Pixi-only UnitsFactory
 *  - No Box2D, no WebGL shader/Sprite wrappers.
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

export const unitToTextureName = (unitName: string, textureType: TextureType, unitSize = 1) => {
    const base = unitName.toLowerCase().replace(/ /g, "_");
    if (textureType === TextureType.LARGE) return `${base}_512`;
    if (unitSize === 1) return `${base}_128`;
    return `${base}_256`;
};
