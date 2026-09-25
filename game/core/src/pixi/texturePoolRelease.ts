import { TexturePool } from "pixi.js";

interface IPooledTexture {
    destroy(destroySource?: boolean): void;
}

interface IFilterStackSlot {
    inputTexture: unknown;
    backTexture: unknown;
}

interface IFilterStackOwner {
    filter?: { _filterStack?: IFilterStackSlot[]; _filterStackIndex?: number };
}

/**
 * Destroy the render targets Pixi's process-wide TexturePool holds idle, keeping its size buckets.
 *
 * TexturePool.clear() empties the pool by replacing its bucket map, and a texture still checked out — every
 * live Text's canvas texture, a filter target mid-pass — then throws when it is handed back, because
 * returnTexture pushes into a bucket that no longer exists. That is the iPhone "this._texturePool[n].push"
 * crash: a rotation crossed a pool-size boundary, resize cleared the pool, and the next text change blew up.
 * Only the idle arrays are emptied here, so a returned texture lands in its (empty) bucket as usual.
 *
 * Pass the renderer to also drop what its FilterSystem slots still point at from earlier frames. A pop hands
 * a slot's textures back to the pool but leaves them on the slot, and the next nested push reads its
 * resolution off that leftover (`_findFilterResolution`) before replacing it — once destroyed here its source
 * is null, that read threw on every frame, and the board stayed blank. Call between frames only.
 */
export const releaseIdlePooledTextures = (renderer?: unknown): void => {
    const buckets = (TexturePool as unknown as { _texturePool?: Record<string, IPooledTexture[] | undefined> })
        ._texturePool;
    if (buckets) {
        for (const textures of Object.values(buckets)) {
            if (!textures) {
                continue;
            }
            for (const texture of textures) {
                texture.destroy(true);
            }
            textures.length = 0;
        }
    }

    const filterSystem = (renderer as IFilterStackOwner | undefined)?.filter;
    const slots = filterSystem?._filterStack;
    if (!slots) {
        return;
    }
    for (let index = filterSystem._filterStackIndex ?? 0; index < slots.length; index++) {
        slots[index].inputTexture = null;
        slots[index].backTexture = null;
    }
};
