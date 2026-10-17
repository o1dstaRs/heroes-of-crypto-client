import type { Sprite, Texture } from "pixi.js";

type Point = { x: number; y: number };
const gripCache = new WeakMap<Texture, Point>();

/** Find the upper body inside the central silhouette, ignoring transparent canvas padding. */
export function findOpaqueGripPoint(data: ArrayLike<number>, width: number, height: number): Point | undefined {
    const solid = (x: number, y: number) => data[(y * width + x) * 4 + 3] >= 128;
    let left = width,
        right = -1,
        top = height,
        bottom = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!solid(x, y)) continue;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
    }
    if (right < left) return undefined;
    const bodyWidth = right - left + 1;
    const bodyHeight = bottom - top + 1;
    const center = (left + right) / 2;
    const columns: Point[] = [];
    for (let x = Math.ceil(center - bodyWidth * 0.12); x <= Math.floor(center + bodyWidth * 0.12); x++) {
        for (let y = top; y <= bottom - 2; y++) {
            // Require body coverage, not an isolated translucent hair or feather.
            if (solid(x, y) && solid(x, y + 1) && solid(x, y + 2)) {
                columns.push({ x, y });
                break;
            }
        }
    }
    if (!columns.length) return undefined;
    columns.sort((a, b) => a.y - b.y);
    const surfaceY = columns[Math.floor(columns.length / 2)].y;
    // Low/wide bodies are gripped just inside the back; upright bodies below the head.
    const inset = bodyHeight * (bodyWidth / bodyHeight > 0.9 ? 0.04 : 0.18);
    const wantedY = Math.min(bottom, Math.round(surfaceY + inset));
    for (let y = wantedY; y <= bottom; y++) {
        const candidates = columns.filter(({ x }) => solid(x, y));
        if (!candidates.length) continue;
        candidates.sort((a, b) => Math.abs(a.x - center) - Math.abs(b.x - center));
        return { x: candidates[0].x + 0.5, y: y + 0.5 };
    }
    return columns[Math.floor(columns.length / 2)];
}

/** Read once per pose/texture; cache coordinates, never world positions or creature scale. */
function textureGripPoint(texture: Texture): Point | undefined {
    const cached = gripCache.get(texture);
    if (cached) return cached;
    const resource = texture.source.resource;
    if (!resource || typeof document === "undefined" || texture.rotate) return undefined;
    const canvas = document.createElement("canvas");
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    try {
        const frame = texture.frame;
        const resolution = texture.source.resolution;
        ctx.drawImage(
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
        const point = findOpaqueGripPoint(ctx.getImageData(0, 0, size, size).data, size, size);
        if (!point) return undefined;
        const trim = texture.trim;
        const result = {
            x: (trim?.x ?? 0) + (point.x / size) * (trim?.width ?? texture.orig.width),
            y: (trim?.y ?? 0) + (point.y / size) * (trim?.height ?? texture.orig.height),
        };
        gripCache.set(texture, result);
        return result;
    } catch {
        // A not-yet-ready image can be sampled on the next visual update.
        return undefined;
    }
}

export function renderedCastlingGripPoint(sprite: Sprite): Point | undefined {
    const point = textureGripPoint(sprite.texture);
    if (!point) return undefined;
    const x = (point.x - sprite.anchor.x * sprite.texture.orig.width) * sprite.scale.x;
    const y = (point.y - sprite.anchor.y * sprite.texture.orig.height) * sprite.scale.y;
    const c = Math.cos(sprite.rotation),
        s = Math.sin(sprite.rotation);
    return { x: sprite.x + x * c - y * s, y: sprite.y + x * s + y * c };
}
