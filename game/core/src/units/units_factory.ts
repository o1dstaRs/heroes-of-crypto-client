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
import { AllFactions, FactionType, HoCLib, TeamType, GridSettings, UnitType } from "@heroesofcrypto/common";

import { AbilitiesFactory } from "../abilities/abilities_factory";
import { getUnitConfig } from "../config_provider";
import { SpellsFactory } from "../spells/spells_factory";
import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { Unit } from "./units";
import { Hero } from "./heroes";

export enum HeroType {
    NO_TYPE = 0,
    MAGICIAN = 1,
    WARRIOR = 2,
}

export enum HeroGender {
    NO_GENDER = 0,
    MALE = 1,
    FEMALE = 2,
}

const FACTION_TO_HERO_TYPES: { [faction: string]: HeroType[] } = {
    [FactionType.NATURE]: [HeroType.MAGICIAN, HeroType.WARRIOR],
};

export class UnitsFactory {
    protected readonly world: b2World;

    protected readonly gl: WebGLRenderingContext;

    protected readonly shader: DefaultShader;

    protected readonly gridSettings: GridSettings;

    protected readonly unitSize: number;

    protected readonly textures: PreloadedTextures;

    protected readonly smallTexturesByCreatureName: { [id: string]: WebGLTexture };

    protected readonly smallTexturesByHero: Map<string, WebGLTexture[]>;

    //    protected readonly largeTexturesByUnitName: { [id: string]: WebGLTexture };

    protected readonly digitNormalTextures: Map<number, WebGLTexture>;

    protected readonly digitDamageTextures: Map<number, WebGLTexture>;

    protected readonly spellsFactory: SpellsFactory;

    protected readonly abilitiesFactory: AbilitiesFactory;

    public constructor(
        world: b2World,
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        digitNormalTextures: Map<number, WebGLTexture>,
        digitDamageTextures: Map<number, WebGLTexture>,
        gridSettings: GridSettings,
        textures: PreloadedTextures,
        spellsFactory: SpellsFactory,
        abilitiesFactory: AbilitiesFactory,
    ) {
        this.world = world;
        this.gl = gl;
        this.shader = shader;
        this.digitNormalTextures = digitNormalTextures;
        this.digitDamageTextures = digitDamageTextures;
        this.unitSize = gridSettings.getUnitSize();
        this.gridSettings = gridSettings;
        this.textures = textures;
        this.spellsFactory = spellsFactory;
        this.abilitiesFactory = abilitiesFactory;
        this.smallTexturesByCreatureName = {
            Squire: textures.squire_128.texture,
            Peasant: textures.peasant_128.texture,
            Arbalester: textures.arbalester_128.texture,
            Pikeman: textures.pikeman_128.texture,
            Crusader: textures.crusader_128.texture,
            Griffin: textures.griffin_128.texture,
            "Tsar Cannon": textures.tsar_cannon_256.texture,
            Angel: textures.angel_256.texture,
            Fairy: textures.fairy_128.texture,
            Wolf: textures.wolf_128.texture,
            Leprechaun: textures.leprechaun_128.texture,
            "White Tiger": textures.white_tiger_128.texture,
            Elf: textures.elf_128.texture,
            Satyr: textures.satyr_128.texture,
            Unicorn: textures.unicorn_128.texture,
            Phoenix: textures.phoenix_256.texture,
            "Faerie Dragon": textures.faerie_dragon_256.texture,
            Gargantuan: textures.gargantuan_256.texture,
            Scavenger: textures.scavenger_128.texture,
            Orc: textures.orc_128.texture,
            Troglodyte: textures.troglodyte_128.texture,
            Medusa: textures.medusa_128.texture,
            Troll: textures.troll_128.texture,
            Beholder: textures.beholder_128.texture,
            Efreet: textures.efreet_128.texture,
            "Goblin Knight": textures.goblin_knight_128.texture,
            "Black Dragon": textures.black_dragon_256.texture,
            Hydra: textures.hydra_256.texture,
            Skeleton: textures.skeleton_128.texture,
            Imp: textures.imp_128.texture,
            Zombie: textures.zombie_128.texture,
            "Dark Champion": textures.dark_champion_256.texture,
            Berserker: textures.berserker_128.texture,
            Centaur: textures.centaur_128.texture,
            "Wolf Rider": textures.wolf_rider_128.texture,
            Nomad: textures.nomad_128.texture,
            Harpy: textures.harpy_128.texture,
            "Ogre Mage": textures.ogre_mage_128.texture,
            Cyclops: textures.cyclops_128.texture,
            Thunderbird: textures.thunderbird_256.texture,
            Behemoth: textures.behemoth_256.texture,
        };

        this.smallTexturesByHero = new Map();
        for (const faction of AllFactions) {
            const heroTypes = FACTION_TO_HERO_TYPES[faction];
            if (!heroTypes?.length) {
                continue;
            }

            for (const heroType of heroTypes) {
                this.smallTexturesByHero.set(this.generateHeroKey(faction, heroType, HeroGender.FEMALE), []);
                this.smallTexturesByHero.set(this.generateHeroKey(faction, heroType, HeroGender.MALE), [
                    textures.nature_mage_1_128.texture,
                ]);
            }
        }

        // this.largeTexturesByUnitName = {
        //     Squire: textures.squire_512.texture,
        //     Peasant: textures.peasant_512.texture,
        //     Arbalester: textures.arbalester_512.texture,
        //     Pikeman: textures.pikeman_512.texture,
        //     Scavenger: textures.scavenger_512.texture,
        //     Orc: textures.orc_512.texture,
        //     Troglodyte: textures.troglodyte_512.texture,
        //     Skeleton: textures.skeleton_512.texture,
        //     Imp: textures.imp_512.texture,
        //     Zombie: textures.zombie_512.texture,
        //     Berserker: textures.berserker_512.texture,
        //     Centaur: textures.centaur_512.texture,
        //     "Wolf Rider": textures.wolf_rider_512.texture,
        // };
    }

