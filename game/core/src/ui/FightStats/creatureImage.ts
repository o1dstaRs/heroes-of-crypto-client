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
export const creatureImgSrc = (name: string | undefined): string | undefined => resolveCreatureImgSrc(name, imgSrc);

/**
 * The fallback walk itself, with the art set injected.
 *
 * CI replaces the generated image manifest with a stub that answers EVERY key (scripts/generate_ci_stubs.js),
 * so a missing size can only be exercised through a supplied lookup — asserting it against the real manifest
 * passes locally and fails on CI.
 */
export const resolveCreatureImgSrc = (
    name: string | undefined,
    lookup: (key: string) => string | undefined,
): string | undefined => {
    if (!name) {
        return undefined;
    }
    const direct = lookup(name);
    if (direct) {
        return direct;
    }
    const base = /^(.*)_\d+$/.exec(name)?.[1];
    if (!base) {
        return undefined;
    }
    for (const size of CREATURE_TEXTURE_SIZES) {
        const alternative = lookup(`${base}_${size}`);
        if (alternative) {
            return alternative;
        }
    }
    return lookup(`${base}_board_128`);
};
