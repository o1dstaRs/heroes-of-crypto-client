/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { b2World } from "@box2d/core";
import {
    AllFactions,
    AbilityFactory,
    FactionType,
    HoCLib,
    TeamType,
    GridSettings,
    UnitType,
    HoCConfig,
} from "@heroesofcrypto/common";

import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { Unit } from "./units";
import { Hero } from "./heroes";

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

const generateHeroKey = (faction: FactionType, heroType: HeroType, heroGender: HeroGender) =>
    `${faction}:${heroType}:${heroGender}}`;

const FACTION_TO_HERO_TYPES: { [faction: string]: HeroType[] } = {
    [FactionType.NATURE]: [HeroType.MAGICIAN, HeroType.WARRIOR_RANGE],
};

const FACTION_HERO_GENDER_TO_NAME: { [heroKey: string]: string[] } = {
    [`${generateHeroKey(FactionType.NATURE, HeroType.MAGICIAN, HeroGender.MALE)}`]: [
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

type NamedTexture = [textureName: string, texture: WebGLTexture];

enum TextureType {
    SMALL = 0,
    LARGE = 1,
}

const unitToTextureName = (unitName: string, textureType: TextureType, unitSize = 1) => {
    if (textureType === TextureType.LARGE) {
        return `${unitName.toLowerCase().replace(/ /g, "_")}_512`;
    }
    if (unitSize === 1) {
        return `${unitName.toLowerCase().replace(/ /g, "_")}_128`;
    }
    return `${unitName.toLowerCase().replace(/ /g, "_")}_256`;
};

export class UnitsFactory {
    protected readonly world: b2World;

    protected readonly gl: WebGLRenderingContext;

    protected readonly shader: DefaultShader;

    protected readonly gridSettings: GridSettings;

    protected readonly unitSize: number;

    protected readonly textures: PreloadedTextures;

    protected readonly smallTexturesByHero: Map<string, NamedTexture[]>;

    protected readonly digitNormalTextures: Map<number, WebGLTexture>;

    protected readonly digitDamageTextures: Map<number, WebGLTexture>;

    protected readonly abilityFactory: AbilityFactory;

    public constructor(
        world: b2World,
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        digitNormalTextures: Map<number, WebGLTexture>,
        digitDamageTextures: Map<number, WebGLTexture>,
        gridSettings: GridSettings,
        textures: PreloadedTextures,
        abilityFactory: AbilityFactory,
    ) {
        this.world = world;
        this.gl = gl;
        this.shader = shader;
        this.digitNormalTextures = digitNormalTextures;
        this.digitDamageTextures = digitDamageTextures;
        this.unitSize = gridSettings.getUnitSize();
        this.gridSettings = gridSettings;
        this.textures = textures;
        this.abilityFactory = abilityFactory;

        this.smallTexturesByHero = new Map();
        for (const faction of AllFactions) {
            const heroTypes = FACTION_TO_HERO_TYPES[faction];
            if (!heroTypes?.length) {
                continue;
            }

            for (const heroType of heroTypes) {
                this.smallTexturesByHero.set(generateHeroKey(faction, heroType, HeroGender.MALE), [
                    ["nature_mage_male_1_128", textures.nature_mage_male_1_128.texture],
                    ["nature_mage_male_2_128", textures.nature_mage_male_2_128.texture],
                    ["nature_mage_male_3_128", textures.nature_mage_male_3_128.texture],
                ]);
            }
        }
    }

    private getRandomHeroTexture(heroKey: string): NamedTexture | undefined {
        const namedTextures = this.smallTexturesByHero.get(heroKey);
        if (namedTextures?.length) {
            return namedTextures[HoCLib.getRandomInt(0, namedTextures.length)];
        }

        return undefined;
    }

    public makeCreature(
        faction: FactionType,
        name: string,
        team: TeamType,
        amount: number,
        totalExp?: number,
        summoned = false,
    ): Unit {
        const creatureConfig = HoCConfig.getCreatureConfig(
            team,
            faction,
            name,
            unitToTextureName(name, TextureType.LARGE),
            amount,
            totalExp,
        );

        const textureName = unitToTextureName(name, TextureType.SMALL, creatureConfig.size);
        const texture = (this.textures as Record<string, { texture: WebGLTexture }>)[textureName]?.texture;
        if (!texture) {
            throw new ReferenceError(`Texture for creature ${name} (${textureName}) not found`);
        }

        return new Unit(
            this.gl,
            this.shader,
            this.digitNormalTextures,
            this.digitDamageTextures,
            creatureConfig,
            this.gridSettings,
            team,
            UnitType.CREATURE,
            new Sprite(this.gl, this.shader, texture),
            new Sprite(this.gl, this.shader, this.textures.tag.texture),
            new Sprite(this.gl, this.shader, this.textures.hourglass.texture),
            this.abilityFactory,
            this.abilityFactory.getEffectsFactory(),
            summoned,
            this.textures,
            //      new MeleeAI(this.world, this.gridSettings, this.board),
        );
    }

    public makeHero(faction: FactionType, team: TeamType, heroType: HeroType, gender: HeroGender): Unit {
        const heroKey = generateHeroKey(faction, heroType, gender);

        const textureWithNamePair = this.getRandomHeroTexture(heroKey);
        if (!textureWithNamePair?.length) {
            throw new ReferenceError(`Texture for hero key ${heroKey} not found`);
        }

        const heroNames = FACTION_HERO_GENDER_TO_NAME[heroKey];
        const heroName = heroNames ? heroNames[HoCLib.getRandomInt(0, heroNames.length)] : "";

        if (!heroName) {
            throw new Error(`Hero name for hero key ${heroKey} not found`);
        }

        const textureName = textureWithNamePair[0];
        const largeTextureName = `${textureName.split("_").slice(0, -1).join("_")}_512`;
        const texture = textureWithNamePair[1];

        return new Hero(
            this.gl,
            this.shader,
            this.digitNormalTextures,
            this.digitDamageTextures,
            HoCConfig.getHeroConfig(team, faction, heroName, largeTextureName),
            this.gridSettings,
            team,
            new Sprite(this.gl, this.shader, texture),
            new Sprite(this.gl, this.shader, this.textures.tag.texture),
            new Sprite(this.gl, this.shader, this.textures.hourglass.texture),
            this.abilityFactory,
            this.textures,
            //      new MeleeAI(this.world, this.gridSettings, this.board),
        );
    }
}
