import { RendererType, type Renderer, type Texture, type TextureSource } from "pixi.js";

type PrewarmRenderer = Pick<Renderer, "texture"> & Partial<Pick<Renderer, "type">>;
type PrepareBitmap = (image: HTMLImageElement, source: TextureSource, signal: AbortSignal) => Promise<ImageBitmap>;

const prepareBitmap: PrepareBitmap = async (image, source, signal) => {
    // Loading an ImageBitmap from an <img> still decodes synchronously in Chrome. Reuse the cached
    // compressed response instead, so createImageBitmap can decode the Blob off the visible frame.
    const response = await fetch(image.currentSrc || image.src, { cache: "force-cache", signal });
    if (!response.ok) throw new Error(`Atlas preparation failed: ${response.status}`);
    const blob = await response.blob();
    if (signal.aborted) throw new Error("Atlas preparation cancelled");
    return createImageBitmap(blob, {
        premultiplyAlpha: source.alphaMode === "premultiply-alpha-on-upload" ? "premultiply" : "none",
    });
};

interface PendingAtlas {
    source: TextureSource;
    image: HTMLImageElement;
    settled: boolean;
    bitmap?: ImageBitmap;
    cancel: () => void;
}

/** One temporary bitmap per scene, consumed only by the existing guarded prewarm step. */
export class AtlasTexturePrewarmer {
    private pending?: PendingAtlas;
    private destroyed = false;
    public constructor(private readonly prepare: PrepareBitmap = prepareBitmap) {}
    public prewarm(renderer: PrewarmRenderer | undefined, frame: Texture): boolean {
        if (!renderer || this.destroyed) return false;
        // The temporary resource is consumed synchronously by WebGL. Keep WebGPU's existing
        // external-image copy/lifetime path, which has different resource and alpha handling.
        if (renderer.type === RendererType.WEBGPU) return prewarmAtlasTexture(renderer, frame);
        if (this.pending && this.pending.source !== frame.source) {
            // Finish or cancel the previous decode before starting another, even if turn priority changes.
            if (!this.pending.settled) {
                this.pending.cancel();
                return false;
            }
            this.clearPending();
        }
        if (!this.pending) {
            const image = frame.source.resource;
            if (
                typeof HTMLImageElement === "undefined" ||
                !(image instanceof HTMLImageElement) ||
                typeof createImageBitmap !== "function" ||
                !(image.currentSrc || image.src)
            ) {
                return prewarmAtlasTexture(renderer, frame);
            }
            const controller = new AbortController();
            const pending: PendingAtlas = {
                source: frame.source,
                image,
                settled: false,
                cancel: () => {
                    controller.abort();
                    pending.bitmap?.close();
                    pending.bitmap = undefined;
                },
            };
            this.pending = pending;
            pending.source.once("destroy", pending.cancel);
            void Promise.resolve()
                .then(() => this.prepare(image, pending.source, controller.signal))
                .then(
                    (bitmap) => {
                        if (
                            controller.signal.aborted ||
                            pending.source.destroyed ||
                            bitmap.width !== (image.naturalWidth || image.width) ||
                            bitmap.height !== (image.naturalHeight || image.height)
                        )
                            bitmap.close();
                        else pending.bitmap = bitmap;
                    },
                    () => undefined, // Optional preparation always falls back to the original image upload.
                )
                .finally(() => {
                    pending.settled = true;
                });
            return false;
        }
        const pending = this.pending;
        if (!pending.settled) return false;
        const source = frame.source;
        const original = source.resource;
        try {
            if (pending.bitmap && original === pending.image && !source.destroyed) {
                source.resource = pending.bitmap;
            }
            return prewarmAtlasTexture(renderer, frame);
        } finally {
            // Keep the original image for GPU eviction/context-loss recovery, without retaining decoded
            // pixels for every unused action sheet. The upload has already consumed the temporary bitmap.
            if (!source.destroyed && source.resource === pending.bitmap) source.resource = original;
            this.clearPending();
        }
    }
    public destroy(): void {
        this.destroyed = true;
        this.clearPending();
    }
    public cancel(): void {
        this.pending?.cancel();
        // An already-started bitmap decode cannot be aborted. Keep its slot until it settles so the
        // next candidate cannot overlap it; its completion closes the cancelled bitmap immediately.
        if (this.pending?.settled) this.clearPending();
    }
    private clearPending(): void {
        if (!this.pending) return;
        this.pending.source.off("destroy", this.pending.cancel);
        this.pending.cancel();
        this.pending = undefined;
    }
}

/** Upload the shared atlas source without allocating a render target or drawing a throwaway sprite. */
export function prewarmAtlasTexture(renderer: PrewarmRenderer | undefined, frame: Texture): boolean {
    if (!renderer) return false;
    try {
        // Both Pixi renderers expose this path, including their source lifetime and context-loss handling.
        // Upload the source, not a particular cel: every frame of the sheet then uses the same GPU texture.
        renderer.texture.initSource(frame.source);
    } catch {
        // Preserve the best-effort policy: a broken source counts as attempted so it cannot hitch every step.
    }
    return true;
}
