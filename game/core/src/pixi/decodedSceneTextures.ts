import {
    createTexture,
    ExtensionType,
    ImageSource,
    LoaderParserPriority,
    loadTextures,
    type Loader,
    type LoaderParser,
    type ResolvedAsset,
    type Texture,
} from "pixi.js";

interface DecodePlatform {
    fetchBlob(url: string): Promise<Blob>;
    decode(blob: Blob, options: ImageBitmapOptions): Promise<ImageBitmap>;
    /** Resample decoded pixels to a smaller bitmap before they ever reach the GPU. */
    resize?(bitmap: ImageBitmap, width: number, height: number): Promise<ImageBitmap>;
    /** Decode and resample by `factor` off the main thread; a rejection falls back to decode + resize. */
    decodeScaled?(blob: Blob, options: ImageBitmapOptions, factor: number): Promise<ImageBitmap>;
    supported(): boolean;
    fallback(url: string, asset: ResolvedAsset, loader: Loader): Promise<Texture>;
}

type HalvingResponse = { id: number; bitmap: ImageBitmap } | { id: number; error: string };
interface HalvingWorkerClient {
    scale(blob: Blob, options: ImageBitmapOptions, factor: number): Promise<ImageBitmap>;
}

/**
 * One lazily started worker for the half-size atlases (see atlasHalvingWorker.ts for why). If it
 * cannot start or dies, every pending and later request rejects and the parser resamples in place.
 */
let halvingWorker: HalvingWorkerClient | null | undefined;
const getHalvingWorker = (): HalvingWorkerClient | null => {
    if (halvingWorker !== undefined) return halvingWorker;
    if (typeof Worker === "undefined") return (halvingWorker = null);
    let worker: Worker;
    try {
        worker = new Worker(new URL("./atlasHalvingWorker.ts", import.meta.url), { type: "module" });
    } catch {
        return (halvingWorker = null);
    }
    const pending = new Map<number, { resolve: (bitmap: ImageBitmap) => void; reject: (error: Error) => void }>();
    let nextId = 0;
    const failAll = (reason: string): void => {
        halvingWorker = null;
        worker.terminate();
        for (const request of pending.values()) request.reject(new Error(reason));
        pending.clear();
    };
    worker.onmessage = (event: MessageEvent<HalvingResponse>) => {
        const request = pending.get(event.data.id);
        if (!request) {
            if ("bitmap" in event.data) event.data.bitmap.close();
            return;
        }
        pending.delete(event.data.id);
        if ("bitmap" in event.data) request.resolve(event.data.bitmap);
        else request.reject(new Error(event.data.error));
    };
    worker.onerror = () => failAll("Atlas halving worker failed");
    halvingWorker = {
        scale: (blob, options, factor) =>
            new Promise<ImageBitmap>((resolve, reject) => {
                const id = nextId++;
                pending.set(id, { resolve, reject });
                worker.postMessage({ id, blob, options, factor });
            }),
    };
    return halvingWorker;
};

