import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// AGENTS.md is the policy of record: static game images are WebP no larger than 1,766,026 bytes, and
// animation-atlas WebPs are exempt from ONLY the size ceiling (they still must be valid WebP). The
// previous 120,000-byte constant contradicted that documented rule and had never actually run against
// the real art set — every machine's HOC_IMAGES_LOC contained "Dropbox", which the checker skips, so
// the gate was vacuous until the Google Drive switch made it live.
export const MAX_STATIC_GAME_IMAGE_BYTES = 1_766_026;

const ATLAS_WEBP = /_atlas(?:_half|_quarter)?(?:_v\d+)?\.webp$/i;

export function isAtlasWebP(fileName: string): boolean {
    return ATLAS_WEBP.test(fileName);
}

const IMAGE_FILE = /\.(?:apng|avif|bmp|gif|heic|heif|ico|jpe?g|png|psd|svg|tiff?|webp)$/i;
const WEBP_FILE = /\.webp$/i;

export interface GameImageAssetMetadata {
    fileName: string;
    sizeBytes: number;
    header: Uint8Array;
}

export function isImageFile(fileName: string): boolean {
    return IMAGE_FILE.test(fileName);
}

export function isWebPFile(fileName: string): boolean {
    return WEBP_FILE.test(fileName);
}

export function hasWebPHeader(header: Uint8Array): boolean {
    return (
        header.length >= 12 &&
        header[0] === 0x52 &&
        header[1] === 0x49 &&
        header[2] === 0x46 &&
        header[3] === 0x46 &&
        header[8] === 0x57 &&
        header[9] === 0x45 &&
        header[10] === 0x42 &&
        header[11] === 0x50
    );
}

export function validateGameImageAsset({ fileName, sizeBytes, header }: GameImageAssetMetadata): string[] {
    if (!isImageFile(fileName)) {
        return [];
    }

    const violations: string[] = [];

    if (!isWebPFile(fileName)) {
        violations.push(`${fileName}: game images must use the .webp extension`);
    }

    if (sizeBytes === 0) {
        violations.push(`${fileName}: image is empty`);
    } else if (!hasWebPHeader(header)) {
        violations.push(`${fileName}: file contents are not a valid WebP container`);
    }

    if (sizeBytes > MAX_STATIC_GAME_IMAGE_BYTES && !isAtlasWebP(fileName)) {
        violations.push(`${fileName}: ${sizeBytes} bytes exceeds the ${MAX_STATIC_GAME_IMAGE_BYTES}-byte image limit`);
    }

    return violations;
}

export async function findGameImageAssetViolations(imageDirectory: string): Promise<string[]> {
    const entries = await readdir(imageDirectory, { withFileTypes: true });
    const violations: string[] = [];

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!entry.isFile() || !isImageFile(entry.name)) {
            continue;
        }

        const filePath = join(imageDirectory, entry.name);
        const fileStat = await stat(filePath);
        const file = await open(filePath, "r");
        const header = new Uint8Array(12);

        try {
            await file.read(header, 0, header.length, 0);
        } finally {
            await file.close();
        }

        violations.push(
            ...validateGameImageAsset({
                fileName: entry.name,
                sizeBytes: fileStat.size,
                header,
            }),
        );
    }

    return violations;
}
