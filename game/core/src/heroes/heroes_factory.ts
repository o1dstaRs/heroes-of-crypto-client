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
import { FactionType, TeamType, GridSettings } from "@heroesofcrypto/common";

import { AbilitiesFactory } from "../abilities/abilities_factory";
import { getUnitConfig } from "../config_provider";
import { SpellsFactory } from "../spells/spells_factory";
import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { Unit } from "../units/units";
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

export class HeroesFactory {
    protected readonly world: b2World;

    protected readonly gl: WebGLRenderingContext;

    protected readonly shader: DefaultShader;

    protected readonly gridSettings: GridSettings;

    protected readonly unitSize: number;

    protected readonly textures: PreloadedTextures;

    protected readonly smallTexturesByUnitName: { [id: string]: WebGLTexture };

    //    protected readonly largeTexturesByUnitName: { [id: string]: WebGLTexture };

    protected readonly digitNormalTextures: Map<number, WebGLTexture>;

    protected readonly digitDamageTextures: Map<number, WebGLTexture>;

    protected readonly spellsFactory: SpellsFactory;

    protected readonly abilitiesFactory: AbilitiesFactory;

    /*
        faction_name: {
        : {
        }

    */

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
        this.smallTexturesByUnitName = {
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

    public makeHero(
        faction: FactionType,
        name: string,
        team: TeamType,
        heroType: HeroType,
        gender: HeroGender,
        totalExp?: number,
    ): Unit {
        return new Hero(
            this.gl,
            this.shader,
            this.digitNormalTextures,
            this.digitDamageTextures,
            getUnitConfig(team, faction, name, 1, totalExp),
            this.gridSettings,
            team,
            new Sprite(this.gl, this.shader, this.smallTexturesByUnitName[name]),
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
