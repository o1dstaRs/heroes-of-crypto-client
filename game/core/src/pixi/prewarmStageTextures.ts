import type { Container, TextureSource } from "pixi.js";

/** The texture surface a display object draws from, if it draws one (Sprite, TilingSprite, Mesh...). */
interface ITexturedNode {
    texture?: { source?: TextureSource | null } | null;
}

/**
 * Every texture source the next frame will draw from `root`, skipping `skip` (the loading screen) and
 * anything not visible or renderable, which the renderer would not draw either.
 */
export function collectStageTextureSources(root: Container, skip?: Container): TextureSource[] {
    const seen = new Set<TextureSource>();
    const visit = (node: Container): void => {
        if (node === skip || node.destroyed || !node.visible || !node.renderable) return;
        const source = (node as unknown as ITexturedNode).texture?.source;
        if (source && !source.destroyed) seen.add(source);
        for (const child of node.children) visit(child);
    };
    visit(root);
    return [...seen];
}

export interface IPrewarmOptions {
    sources: readonly TextureSource[];
    /** Hands one source to the GPU (renderer.texture.initSource); a source already resident costs nothing. */
    upload: (source: TextureSource) => void;
    /** Fraction of sources handed over, 0..1. */
    onProgress?: (fraction: number) => void;
    /** Resolves on the next animation frame, so the loading screen keeps animating between batches. */
    nextFrame: () => Promise<void>;
    now?: () => number;
    /** Upload time spent per frame before yielding; one source always goes, however large. */
    frameBudgetMs?: number;
    isCancelled?: () => boolean;
}

/**
 * Upload the board's textures behind the loading screen, a few per frame. Left to the first board frame,
 * every texture went to the GPU in that single frame: the page froze for a moment right after the
 * loading bar disappeared and the board then popped in all at once.
 */
export async function prewarmTextureSources({
    sources,
    upload,
    onProgress,
    nextFrame,
    now = () => performance.now(),
    frameBudgetMs = 8,
    isCancelled = () => false,
}: IPrewarmOptions): Promise<void> {
    let index = 0;
    while (index < sources.length) {
        if (isCancelled()) return;
        const frameStart = now();
        do {
            const source = sources[index++];
            if (!source.destroyed) upload(source);
        } while (index < sources.length && now() - frameStart < frameBudgetMs);
        onProgress?.(index / sources.length);
        if (index < sources.length) await nextFrame();
    }
    onProgress?.(1);
}
