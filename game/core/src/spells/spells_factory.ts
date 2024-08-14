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

import { FactionType } from "@heroesofcrypto/common";

import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { getSpellConfig } from "../config_provider";
import { Spell } from "./spells";

export class SpellsFactory {
    protected readonly gl: WebGLRenderingContext;

    protected readonly shader: DefaultShader;

    protected readonly texturesBySpellName: { [id: string]: WebGLTexture };

    protected readonly fontTexturesBySpellName: { [id: string]: WebGLTexture };

    protected readonly texturesByDigit: Map<number, WebGLTexture>;

    public constructor(
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        texturesByDigit: Map<number, WebGLTexture>,
        textures: PreloadedTextures,
    ) {
        this.gl = gl;
        this.shader = shader;
        this.texturesBySpellName = {
            "Totem of Courage": textures.totel_of_courage_256.texture,
            "Helping Hand": textures.helping_hand_256.texture,
            "Summon Wolves": textures.summon_wolves_256.texture,
            Riot: textures.riot_256.texture,
            "Mass Riot": textures.mass_riot_256.texture,
            "Magic Mirror": textures.magic_mirror_256.texture,
            "Mass Magic Mirror": textures.mass_magic_mirror_256.texture,
        };
        this.fontTexturesBySpellName = {
            "Totem of Courage": textures.totem_of_courage_font.texture,
            "Helping Hand": textures.helping_hand_font.texture,
            "Summon Wolves": textures.summon_wolves_font.texture,
            Riot: textures.riot_font.texture,
            "Mass Riot": textures.mass_riot_font.texture,
            "Magic Mirror": textures.magic_mirror_font.texture,
            "Mass Magic Mirror": textures.mass_magic_mirror_font.texture,
        };
        this.texturesByDigit = texturesByDigit;
    }

    public makeSpell(faction: FactionType, name: string, amount: number): Spell {
        return new Spell(
            this.gl,
            this.shader,
            getSpellConfig(faction, name),
            amount,
            new Sprite(this.gl, this.shader, this.texturesBySpellName[name]),
            new Sprite(this.gl, this.shader, this.fontTexturesBySpellName[name]),
            this.texturesByDigit,
        );
    }
}
