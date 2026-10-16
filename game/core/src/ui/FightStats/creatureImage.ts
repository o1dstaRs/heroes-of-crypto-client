import { images } from "../../generated/image_imports";
import { isRetiredCreatureThumbnail } from "../../pixi/retiredCreatureThumbnails";
import { resolveCreaturePortraitVisual } from "../creaturePortraitVisual";
import { UNIT_NAME_TO_ID } from "../unit_ui_constants";

/** Raw lookup in the generated image map (also used for UI art, which is always named exactly). */
export const imgSrc = (name: string): string | undefined => (images as Record<string, string>)[name];

const CREATURE_TEXTURE_SIZES = ["512", "256", "128"] as const;

/** Resolve current card artwork by creature identity, including snapshots carrying retired board keys. */
export const creatureImgSrc = (name: string | undefined, creatureName?: string): string | undefined => {
    const knownName =
        creatureName?.trim() ??
        Object.keys(UNIT_NAME_TO_ID).find((unitName) =>
            name?.startsWith(`${unitName.toLowerCase().replace(/ /g, "_")}_`),
        );
    const creatureId = knownName === undefined ? undefined : UNIT_NAME_TO_ID[knownName];
    if (creatureId !== undefined) return resolveCreaturePortraitVisual(creatureId)?.source;
    return resolveCreatureImgSrc(name, imgSrc);
};

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
    const direct = isRetiredCreatureThumbnail(name) ? undefined : lookup(name);
    if (direct) {
        return direct;
    }
    const base = /^(.*)_\d+$/.exec(name)?.[1];
    if (!base) {
        return undefined;
    }
    for (const size of CREATURE_TEXTURE_SIZES) {
        const key = `${base}_${size}`;
        const alternative = isRetiredCreatureThumbnail(key) ? undefined : lookup(key);
        if (alternative) {
            return alternative;
        }
    }
    return lookup(`${base}_board_128`);
};
