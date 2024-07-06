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

import { getAbilityConfig } from "../config_provider";
import { EffectsFactory } from "../effects/effects_factory";
import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { Ability } from "./abilities";

export const abilityToTextureName = (abilityName: string): string =>
    `${abilityName.toLowerCase().replace(/ /g, "_")}_256`;

export class AbilitiesFactory {
    protected readonly gl: WebGLRenderingContext;

    protected readonly shader: DefaultShader;

    protected readonly textures: PreloadedTextures;

    protected readonly effectsFactory: EffectsFactory;

    public constructor(
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        textures: PreloadedTextures,
        effectsFactory: EffectsFactory,
    ) {
        this.gl = gl;
        this.shader = shader;
        this.textures = textures;
        this.effectsFactory = effectsFactory;
    }

    public makeAbility(name: string) {
        const abilityConfig = getAbilityConfig(name);

        const textureName = abilityToTextureName(name);
        const texture = (this.textures as Record<string, { texture: WebGLTexture }>)[textureName]?.texture;
        if (!texture) {
            throw new ReferenceError(`Texture for ability ${name} not found`);
        }

        return new Ability(
            abilityConfig,
            new Sprite(this.gl, this.shader, texture),
            this.effectsFactory.makeEffect(abilityConfig.effect),
        );
    }
}
