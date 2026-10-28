import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import release from "../animation-release.json";
import {
    applySidebarPortraitRepair,
    decodeSidebarPortraitRepair,
    type SidebarPortraitRepair,
} from "../src/build/sidebarPortraitRepair";

import pageCatalog from "../src/ui/sidebarPortraitPages.json";

import {
    SIDEBAR_PAGE_RECIPE,
    sidebarPageLayout,
    sidebarPageQuality,
    type SidebarPageDescriptor,
} from "../src/build/sidebarPortraitPages";

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const writeNew = async (filename: string, bytes: Buffer | string) => {
    try {
        const existing = await readFile(filename);
        if (!existing.equals(Buffer.from(bytes)))
            throw new Error(`Refusing to overwrite different output: ${filename}`);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await mkdir(path.dirname(filename), { recursive: true });
        await writeFile(filename, bytes, { flag: "wx" });
    }
};

async function buildPages(sourceDirectory: string, outputDirectory: string, catalogFile: string, assetsRoot?: string) {
    // This can be a local mirror, but every source must match the approved master, never a build encoding.
    const [{ UNIT_ID_TO_NAME }, { resolveLeftSidebarPortraitAnimation }, { resolveIntegratedArbalesterPortrait }] =
        await Promise.all([
            import("../src/ui/unit_ui_constants"),
            import("../src/ui/leftSidebarPortraitAnimation"),
            import("../src/ui/integratedArbalesterPortrait"),
        ]);
    const sources = new Map<string, NonNullable<ReturnType<typeof resolveLeftSidebarPortraitAnimation>>>();
    for (const id of Object.keys(UNIT_ID_TO_NAME).map(Number)) {
        const animation = resolveIntegratedArbalesterPortrait(id, resolveLeftSidebarPortraitAnimation(id));
        if (animation) sources.set(path.basename(new URL(animation.src).pathname), animation);
    }
    const animations: Record<string, unknown> = {};
    const results: Record<string, unknown>[] = [];
    sharp.concurrency(1);
    const sortedSources = [...sources].sort(([a], [b]) => a.localeCompare(b));
    const processSource = async ([sourceFile, animation]: (typeof sortedSources)[number]) => {
        const entry = Object.entries(release.files).find(([filename]) => path.basename(filename) === sourceFile);
        if (!entry) throw new Error(`Unpinned source: ${sourceFile}`);
        const source = await readFile(path.join(sourceDirectory, sourceFile));
        if (source.length !== entry[1].bytes || sha256(source) !== entry[1].sha256) {
            throw new Error(`Source is not the approved master: ${sourceFile}`);
        }
        const { frameWidth, frameHeight, frameCount, layout } = animation.meta;
        const repair = (pageCatalog.animations as Record<string, { repair?: SidebarPortraitRepair }>)[sourceFile]
            ?.repair;
        if (repair && !assetsRoot) throw new Error("Repaired portraits require --assets-root=DIR");
        const repairPath = repair && assetsRoot ? path.resolve(assetsRoot, repair.path) : undefined;
        if (repairPath && !repairPath.startsWith(path.resolve(assetsRoot!) + path.sep))
            throw new Error("Unsafe portrait repair path");
        const repairPixels =
            repair && repairPath
                ? decodeSidebarPortraitRepair(await readFile(repairPath), repair, frameWidth, frameHeight)
                : undefined;
        const stem = sourceFile.replace(/_atlas\.webp$/, "");
        const relativeFolder = `sidebar_portraits_paged_v1/${stem}/atlas`;
        const metadataFile = path.join(outputDirectory, relativeFolder, `${stem}_paged_v1_meta.json`);
        const previousText = await readFile(metadataFile, "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
            return undefined;
        });
        const previous = previousText ? JSON.parse(previousText) : undefined;
        if (
            previous &&
            (previous.sourceSha256 !== entry[1].sha256 ||
                JSON.stringify(previous.recipe) !== JSON.stringify(SIDEBAR_PAGE_RECIPE) ||
                JSON.stringify(previous.repair ?? null) !== JSON.stringify(repair ?? null))
        ) {
            throw new Error(`Cached export has a different source or recipe: ${sourceFile}`);
        }
        const decoded = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        if (decoded.info.width !== frameWidth * layout.cols || decoded.info.height !== frameHeight * layout.rows) {
            throw new Error(`Stale portrait geometry: ${sourceFile}`);
        }
        const pages: SidebarPageDescriptor[] = [];
        let lowestPsnr = Infinity;
        for (const [index, page] of sidebarPageLayout(frameCount, layout.cols).entries()) {
            const crop = {
                left: page.sourceCol * frameWidth,
                top: page.sourceRow * frameHeight,
                width: page.frameCount * frameWidth,
                height: frameHeight,
            };
            const pixels = await sharp(decoded.data, { raw: decoded.info }).extract(crop).raw().toBuffer();
            if (repairPixels)
                applySidebarPortraitRepair(
                    pixels,
                    repairPixels,
                    frameWidth,
                    frameHeight,
                    page.firstFrame,
                    page.frameCount,
                );
            const key = `${stem}_page_${String(index).padStart(2, "0")}_atlas`;
            const releasePath = `animations/output/${relativeFolder}/${key}.webp`;
            const pageFile = path.join(outputDirectory, relativeFolder, `${key}.webp`);
            const cached = previous?.pages[index] as SidebarPageDescriptor | undefined;
            let bytes: Buffer;
            if (cached) {
                if (
                    cached.key !== key ||
                    cached.releasePath !== releasePath ||
                    cached.firstFrame !== page.firstFrame ||
                    cached.frameCount !== page.frameCount ||
                    cached.cols !== page.frameCount ||
                    cached.rows !== 1
                ) {
                    throw new Error(`Cached export has a different page layout: ${sourceFile}/${index}`);
                }
                bytes = await readFile(pageFile);
                if (bytes.length !== cached.bytes || sha256(bytes) !== cached.sha256)
                    throw new Error(`Cached page changed: ${key}`);
            } else {
                bytes = await sharp(pixels, { raw: { width: crop.width, height: crop.height, channels: 4 } })
                    .webp(SIDEBAR_PAGE_RECIPE)
                    .toBuffer();
            }
            const actual = await sharp(bytes).ensureAlpha().raw().toBuffer();
            const quality = sidebarPageQuality(pixels, actual);
            if (!quality.alphaExact || quality.psnr < 40)
                throw new Error(`Portrait page quality failed: ${stem}/${index}`);
            lowestPsnr = Math.min(lowestPsnr, quality.psnr);
            await writeNew(pageFile, bytes);
            pages.push({
                key,
                firstFrame: page.firstFrame,
                frameCount: page.frameCount,
                cols: page.frameCount,
                rows: 1,
                bytes: bytes.length,
                sha256: sha256(bytes),
                releasePath,
            });
        }
        const manifest = {
            sourceFile,
            sourcePath: entry[0],
            sourceSha256: entry[1].sha256,
            ...(repair ? { repair } : {}),
            frameWidth,
            frameHeight,
            frameCount,
            pages,
        };
        const metadata = {
            surface: "left-sidebar-paged",
            recipe: SIDEBAR_PAGE_RECIPE,
            ...manifest,
            meta: { ...animation.meta, encoding: "webp-rgba-lossless", pages },
        };
        const metadataText = JSON.stringify(metadata, null, 2) + "\n";
        if (previousText && !previous.surface) {
            const { surface: _surface, ...legacy } = { ...metadata, meta: { ...animation.meta, pages } };
            if (previousText !== JSON.stringify(legacy, null, 2) + "\n")
                throw new Error(`Cached metadata changed: ${sourceFile}`);
            // Upgrade only an identical, fully re-verified export from the initial local recipe.
            await writeFile(metadataFile, metadataText);
        } else {
            await writeNew(metadataFile, metadataText);
        }
        animations[sourceFile] = manifest;
        results.push({
            sourceFile,
            sourceBytes: source.length,
            pageBytes: pages.reduce((sum, page) => sum + page.bytes, 0),
            firstPageBytes: pages[0].bytes,
            decodedPageBytes: pages[0].frameCount * frameWidth * frameHeight * 4,
            minimumVisiblePsnr: lowestPsnr,
        });
        console.log(
            `${sourceFile}: ${pages.length} pages, first ${pages[0].bytes} bytes, min PSNR ${lowestPsnr.toFixed(2)} dB`,
        );
    };
    let nextSource = 0;
    await Promise.all(
        Array.from({ length: 4 }, async () => {
            while (nextSource < sortedSources.length) await processSource(sortedSources[nextSource++]);
        }),
    );
    const sortedAnimations = Object.fromEntries(Object.entries(animations).sort(([a], [b]) => a.localeCompare(b)));
    results.sort((a, b) => String(a.sourceFile).localeCompare(String(b.sourceFile)));
    await writeNew(
        catalogFile,
        JSON.stringify({ version: 1, recipe: SIDEBAR_PAGE_RECIPE, animations: sortedAnimations }, null, 2) + "\n",
    );
    await writeNew(
        path.join(outputDirectory, "encoding-report.json"),
        JSON.stringify({ version: 1, recipe: SIDEBAR_PAGE_RECIPE, results }, null, 2) + "\n",
    );
}

if (import.meta.main) {
    const args = new Map(
        process.argv.slice(2).map((arg) => {
            const at = arg.indexOf("=");
            return [arg.slice(0, at), arg.slice(at + 1)];
        }),
    );
    const source = args.get("--source-images");
    const output = args.get("--output");
    const catalog = args.get("--catalog");
    if (!source || !output || !catalog) throw new Error("Required: --source-images=DIR --output=DIR --catalog=FILE");
    await buildPages(path.resolve(source), path.resolve(output), path.resolve(catalog), args.get("--assets-root"));
}
