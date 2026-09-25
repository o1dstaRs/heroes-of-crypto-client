import { TexturePool } from "pixi.js";

interface IPooledTexture {
    destroy(destroySource?: boolean): void;
}

/**
 * Destroy the render targets Pixi's process-wide TexturePool holds idle, keeping its size buckets.
 *
 * TexturePool.clear() empties the pool by replacing its bucket map, and a texture still checked out — every
 * live Text's canvas texture, a filter target mid-pass — then throws when it is handed back, because
 * returnTexture pushes into a bucket that no longer exists. That is the iPhone "this._texturePool[n].push"
 * crash: a rotation crossed a pool-size boundary, resize cleared the pool, and the next text change blew up.
 * Only the idle arrays are emptied here, so a returned texture lands in its (empty) bucket as usual.
 */
export const releaseIdlePooledTextures = (): void => {
    const buckets = (TexturePool as unknown as { _texturePool?: Record<string, IPooledTexture[] | undefined> })
        ._texturePool;
    if (!buckets) {
        return;
    }
    for (const textures of Object.values(buckets)) {
        if (!textures) {
            continue;
        }
        for (const texture of textures) {
            texture.destroy(true);
        }
        textures.length = 0;
    }
};
