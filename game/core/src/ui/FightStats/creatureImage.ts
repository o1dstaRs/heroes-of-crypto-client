import { images } from "../../generated/image_imports";

/** Raw lookup in the generated image map (also used for UI art, which is always named exactly). */
export const imgSrc = (name: string): string | undefined => (images as Record<string, string>)[name];

const CREATURE_TEXTURE_SIZES = ["512", "256", "128"] as const;

/**
 * A creature's portrait, by the small-texture name the unit carries.
 *
 * Creature configs derive that name's SIZE, and the art set does not always hold that size: griffin_256 and
 * wandering_mage_128 have no image, while griffin_512 and wandering_mage_512 do. Callers must never treat a
 * missing portrait as a missing creature — the casualty chart used to drop a death marker whenever the lookup
 * failed, so an army that was wiped out showed fewer markers than the creatures that actually fell.
 */
export const creatureImgSrc = (name: string | undefined): string | undefined => {
    if (!name) {
        return undefined;
    }
    const direct = imgSrc(name);
    if (direct) {
        return direct;
    }
    const base = /^(.*)_\d+$/.exec(name)?.[1];
    if (!base) {
        return undefined;
    }
    for (const size of CREATURE_TEXTURE_SIZES) {
        const alternative = imgSrc(`${base}_${size}`);
        if (alternative) {
            return alternative;
        }
    }
    return imgSrc(`${base}_board_128`);
};
