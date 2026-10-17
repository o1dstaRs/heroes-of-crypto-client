import { images } from "../generated/image_imports";

/** The art an ability's icon is published under: its name, lowercased, spaces to underscores, at 256. */
export const abilityImageKey = (abilityName: string): string => `${abilityName.toLowerCase().replace(/\s+/g, "_")}_256`;

/**
 * Abilities whose art does not follow from their current name.
 *
 * The aura family became blessings — the ABILITY was renamed, the art file was not — so the conventional
 * key resolved to nothing and the pick card drew a browser's broken-image glyph next to the creature's
 * other two icons (owner report 2026-09-19, Manticore's Warding Mane). Each alias points the current
 * name's key at the art that still carries the old one, and is consulted only AFTER the conventional key,
 * so renaming the file on the Drive retires its alias without another code change.
 */
export const ABILITY_IMAGE_ALIASES: Readonly<Record<string, string>> = {
    warding_mane_blessing_256: "warding_mane_aura_256",
    arrows_wingshield_blessing_256: "arrows_wingshield_aura_256",
    angelic_host_blessing_256: "angelic_host_256",
};

/**
 * The icon for an ability, looked up through `lookup` so a test can supply a known art set: the generated
 * map answers every key on CI (scripts/generate_ci_stubs.js), which would make any assertion about missing
 * art pass there and fail nowhere.
 */
export const resolveAbilityImage = (
    abilityName: string,
    lookup: (key: string) => string | undefined,
): string | undefined => {
    const key = abilityImageKey(abilityName);
    const exact = lookup(key);
    if (exact) {
        return exact;
    }
    const alias = ABILITY_IMAGE_ALIASES[key];
    return alias ? lookup(alias) : undefined;
};

/** The icon for an ability from the generated art map. */
export const abilityImage = (abilityName: string): string | undefined =>
    resolveAbilityImage(abilityName, (key) => (images as Record<string, string>)[key]);
