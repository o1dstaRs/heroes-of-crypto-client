import type { Renderer, Texture } from "pixi.js";

/** Upload the shared atlas source without allocating a render target or drawing a throwaway sprite. */
export function prewarmAtlasTexture(renderer: Pick<Renderer, "texture"> | undefined, frame: Texture): boolean {
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
