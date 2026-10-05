import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const BUILD_IMAGES = path.resolve(import.meta.dir, "../../images");
const RECIPE = { quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true } as const;
const CACHE_VERSION = `portrait-webp-v1-${sharp.versions.sharp}-${sharp.versions.webp}`;

/** These complete approved canvases are build copies, never replacements for canonical artwork. */
export const isPortraitBuildCopy = (filename: string): boolean =>
    /^[a-z0-9_]+_(?:left_screen|pick_sandbox)_x2\.webp$/.test(filename);

/** Load the generated URLs only after the generator has written this build's complete manifest. */
export async function approvedRosterPortraitFilenames(imageDirectory = BUILD_IMAGES): Promise<ReadonlySet<string>> {
    const [{ UNIT_ID_TO_NAME, UNIT_ID_TO_IMAGE, fullBodyCreatureImage }, framing, { CreatureLevelMap }] =
        await Promise.all([
            import("../ui/unit_ui_constants"),
            import("../ui/portraitFraming"),
            import("@heroesofcrypto/common"),
        ]);
    const directory = path.resolve(imageDirectory);
    const filenames = new Set<string>();
    for (const id of Object.keys(UNIT_ID_TO_NAME).map(Number)) {
        if (CreatureLevelMap[id] < 1 || CreatureLevelMap[id] > 4 || !CreatureLevelMap[id]) continue;
        const approved = framing.PICK_PORTRAIT_FRAMING[id] ?? framing.DEFAULT_PORTRAIT_FRAMING;
        const source =
            approved.source === "full" ? (fullBodyCreatureImage(id) ?? UNIT_ID_TO_IMAGE[id]) : UNIT_ID_TO_IMAGE[id];
        if (!source) continue;
        const url = new URL(source);
        if (url.protocol !== "file:") continue;
        const filename = fileURLToPath(url);
        if (path.dirname(filename) === directory) filenames.add(path.basename(filename));
    }
    return filenames;
}

/** Read RIFF chunks rather than assuming that an extended WebP header means lossy encoding. */
export const isLosslessWebP = (buffer: Buffer): boolean => {
    if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP")
        return false;
    const end = buffer.readUInt32LE(4) + 8;
    if (end > buffer.length) return false;
    let lossless = false;
    for (let offset = 12; offset + 8 <= end;) {
        const kind = buffer.toString("ascii", offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const next = offset + 8 + size + (size % 2);
        if (next > end) return false;
        if (kind === "ANIM" || kind === "ANMF" || kind === "VP8 ") return false;
        if (kind === "VP8L") lossless = true;
        offset = next;
    }
    return lossless;
};

const containsPath = (parent: string, child: string): boolean =>
    parent === child || child.startsWith(`${parent}${path.sep}`);

const ordinaryDirectory = async (directory: string): Promise<boolean> => {
    const info = await lstat(directory);
    return info.isDirectory() && !info.isSymbolicLink() && (await realpath(directory)) === path.resolve(directory);
};

/** Rename a new ordinary file into place; never open an existing destination for writing. */
const atomicWrite = async (filename: string, bytes: Buffer): Promise<void> => {
    const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, bytes, { flag: "wx" });
        await rename(temporary, filename);
    } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
        });
    }
};

const safeCacheDirectory = async (imageDirectory: string, canonicalDirectory: string): Promise<string | undefined> => {
    const parent = path.resolve(imageDirectory, "../.cache");
    const directory = path.join(parent, CACHE_VERSION);
    if (containsPath(canonicalDirectory, directory) || containsPath(directory, canonicalDirectory)) return undefined;
    try {
        await mkdir(parent).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "EEXIST") throw error;
        });
        if (!(await ordinaryDirectory(parent))) return undefined;
        await mkdir(directory).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "EEXIST") throw error;
        });
        return (await ordinaryDirectory(directory)) ? directory : undefined;
    } catch (error) {
        console.warn("Portrait encoding cache unavailable; optimizing the local build copies without a cache.", error);
        return undefined;
    }
};

/** Validate the whole canvas and every alpha value before replacing a local build copy. */
export const hasMatchingPortraitCanvasAndAlpha = async (original: Buffer, encoded: Buffer): Promise<boolean> => {
    const planes = await Promise.all(
        [original, encoded].map((bytes) =>
            sharp(bytes).ensureAlpha().extractChannel("alpha").raw().toBuffer({ resolveWithObject: true }),
        ),
    );
    return (
        planes[0].info.width === planes[1].info.width &&
        planes[0].info.height === planes[1].info.height &&
        planes[0].data.equals(planes[1].data)
    );
};

