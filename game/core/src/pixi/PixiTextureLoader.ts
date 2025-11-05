// game/core/src/pixi/PixiTextureLoader.ts
import { Texture } from "pixi.js";
import { images } from "../generated/image_imports";

export interface PixiTextureInfo {
    width: number;
    height: number;
    texture: Texture;
}

/**
 * Load images using plain <img>, then build Pixi textures via Texture.from(img).
 * - No star import
 * - No Assets
 * - No BaseTexture
 * - No Texture.fromURL
 */
export class PixiTextureLoader {
    private textures: Record<string, PixiTextureInfo> = {};

    public async loadTextures(): Promise<Record<string, PixiTextureInfo>> {
        await Promise.all(
            Object.entries(images).map(async ([key, url]) => {
                const img = await loadImage(url);
                const texture = Texture.from(img); // works across Pixi versions
                this.textures[key] = {
                    width: img.width,
                    height: img.height,
                    texture,
                };
            }),
        );
        return this.textures;
    }

    public getTexture(key: string): Texture | undefined {
        return this.textures[key]?.texture;
    }

    public getTextureInfo(key: string): PixiTextureInfo | undefined {
        return this.textures[key];
    }

    public getAllTextures(): Record<string, Texture> {
        const out: Record<string, Texture> = {};
        for (const [k, info] of Object.entries(this.textures)) out[k] = info.texture;
        return out;
    }
}

/** Promise-based <img> loader with CORS-friendly defaults. */
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Helpful if your assets are served from CDN/other origins
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = src;
    });
}

// Optional functional loader (same behavior as the class above)
export async function loadPixiTextures(): Promise<Record<string, PixiTextureInfo>> {
    const textures: Record<string, PixiTextureInfo> = {};
    await Promise.all(
        Object.entries(images).map(async ([key, url]) => {
            const img = await loadImage(url);
            const texture = Texture.from(img);
            textures[key] = { width: img.width, height: img.height, texture };
        }),
    );
    return textures;
}

export type PromiseType<T> = T extends Promise<infer TR> ? TR : unknown;
export type PreloadedPixiTextures = PromiseType<ReturnType<typeof loadPixiTextures>>;
