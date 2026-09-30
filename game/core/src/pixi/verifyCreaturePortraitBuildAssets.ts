import { REQUIRED_FULL_BODY_PORTRAIT_SOURCES } from "./creaturePortraitAssetKeys";

/** Inspect actual URL entries, not the ImageKey union that also includes production-omitted files. */
export function verifyCreaturePortraitBuildAssets(imageMap: string): void {
    const imageObject = imageMap.match(/export const images = \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const includedKeys = new Set([...imageObject.matchAll(/^\s*"([^"]+)":\s*new URL\(/gm)].map((match) => match[1]));
    const missing = Object.entries(REQUIRED_FULL_BODY_PORTRAIT_SOURCES)
        .filter(([, alternatives]) => !alternatives.some((key) => includedKeys.has(key)))
        .map(([name, alternatives]) => `${name} (${alternatives.join(" or ")})`);

    if (missing.length) {
        throw new Error(`Missing approved creature portrait sources: ${missing.join(", ")}. Run build:images.`);
    }
}