export interface PortraitEncodingSummary {
    optimized: number;
    cached: number;
    alreadyLossy: number;
    notSmaller: number;
    skippedUnsafe: number;
    bytesBefore: number;
    bytesAfter: number;
    skippedReason?: string;
}

export async function optimizePortraitBuildCopies(
    imageDirectory = BUILD_IMAGES,
    canonicalLocation = process.env.HOC_IMAGES_LOC,
    approvedRosterFiles: ReadonlySet<string> = new Set(),
): Promise<PortraitEncodingSummary> {
    const summary: PortraitEncodingSummary = {
        optimized: 0,
        cached: 0,
        alreadyLossy: 0,
        notSmaller: 0,
        skippedUnsafe: 0,
        bytesBefore: 0,
        bytesAfter: 0,
    };
    if (!canonicalLocation?.trim()) {
        summary.skippedReason = "HOC_IMAGES_LOC is not configured; refusing to optimize an unverified directory.";
        return summary;
    }
    const directory = path.resolve(imageDirectory);
    if (!(await ordinaryDirectory(directory))) {
        summary.skippedReason = "The build image directory is not an ordinary local directory.";
        return summary;
    }
    const canonicalDirectory = await realpath(canonicalLocation.trim());
    if (containsPath(canonicalDirectory, directory) || containsPath(directory, canonicalDirectory)) {
        summary.skippedReason = "The build image directory aliases or contains canonical artwork.";
        return summary;
    }
    const cache = await safeCacheDirectory(directory, canonicalDirectory);
    const filenames = (await readdir(directory))
        .filter(
            (filename) =>
                isPortraitBuildCopy(filename) ||
                (/^[a-z0-9_]+\.webp$/.test(filename) && approvedRosterFiles.has(filename)),
        )
        .sort();
    let cursor = 0;
    const optimize = async (filename: string): Promise<void> => {
        const target = path.join(directory, filename);
        const before = await lstat(target);
        if (!before.isFile() || before.isSymbolicLink() || (await realpath(target)) !== target) {
            summary.skippedUnsafe++;
            return;
        }
        const input = await readFile(target);
        summary.bytesBefore += input.length;
        summary.bytesAfter += input.length;
        if (!isLosslessWebP(input)) {
            summary.alreadyLossy++;
            return;
        }
        const hash = createHash("sha256").update(JSON.stringify(RECIPE)).update(input).digest("hex");
        const cachedFile = cache ? path.join(cache, `${hash}.webp`) : undefined;
        let encoded: Buffer | undefined;
        if (cachedFile) {
            try {
                const info = await lstat(cachedFile);
                if (info.isFile() && !info.isSymbolicLink()) encoded = await readFile(cachedFile);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            }
        }
        const cached = !!encoded;
        encoded ??= await sharp(input).webp(RECIPE).toBuffer();
        if (encoded.length >= input.length) {
            summary.notSmaller++;
            return;
        }
        if (!(await hasMatchingPortraitCanvasAndAlpha(input, encoded)))
            throw new Error(`Portrait encoding changed the canvas or alpha: ${filename}`);
        // A parallel build may have replaced the copy while it encoded. Leave the newer file alone.
        const current = await lstat(target);
        if (
            !current.isFile() ||
            current.isSymbolicLink() ||
            current.ino !== before.ino ||
            current.size !== before.size ||
            current.mtimeMs !== before.mtimeMs ||
            !(await ordinaryDirectory(directory))
        ) {
            summary.skippedUnsafe++;
            return;
        }
        await atomicWrite(target, encoded);
        summary.optimized++;
        if (cached) summary.cached++;
        summary.bytesAfter -= input.length - encoded.length;
        if (cachedFile && !cached) await atomicWrite(cachedFile, encoded);
    };
    await Promise.all(
        Array.from({ length: Math.min(4, filenames.length) }, async () => {
            while (cursor < filenames.length) await optimize(filenames[cursor++]);
        }),
    );
    return summary;
}

if (import.meta.main) {
    void approvedRosterPortraitFilenames().then(async (filenames) => {
        const summary = await optimizePortraitBuildCopies(BUILD_IMAGES, process.env.HOC_IMAGES_LOC, filenames);
        if (summary.skippedReason) console.warn(`Portrait build-copy encoding skipped: ${summary.skippedReason}`);
        else console.log("Portrait build-copy encoding:", summary);
    });
}
