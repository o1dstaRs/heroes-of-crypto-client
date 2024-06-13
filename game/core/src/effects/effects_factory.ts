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

import { getEffectConfig } from "../config_provider";
import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { Effect, EffectStats } from "./effects";

export class EffectsFactory {
    protected readonly gl: WebGLRenderingContext;

    protected readonly shader: DefaultShader;

    protected readonly texturesBySpellName: { [id: string]: WebGLTexture };

    public constructor(gl: WebGLRenderingContext, shader: DefaultShader, textures: PreloadedTextures) {
        this.gl = gl;
        this.shader = shader;
        this.texturesBySpellName = {
            Stun: textures.stun_256.texture,
        };
    }

    public makeEffect(name: string | null): Effect | undefined {
        if (!name) {
            return undefined;
        }

        const config = getEffectConfig(name);
        if (!(config instanceof EffectStats)) {
            return undefined;
        }

        return new Effect(config, new Sprite(this.gl, this.shader, this.texturesBySpellName[name]));
    }
}
