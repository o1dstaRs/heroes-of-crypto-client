import { images } from "../generated/image_imports";

const imageMap = images as Record<string, string | undefined>;

const stripImageExtension = (value: string): string => value.replace(/\.(webp|png|jpg|jpeg|gif|avif)$/i, "");

const basename = (value: string): string => value.split(/[\\/]/).pop() ?? value;

const slugUnitName = (unitName?: string): string =>
    (unitName ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

const resolveImageKey = (key: string): string | undefined => {
    const direct = imageMap[key];
    if (direct) {
        return direct;
    }

    const match = key.match(/^(.*)_(128|256|512)$/);
    const base = match?.[1] ?? key;
    if (!base) {
        return undefined;
    }

    return imageMap[`${base}_512`] ?? imageMap[`${base}_256`] ?? imageMap[`${base}_128`];
};

export const resolveUnitImage = (textureName?: string, unitName?: string): string | undefined => {
    const rawTextureName = textureName?.trim();
    if (rawTextureName && /^(https?:|data:|blob:)/i.test(rawTextureName)) {
        return rawTextureName;
    }

    const normalizedTextureName = rawTextureName ? stripImageExtension(basename(rawTextureName)) : "";
    const direct = normalizedTextureName ? resolveImageKey(normalizedTextureName) : undefined;
    if (direct) {
        return direct;
    }

    const unitSlug = slugUnitName(unitName);
    if (unitSlug) {
        const sizeSuffix = normalizedTextureName.match(/_(128|256|512)$/)?.[0] ?? "";
        const namedTexture = sizeSuffix ? resolveImageKey(`${unitSlug}${sizeSuffix}`) : undefined;
        return namedTexture ?? resolveImageKey(unitSlug) ?? imageMap.unknown_creature_512;
    }

    return imageMap.unknown_creature_512;
};
