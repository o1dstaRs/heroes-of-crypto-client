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

import { FactionType, HoCConfig } from "@heroesofcrypto/common";

import { DefaultShader } from "../utils/gl/defaultShader";
import { Sprite } from "../utils/gl/Sprite";
import { Spell } from "./spells";
import { PreloadedTextures } from "../utils/gl/preload";

export const spellToTextureNames = (spellName: string): [string, string] => {
    const baseName = spellName.toLowerCase().replace(/ /g, "_");
    return [`${baseName}_256`, `${baseName}_font`];
};

export class SpellsFactory {
    protected readonly gl: WebGLRenderingContext;

    protected readonly shader: DefaultShader;

    protected readonly texturesByDigit: Map<number, WebGLTexture>;

    protected readonly textures: PreloadedTextures;

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
        const textureNames = spellToTextureNames(name);
        return new Spell(
            this.gl,
            this.shader,
            HoCConfig.getSpellConfig(faction, name),
            amount,
            new Sprite(this.gl, this.shader, this.textures[textureNames[0] as keyof PreloadedTextures].texture),
            new Sprite(this.gl, this.shader, this.textures[textureNames[1] as keyof PreloadedTextures].texture),
            this.texturesByDigit,
        );
    }
}
