/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

/**
 * The `nextStandingTargets` flags for the hover preview of a piercing melee sweep.
 *
 * Fire Breath and Skewer Strike both sweep "the unit(s) standing behind the target", so the hover asks
 * the same helper for both — but the two abilities call it with DIFFERENT flags, and the preview used a
 * single hardcoded `pierceLargeUnits = true` for whichever fired:
 *
 *   fire_breath_ability.ts    -> defaults: pierceLargeUnits = true,  onlyOppositeTeam = false
 *   skewer_strike_ability.ts  ->           pierceLargeUnits = false, onlyOppositeTeam = true
 *
 * `pierceLargeUnits = false` makes `nextStandingTargets` return NOTHING when the primary target is a large
 * unit — a Pikeman's spear does not carry through a 2x2 body. Previewing it as `true` red-outlined units
 * behind a large target that the engine then never damages: the highlight promised a hit the swing could
 * not deliver. Only the preview was wrong; the damage was always correct.
 *
 * No creature carries both abilities (Pikeman skewers, Black Dragon breathes), so keying off Fire Breath
 * resolves the hypothetical overlap the same way the preview's own damage-source label already does.
 */
export interface IPierceSweepPreviewOptions {
    pierceLargeUnits: boolean;
    onlyOppositeTeam: boolean;
    source: "Fire Breath" | "Skewer Strike";
}

export const pierceSweepPreviewOptions = (attacker: {
    hasAbilityActive(abilityName: string): boolean;
}): IPierceSweepPreviewOptions => {
    const hasFireBreath = attacker.hasAbilityActive("Fire Breath");
    return {
        pierceLargeUnits: hasFireBreath,
        onlyOppositeTeam: attacker.hasAbilityActive("Skewer Strike"),
        source: hasFireBreath ? "Fire Breath" : "Skewer Strike",
    };
};