const browserPlatform: DecodePlatform = {
    async fetchBlob(url) {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Scene texture request failed: ${response.status}`);
        return response.blob();
    },
    decode: (blob, options) => createImageBitmap(blob, options),
    resize: async (bitmap, width, height) => {
        try {
            return await createImageBitmap(bitmap, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
        } catch {
            // Engines without ImageBitmap resize options still draw a bitmap onto a canvas at any size.
            const canvas =
                typeof OffscreenCanvas === "function"
                    ? new OffscreenCanvas(width, height)
                    : Object.assign(document.createElement("canvas"), { width, height });
            const context = canvas.getContext("2d") as
                CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
            if (!context) throw new Error("No 2D canvas to resample the atlas");
            context.imageSmoothingQuality = "high";
            context.drawImage(bitmap, 0, 0, width, height);
            return createImageBitmap(canvas);
        }
    },
    decodeScaled: (blob, options, factor) => {
        const worker = getHalvingWorker();
        return worker ? worker.scale(blob, options, factor) : Promise.reject(new Error("No atlas halving worker"));
    },
    supported: () => typeof createImageBitmap === "function",
    fallback: (url, asset, loader) => loadTextures.load!<Texture>(url, asset, loader),
};

const assetPath = (url: string): string => new URL(url, "https://scene.invalid").pathname;

/** Pixel width from a WebP header (lossy, lossless or extended), or undefined for anything else. */
export function webpWidthFromHeader(header: Uint8Array): number | undefined {
    if (header.length < 30) return undefined;
    const tag = (offset: number) => String.fromCharCode(...header.subarray(offset, offset + 4));
    if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return undefined;
    switch (tag(12)) {
        case "VP8X":
            return 1 + (header[24] | (header[25] << 8) | (header[26] << 16));
        case "VP8L":
            return header[20] === 0x2f ? 1 + ((header[21] | (header[22] << 8)) & 0x3fff) : undefined;
        case "VP8 ":
            return header[23] === 0x9d && header[24] === 0x01 && header[25] === 0x2a
                ? (header[26] | (header[27] << 8)) & 0x3fff
                : undefined;
        default:
            return undefined;
    }
}

const webpWidth = async (blob: Blob): Promise<number | undefined> => {
    try {
        return webpWidthFromHeader(new Uint8Array(await blob.slice(0, 30).arrayBuffer()));
    } catch {
        return undefined;
    }
};

/** Decode before publishing to Pixi's cache, so the first draw does not synchronously decode a WebP. */
export function createDecodedSceneTextureParser(
    urls: readonly string[],
    platform: DecodePlatform = browserPlatform,
    /** Selected atlases are uploaded at half size; their slicing measures the decoded width. */
    halve: (url: string) => boolean = () => false,
    /**
     * Atlases the release ships halved although their code slices fixed full-size pixels: restore the
     * authored size before upload, so only the download shrinks. Asked with the downloaded file's width
     * (from its WebP header, when readable) so an authored full-size file is never doubled.
     */
    restoreFullSize: (url: string, shippedWidth?: number) => boolean = () => false,
): LoaderParser<Texture> {
    const paths = new Set(urls.map(assetPath));
    let decodeTail = Promise.resolve();
    return {
        id: "decoded-scene-texture",
        extension: { type: ExtensionType.LoadParser, priority: LoaderParserPriority.High + 1 },
        test: (url) => platform.supported() && paths.has(assetPath(url)),
        async load(url, asset, loader) {
            if (!asset || !loader) throw new Error("Scene texture loader requires asset metadata");
            let bitmap: ImageBitmap | undefined;
            try {
                const blob = await platform.fetchBlob(url);
                const previous = decodeTail;
                let release!: () => void;
                decodeTail = new Promise<void>((resolve) => {
                    release = resolve;
                });
                const decodeOptions: ImageBitmapOptions = {
                    premultiplyAlpha: asset.data?.alphaMode === "premultiplied-alpha" ? "none" : "premultiply",
                };
                const restore = !halve(url) && restoreFullSize(url) && restoreFullSize(url, await webpWidth(blob));
                bitmap = await previous
                    .then(async () => {
                        const factor = halve(url) ? 0.5 : restore ? 2 : 1;
                        if (factor !== 1 && platform.decodeScaled) {
                            try {
                                return await platform.decodeScaled(blob, decodeOptions, factor);
                            } catch {
                                // Worker unavailable or failed: resample on this thread below.
                            }
                        }
                        const decoded = await platform.decode(blob, decodeOptions);
                        if (factor === 1 || !platform.resize || decoded.width < 2 || decoded.height < 2) return decoded;
                        // Resize inside the serial decode slot so only one large copy is ever alive. A failed
                        // halving keeps the full-size pixels, which slicing measures; a failed restore keeps
                        // the half-size pixels, which only a size-measuring slicer could use, so fall back.
                        let scaled: ImageBitmap;
                        try {
                            scaled = await platform.resize(
                                decoded,
                                Math.round(decoded.width * factor),
                                Math.round(decoded.height * factor),
                            );
                        } catch (error) {
                            if (factor > 1) {
                                decoded.close();
                                throw error;
                            }
                            return decoded;
                        }
                        decoded.close();
                        return scaled;
                    })
                    .finally(release);
                const source = new ImageSource({
                    resource: bitmap,
                    alphaMode: "premultiply-alpha-on-upload",
                    ...asset.data,
                });
                const pixels = bitmap;
                source.once("destroy", () => pixels.close());
                return createTexture(source, loader, url);
            } catch {
                bitmap?.close();
                return platform.fallback(url, asset, loader);
            }
        },
        unload: (texture) => texture.destroy(true),
    };
}