    private generateHeroKey(faction: FactionType, heroType: HeroType, heroGender: HeroGender) {
        return `${faction}:${heroType}:${heroGender}}`;
    }

    private getRandomHeroTexture(heroKey: string): WebGLTexture | undefined {
        const textures = this.smallTexturesByHero.get(heroKey);
        if (textures?.length) {
            return textures[HoCLib.getRandomInt(0, textures.length)];
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
        const texture = this.smallTexturesByCreatureName[name];
        if (!texture) {
            throw new ReferenceError(`Texture for creature ${name} not found`);
        }

        return new Unit(
            this.gl,
            this.shader,
            this.digitNormalTextures,
            this.digitDamageTextures,
            getUnitConfig(team, faction, name, amount, totalExp),
            this.gridSettings,
            team,
            UnitType.CREATURE,
            new Sprite(this.gl, this.shader, texture),
            new Sprite(this.gl, this.shader, this.textures.tag.texture),
            new Sprite(this.gl, this.shader, this.textures.hourglass.texture),
            new Sprite(this.gl, this.shader, this.textures.green_flag_70.texture),
            new Sprite(this.gl, this.shader, this.textures.red_flag_70.texture),
            this.spellsFactory,
            this.abilitiesFactory,
            summoned,
            //      new MeleeAI(this.world, this.gridSettings, this.board),
        );
    }

    public makeHero(
        faction: FactionType,
        name: string,
        team: TeamType,
        heroType: HeroType,
        gender: HeroGender,
        totalExp?: number,
    ): Unit {
        const heroKey = this.generateHeroKey(faction, heroType, gender);

        const texture = this.getRandomHeroTexture(heroKey);
        if (!texture) {
            throw new ReferenceError(`Texture for hero key ${heroKey} not found`);
        }

        return new Hero(
            this.gl,
            this.shader,
            this.digitNormalTextures,
            this.digitDamageTextures,
            getUnitConfig(team, faction, name, 1, totalExp),
            this.gridSettings,
            team,
            new Sprite(this.gl, this.shader, texture),
            new Sprite(this.gl, this.shader, this.textures.tag.texture),
            new Sprite(this.gl, this.shader, this.textures.hourglass.texture),
            new Sprite(this.gl, this.shader, this.textures.green_flag_70.texture),
            new Sprite(this.gl, this.shader, this.textures.red_flag_70.texture),
            this.spellsFactory,
            this.abilitiesFactory,
            //      new MeleeAI(this.world, this.gridSettings, this.board),
        );
    }
}
