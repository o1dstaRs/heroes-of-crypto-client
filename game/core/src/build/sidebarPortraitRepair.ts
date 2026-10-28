import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

export interface SidebarPortraitRepair {
    format: "normalized-rgba-replace-v1";
    path: string;
    bytes: number;
    sha256: string;
    decodedBytes: number;
    frameCount: number;
}

export interface DecodedSidebarPortraitRepair {
    frameWidth: number;
    frameHeight: number;
    frames: Buffer[];
}

/** Approved literal pixel corrections, applied during asset export only. */
export function decodeSidebarPortraitRepair(
    compressed: Buffer,
    repair: SidebarPortraitRepair,
    frameWidth: number,
    frameHeight: number,
): DecodedSidebarPortraitRepair {
    if (
        repair.format !== "normalized-rgba-replace-v1" ||
        ![frameWidth, frameHeight, repair.frameCount, repair.decodedBytes].every(
            (value) => Number.isSafeInteger(value) && value > 0,
        ) ||
        !Number.isSafeInteger(frameWidth * frameHeight) ||
        repair.frameCount > 1000 ||
        repair.decodedBytes > 128 * 1024 * 1024 ||
        compressed.length !== repair.bytes ||
        createHash("sha256").update(compressed).digest("hex") !== repair.sha256
    )
        throw new Error("Portrait repair identity or geometry differs from the release");
    const data = inflateSync(compressed, { maxOutputLength: repair.decodedBytes });
    if (
        data.length !== repair.decodedBytes ||
        data.length < 16 ||
        data.toString("ascii", 0, 4) !== "HPR1" ||
        data.readUInt32LE(4) !== frameWidth ||
        data.readUInt32LE(8) !== frameHeight ||
        data.readUInt32LE(12) !== repair.frameCount
    )
        throw new Error("Invalid portrait repair header");
    let offset = 16;
    const frames: Buffer[] = [];
    for (let frame = 0; frame < repair.frameCount; frame++) {
        if (offset + 4 > data.length) throw new Error("Truncated portrait repair");
        const count = data.readUInt32LE(offset);
        offset += 4;
        const end = offset + count * 8;
        if (end > data.length) throw new Error("Truncated portrait repair records");
        const records = data.subarray(offset, end);
        let previous = -1;
        for (let i = 0; i < records.length; i += 8) {
            const index = records.readUInt32LE(i);
            if (index <= previous || index >= frameWidth * frameHeight)
                throw new Error("Invalid portrait repair pixel order");
            previous = index;
        }
        frames.push(records);
        offset = end;
    }
    if (offset !== data.length) throw new Error("Unexpected portrait repair data");
    return { frameWidth, frameHeight, frames };
}

/** Preserve pose order and untouched pixels when exporting one horizontal page. */
export function applySidebarPortraitRepair(
    page: Buffer,
    repair: DecodedSidebarPortraitRepair,
    frameWidth: number,
    frameHeight: number,
    firstFrame: number,
    frameCount: number,
): void {
    if (
        ![frameWidth, frameHeight, frameCount].every((value) => Number.isSafeInteger(value) && value > 0) ||
        !Number.isInteger(firstFrame) ||
        firstFrame < 0 ||
        frameWidth !== repair.frameWidth ||
        frameHeight !== repair.frameHeight ||
        page.length !== frameWidth * frameHeight * frameCount * 4 ||
        firstFrame + frameCount > repair.frames.length
    )
        throw new Error("Portrait repair page lies outside its source sequence");
    // Transparent WebP RGB is unspecified. It must not affect reproducible exports.
    for (let i = 0; i < page.length; i += 4) if (page[i + 3] === 0) page.fill(0, i, i + 3);
    const pageWidth = frameWidth * frameCount;
    for (let frame = 0; frame < frameCount; frame++) {
        const records = repair.frames[firstFrame + frame];
        for (let i = 0; i < records.length; i += 8) {
            const pixel = records.readUInt32LE(i);
            const destination =
                (Math.floor(pixel / frameWidth) * pageWidth + frame * frameWidth + (pixel % frameWidth)) * 4;
            records.copy(page, destination, i + 4, i + 8);
        }
    }
}
