import { Texture, TexturePool, type BindGroup, type TextureSource } from "pixi.js";

interface IPooledTexture {
    readonly uid: number;
    readonly source?: TextureSource | null;
    destroy(destroySource?: boolean): void;
}

interface ITexturePool {
    // Pixi 8.20 stores object buckets; 8.21+ separates format/scale-mode buckets in a Map.
    _texturePool?: Record<string, IPooledTexture[] | undefined>;
    _poolKeyHash?: Record<number, number>;
    _buckets?: Map<number, IPooledTexture[]>;
    _poolKey?: Record<number, number>;
    _poolStyle?: Record<number, unknown>;
}

interface IFilterStackSlot {
    inputTexture: unknown;
    backTexture: unknown;
}

interface IFilterStackOwner {
    filter?: {
        _filterStack?: IFilterStackSlot[];
        _filterStackIndex?: number;
        _globalFilterBindGroup?: BindGroup;
    };
}

/**
 * Destroy the render targets Pixi's process-wide TexturePool holds idle, keeping its size buckets.
 *
 * TexturePool.clear() deletes the size buckets. Pixi 8.20 then throws when a borrowed Text/filter texture
 * returns; 8.21+ destroys it if its bucket is still missing. Keep the buckets and borrowed ownership records
 * so live users can still return and reuse their targets. Remove ownership records only for idle targets
 * being destroyed, following 8.21's own _dropTextures, so repeated resizes do not retain their metadata.
 *
 * Pass the renderer to also drop what its FilterSystem slots still point at from earlier frames. A pop hands
 * a slot's textures back to the pool but leaves them on the slot, and the next nested push reads its
 * resolution off that leftover before replacing it in 8.20 — once destroyed here its source is null, that
 * read threw on every frame, and the board stayed blank. Active slots stay untouched. Call between frames
 * only; the optional pool also permits cleaning a separately owned Pixi texture pool.
 */
export const releaseIdlePooledTextures = (renderer?: unknown, texturePool: unknown = TexturePool): void => {
    const pool = texturePool as ITexturePool;
    const filterSystem = (renderer as IFilterStackOwner | undefined)?.filter;
    const bindings = filterSystem?._globalFilterBindGroup;
    const buckets = pool._buckets?.values() ?? Object.values(pool._texturePool ?? {});
    for (const textures of buckets) {
        if (!textures) continue;
        let texture: IPooledTexture | undefined;
        while ((texture = textures.pop())) {
            // A completed filter pass retains its last input/backdrop bindings after returning the target.
            // Detach only this idle target; another renderer or active pass may still own other resources.
            if (bindings && texture.source) {
                for (const binding of [1, 3]) {
                    if (bindings.getResource(binding) === texture.source) {
                        bindings.setResource(Texture.EMPTY.source, binding);
                    }
                }
                if (bindings.getResource(2) === texture.source.style) {
                    bindings.setResource(Texture.EMPTY.source.style, 2);
                }
            }
            // Remove from the idle bucket before destruction callbacks can request another target.
            if (pool._poolKeyHash) delete pool._poolKeyHash[texture.uid];
            if (pool._poolKey) delete pool._poolKey[texture.uid];
            if (pool._poolStyle) delete pool._poolStyle[texture.uid];
            texture.destroy(true);
        }
    }

    const slots = filterSystem?._filterStack;
    if (!slots) {
        return;
    }
    for (let index = filterSystem._filterStackIndex ?? 0; index < slots.length; index++) {
        slots[index].inputTexture = null;
        slots[index].backTexture = null;
    }
};
