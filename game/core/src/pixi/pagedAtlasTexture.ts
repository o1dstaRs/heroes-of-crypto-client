import { Assets, ImageSource, Rectangle, Texture } from "pixi.js";

export interface PagedAtlasTexture {
    texture: Texture;
    unload(): Promise<void>;
}

/**
 * A page split into full-width horizontal strips. Each strip reaches the GPU on its own first draw, so a
 * 3072x3072 page costs eight 4.7 MB uploads spread across its playback instead of one 36 MB upload at the
 * page change (which measured 16-79 ms on an M4 Max, 2026-11-26). `strips[i].frame.y` is where strip i
 * starts inside its source: 0 for a strip with its own pixels, i * stripHeight for the whole-page fallback.
 */
export interface PagedAtlasStrips {
    strips: readonly Texture[];
    unload(): Promise<void>;
}

interface PagePlatform {
    fetchBlob(url: string): Promise<Blob>;
    decode?: (blob: Blob) => Promise<ImageBitmap>;
    /** Copy a region of an already decoded, premultiplied bitmap. */
    crop?: (bitmap: ImageBitmap, x: number, y: number, width: number, height: number) => Promise<ImageBitmap>;
    loadFallback(url: string): Promise<Texture>;
    unloadFallback(url: string): Promise<void>;
}

const browserPlatform = (): PagePlatform => ({
    async fetchBlob(url) {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Animation page request failed: ${response.status}`);
        return response.blob();
    },
    decode:
        typeof createImageBitmap === "function"
            ? (blob) => createImageBitmap(blob, { premultiplyAlpha: "premultiply" })
            : undefined,
    crop:
        typeof createImageBitmap === "function"
            ? (bitmap, x, y, width, height) =>
                  createImageBitmap(bitmap, x, y, width, height, { premultiplyAlpha: "premultiply" })
            : undefined,
    loadFallback: (url) => Assets.load<Texture>(url),
    unloadFallback: (url) => Assets.unload(url),
});

/** Decode Blob pixels before display; an HTML image otherwise stalls Chrome's first texture upload. */
export class PagedAtlasTextureLoader {
    private decodeTail: Promise<void> = Promise.resolve();
    public constructor(private readonly platform: PagePlatform = browserPlatform()) {}
    public async load(url: string, width: number, height: number): Promise<PagedAtlasTexture> {
        if (this.platform.decode) {
            try {
                // Fetch compressed pages concurrently, but keep only one pixel decode in flight.
                const blob = await this.platform.fetchBlob(url);
                const bitmap = await this.decode(blob);
                if (bitmap.width !== width || bitmap.height !== height) {
                    bitmap.close();
                    throw new Error("Animation page bitmap dimensions differ");
                }
                let texture: Texture;
                try {
                    texture = new Texture({
                        source: new ImageSource({
                            resource: bitmap,
                            alphaMode: "premultiply-alpha-on-upload",
                            label: url,
                        }),
                    });
                } catch (error) {
                    bitmap.close();
                    throw error;
                }
                let unloaded = false;
                return {
                    texture,
                    async unload() {
                        if (unloaded) return;
                        unloaded = true;
                        try {
                            texture.destroy(true);
                        } finally {
                            bitmap.close();
                        }
                    },
                };
            } catch {
                // Unsupported/flaky bitmap decoders retain the existing image-loading path.
            }
        }
        const texture = await this.platform.loadFallback(url);
        if (texture.width !== width || texture.height !== height) {
            await this.platform.unloadFallback(url);
            throw new Error(`Animation page dimensions differ: ${url}`);
        }
        let unloaded = false;
        return {
            texture,
            unload: async () => {
                if (unloaded) return;
                unloaded = true;
                await this.platform.unloadFallback(url);
            },
        };
    }
    /**
     * Load a page as `height / stripHeight` full-width strips. The strips are cut inside the same decode slot,
     * so only one page's pixels are ever held twice; each strip keeps its own bitmap for context recovery and
     * the whole-page bitmap is closed. Without a decoder or cropper, or if cutting fails, the strips are
     * regions of the single page texture: identical frames, one upload, as before.
     */
    public async loadStrips(
        url: string,
        width: number,
        height: number,
        stripHeight: number,
    ): Promise<PagedAtlasStrips> {
        const rows = height / stripHeight;
        const crop = this.platform.crop;
        if (this.platform.decode && crop && Number.isInteger(rows) && rows > 1) {
            try {
                const blob = await this.platform.fetchBlob(url);
                const bitmaps = await this.decode(blob, async (bitmap) => {
                    if (bitmap.width !== width || bitmap.height !== height) {
                        throw new Error("Animation page bitmap dimensions differ");
                    }
                    const settled = await Promise.allSettled(
                        Array.from({ length: rows }, (_, row) =>
                            crop(bitmap, 0, row * stripHeight, width, stripHeight),
                        ),
                    );
                    const cut = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
                    if (cut.length !== rows) {
                        for (const strip of cut) strip.close();
                        throw new Error("Animation page strips could not be cut");
                    }
                    return cut;
                });
                const strips: Texture[] = [];
                try {
                    bitmaps.forEach((resource, row) => {
                        strips.push(
                            new Texture({
                                source: new ImageSource({
                                    resource,
                                    alphaMode: "premultiply-alpha-on-upload",
                                    label: `${url}#strip${row}`,
                                }),
                            }),
                        );
                    });
                } catch (error) {
                    for (const strip of strips) strip.destroy(true);
                    for (const bitmap of bitmaps) bitmap.close();
                    throw error;
                }
                let unloaded = false;
                return {
                    strips,
                    async unload() {
                        if (unloaded) return;
                        unloaded = true;
                        try {
                            for (const strip of strips) strip.destroy(true);
                        } finally {
                            for (const bitmap of bitmaps) bitmap.close();
                        }
                    },
                };
            } catch {
                // Fall through to whole-page loading, which keeps its own decode and image fallbacks.
            }
        }
        const page = await this.load(url, width, height);
        const strips = Array.from(
            { length: Math.max(1, Math.floor(height / stripHeight)) },
            (_, row) =>
                new Texture({
                    source: page.texture.source,
                    frame: new Rectangle(0, row * stripHeight, width, Math.min(stripHeight, height)),
                }),
        );
        let unloaded = false;
        return {
            strips,
            async unload() {
                if (unloaded) return;
                unloaded = true;
                for (const strip of strips) strip.destroy(false);
                await page.unload();
            },
        };
    }
    private decode(blob: Blob): Promise<ImageBitmap>;
    private decode<T>(blob: Blob, then: (bitmap: ImageBitmap) => Promise<T>): Promise<T>;
    private decode<T>(blob: Blob, then?: (bitmap: ImageBitmap) => Promise<T>): Promise<ImageBitmap | T> {
        const previous = this.decodeTail;
        let release!: () => void;
        this.decodeTail = new Promise<void>((resolve) => {
            release = resolve;
        });
        return previous
            .then(async () => {
                const bitmap = await this.platform.decode!(blob);
                if (!then) return bitmap;
                // The page's pixels are released as soon as its strips exist (or the cut fails).
                try {
                    return await then(bitmap);
                } finally {
                    bitmap.close();
                }
            })
            .finally(release);
    }
}

export const pagedAtlasTextureLoader = new PagedAtlasTextureLoader();
