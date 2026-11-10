import { Texture } from "pixi.js";
import { PORTRAIT_CARD_STYLE } from "../ui/portraitCardStyle";

/** Three separable box passes approximate the SVG Gaussian, without per-frame GPU filters. */
export function portraitContourPixels(rgba: Uint8ClampedArray, size: number, inverse: boolean): Uint8ClampedArray {
    const silhouette = new Float32Array(size * size);
    for (let i = 0; i < silhouette.length; i++) {
        const alpha = rgba[i * 4 + 3] / 255;
        silhouette[i] = inverse ? 1 - alpha : alpha;
    }
    let blurred = silhouette.slice();
    const sigma = PORTRAIT_CARD_STYLE.blur * size;
    const ideal = Math.sqrt(4 * sigma * sigma + 1);
    const lower = Math.floor(ideal) % 2 === 0 ? Math.floor(ideal) - 1 : Math.floor(ideal);
    const upper = lower + 2;
    const lowerPasses = Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4));
    for (let pass = 0; pass < 3; pass++) {
        const radius = ((pass < lowerPasses ? lower : upper) - 1) / 2;
        for (const vertical of [false, true]) {
            const output = new Float32Array(size * size);
            const step = vertical ? size : 1;
            for (let line = 0; line < size; line++) {
                const start = vertical ? line : line * size;
                let sum = 0;
                for (let x = 0; x <= radius; x++) sum += blurred[start + x * step] ?? 0;
                for (let x = 0; x < size; x++) {
                    output[start + x * step] = sum / (2 * radius + 1);
                    if (x - radius >= 0) sum -= blurred[start + (x - radius) * step];
                    if (x + radius + 1 < size) sum += blurred[start + (x + radius + 1) * step];
                }
            }
            blurred = output;
        }
    }
    const output = new Uint8ClampedArray(rgba.length);
    for (let i = 0; i < silhouette.length; i++) {
        output[i * 4] = 5;
        output[i * 4 + 1] = 5;
        output[i * 4 + 2] = 8;
        // Paint only the background, leaving the creature's face and armour untouched.
        output[i * 4 + 3] = 255 * blurred[i] * (1 - silhouette[i]) * PORTRAIT_CARD_STYLE.opacity;
    }
    return output;
}

interface ContourEntry {
    texture: Texture;
    refs: number;
}
export interface PortraitContourLease {
    texture: Texture;
    release(): void;
}
const cache = new WeakMap<Texture, Map<boolean, ContourEntry>>();

/** One small, mipmapped overlay per decoded silhouette; the last consumer releases its GPU allocation. */
export function acquirePortraitContour(source: Texture, inverse: boolean): PortraitContourLease | undefined {
    if (source === Texture.EMPTY || source === Texture.WHITE || source.destroyed || source.source.destroyed) return;
    const resource = source.source.resource;
    if (!resource || typeof document === "undefined") return;
    let entries = cache.get(source);
    let entry = entries?.get(inverse);
    if (!entry) {
        const canvas = document.createElement("canvas");
        const size = 256;
        canvas.width = canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        const frame = source.frame;
        const resolution = source.source.resolution;
        context.drawImage(
            resource as CanvasImageSource,
            frame.x * resolution,
            frame.y * resolution,
            frame.width * resolution,
            frame.height * resolution,
            0,
            0,
            size,
            size,
        );
        const pixels = context.getImageData(0, 0, size, size);
        pixels.data.set(portraitContourPixels(pixels.data, size, inverse));
        context.putImageData(pixels, 0, 0);
        const texture = Texture.from(canvas);
        texture.source.autoGenerateMipmaps = true;
        texture.source.scaleMode = "linear";
        entry = { texture, refs: 0 };
        if (!entries) {
            entries = new Map();
            cache.set(source, entries);
        }
        entries.set(inverse, entry);
    }
    entry.refs++;
    const acquired = entry;
    let released = false;
    return {
        texture: entry.texture,
        release() {
            if (released) return;
            released = true;
            if (--acquired.refs === 0) {
                entries?.delete(inverse);
                acquired.texture.destroy(true);
            }
        },
    };
}
