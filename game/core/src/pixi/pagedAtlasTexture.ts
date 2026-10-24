import { Assets, ImageSource, Texture } from "pixi.js";

export interface PagedAtlasTexture {
    texture: Texture;
    unload(): Promise<void>;
}

interface PagePlatform {
    fetchBlob(url: string): Promise<Blob>;
    decode?: (blob: Blob) => Promise<ImageBitmap>;
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
    private decode(blob: Blob): Promise<ImageBitmap> {
        const previous = this.decodeTail;
        let release!: () => void;
        this.decodeTail = new Promise<void>((resolve) => {
            release = resolve;
        });
        return previous.then(() => this.platform.decode!(blob)).finally(release);
    }
}

export const pagedAtlasTextureLoader = new PagedAtlasTextureLoader();
