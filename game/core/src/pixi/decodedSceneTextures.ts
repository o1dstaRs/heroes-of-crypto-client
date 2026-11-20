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
    /** Decode and halve in one step off the main thread; a rejection falls back to decode + resize. */
    decodeHalved?(blob: Blob, options: ImageBitmapOptions): Promise<ImageBitmap>;
    supported(): boolean;
    fallback(url: string, asset: ResolvedAsset, loader: Loader): Promise<Texture>;
}

type HalvingResponse = { id: number; bitmap: ImageBitmap } | { id: number; error: string };
interface HalvingWorkerClient {
    halve(blob: Blob, options: ImageBitmapOptions): Promise<ImageBitmap>;
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
        halve: (blob, options) =>
            new Promise<ImageBitmap>((resolve, reject) => {
                const id = nextId++;
                pending.set(id, { resolve, reject });
                worker.postMessage({ id, blob, options });
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
    resize: (bitmap, width, height) =>
        createImageBitmap(bitmap, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" }),
    decodeHalved: (blob, options) => {
        const worker = getHalvingWorker();
        return worker ? worker.halve(blob, options) : Promise.reject(new Error("No atlas halving worker"));
    },
    supported: () => typeof createImageBitmap === "function",
    fallback: (url, asset, loader) => loadTextures.load!<Texture>(url, asset, loader),
};

const assetPath = (url: string): string => new URL(url, "https://scene.invalid").pathname;

/** Decode before publishing to Pixi's cache, so the first draw does not synchronously decode a WebP. */
export function createDecodedSceneTextureParser(
    urls: readonly string[],
    platform: DecodePlatform = browserPlatform,
    /** Selected atlases are uploaded at half size; their slicing measures the decoded width. */
    halve: (url: string) => boolean = () => false,
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
                bitmap = await previous
                    .then(async () => {
                        if (halve(url) && platform.decodeHalved) {
                            try {
                                return await platform.decodeHalved(blob, decodeOptions);
                            } catch {
                                // Worker unavailable or failed: resample on this thread below.
                            }
                        }
                        const decoded = await platform.decode(blob, decodeOptions);
                        if (!halve(url) || !platform.resize || decoded.width < 2 || decoded.height < 2) return decoded;
                        // Resize inside the serial decode slot so only one full-size copy is ever alive. A failed
                        // resample keeps the full-size pixels; slicing measures the width either way.
                        let halved: ImageBitmap;
                        try {
                            halved = await platform.resize(
                                decoded,
                                Math.round(decoded.width / 2),
                                Math.round(decoded.height / 2),
                            );
                        } catch {
                            return decoded;
                        }
                        decoded.close();
                        return halved;
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
