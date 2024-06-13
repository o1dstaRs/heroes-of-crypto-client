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

export class AbilitiesFactory {
    protected readonly gl: WebGLRenderingContext;

    protected readonly shader: DefaultShader;

    protected readonly texturesBySpellName: { [id: string]: WebGLTexture };

    protected readonly effectsFactory: EffectsFactory;

    public constructor(
        gl: WebGLRenderingContext,
        shader: DefaultShader,
        textures: PreloadedTextures,
        effectsFactory: EffectsFactory,
    ) {
        this.gl = gl;
        this.shader = shader;
        this.texturesBySpellName = {
            "Double Punch": textures.double_punch_256.texture,
            "Double Shot": textures.double_shot_256.texture,
            Sniper: textures.sniper_256.texture,
            "Leather Armor": textures.leather_armor_256.texture,
            "Limited Supply": textures.limited_supply_256.texture,
            Backstab: textures.backstab_256.texture,
            Handyman: textures.handyman_256.texture,
            Stun: textures.stun_256.texture,
            "Endless Quiver": textures.endless_quiver_256.texture,
            "One in the Field": textures.one_in_the_field_256.texture,
            "Shadow Touch": textures.shadow_touch_256.texture,
            "Wild Regeneration": textures.wild_regeneration_256.texture,
            "Enchanted Skin": textures.enchanted_skin_256.texture,
            "Lightning Spin": textures.lightning_spin_256.texture,
            "Fire Breath": textures.fire_breath_256.texture,
            "Fire Shield": textures.fire_shield_256.texture,
            "Fire Element": textures.fire_element_256.texture,
            Undead: textures.undead_256.texture,
            "Boost Health": textures.boost_health_256.texture,
            "Piercing Spear": textures.piercing_spear_256.texture,
            "Heavy Armor": textures.heavy_armor_256.texture,
            "No Melee": textures.no_melee_256.texture,
        };
        this.effectsFactory = effectsFactory;
    }

    public makeAbility(name: string) {
        return new Ability(
            getAbilityConfig(name),
            new Sprite(this.gl, this.shader, this.texturesBySpellName[name]),
            this.effectsFactory.makeEffect(getAbilityConfig(name).effect),
        );
    }
}
