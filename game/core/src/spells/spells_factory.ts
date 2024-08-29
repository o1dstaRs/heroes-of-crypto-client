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

import { FactionType, HoCConfig, SpellProperties } from "@heroesofcrypto/common";

import { DefaultShader } from "../utils/gl/defaultShader";
import { Sprite } from "../utils/gl/Sprite";
import { Spell } from "./spells";
import { PreloadedTextures } from "../utils/gl/preload";


export class SpellsFactory {
    public constructor(
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        texturesByDigit: Map<number, WebGLTexture>,
        textures: PreloadedTextures,
    ) {
        this.gl = gl;
        this.shader = shader;
        this.texturesByDigit = texturesByDigit;
        this.textures = textures;
    }

    public makeSpell(faction: FactionType, name: string, amount: number): Spell {
        return new Spell({ spellProperties: HoCConfig.getSpellConfig(faction, name), amount });
    }
}
