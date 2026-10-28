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
    supported(): boolean;
    fallback(url: string, asset: ResolvedAsset, loader: Loader): Promise<Texture>;
}

const browserPlatform: DecodePlatform = {
    async fetchBlob(url) {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Scene texture request failed: ${response.status}`);
        return response.blob();
    },
    decode: (blob, options) => createImageBitmap(blob, options),
    supported: () => typeof createImageBitmap === "function",
    fallback: (url, asset, loader) => loadTextures.load!<Texture>(url, asset, loader),
};

const assetPath = (url: string): string => new URL(url, "https://scene.invalid").pathname;

/** Decode before publishing to Pixi's cache, so the first draw does not synchronously decode a WebP. */
export function createDecodedSceneTextureParser(
    urls: readonly string[],
    platform: DecodePlatform = browserPlatform,
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
                bitmap = await previous
                    .then(() =>
                        platform.decode(blob, {
                            premultiplyAlpha: asset.data?.alphaMode === "premultiplied-alpha" ? "none" : "premultiply",
                        }),
                    )
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
