import { TexturePool, type Texture } from "pixi.js";

/** Release unused GPU targets without invalidating textures still borrowed by canvas text. */
export function releaseIdlePixiTextures(): void {
    // Pixi 8.20 clear() deletes the buckets, but returnTexture() expects an existing bucket.
    // Text keeps pooled textures across frames, so clearing during resize crashes its next update.
    // Keep this version-specific access here; empty arrays preserve returnTexture's ownership map.
    const buckets = (TexturePool as unknown as { _texturePool: Record<string, Texture[]> })._texturePool;
    for (const bucket of Object.values(buckets)) {
        let texture: Texture | undefined;
        while ((texture = bucket.pop())) texture.destroy(true);
    }
}
