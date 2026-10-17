import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Mesh, MeshGeometry, Texture } from "pixi.js";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";
import { auraProjectionKey } from "./auraProjectionKey";

type Point = HoCMath.XY;
type Footprint = { width: number; height: number };
export type WebBounds = { left: number; right: number; bottom: number; top: number };
/** Same footprint-distance contract as the engine's square aura, clipped to playable cells. */
export function arachnaWebBounds(
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    narrowing = 0,
): WebBounds | undefined {
    if (!(range > 0)) return undefined;
    const cell = gs.getCellSize();
    const inset = Math.max(0, narrowing) * cell;
    const bounds = {
        left: Math.max(center.x - (range + footprint.width / 2) * cell, gs.getMinX() + inset),
        right: Math.min(center.x + (range + footprint.width / 2) * cell, gs.getMaxX() - inset),
        bottom: Math.max(center.y - (range + footprint.height / 2) * cell, gs.getMinY() + inset),
        top: Math.min(center.y + (range + footprint.height / 2) * cell, gs.getMaxY() - inset),
    };
    return bounds.right > bounds.left && bounds.top > bounds.bottom ? bounds : undefined;
}
export const ARACHNA_WEB_ATLAS_KEY = "vfx_arachna_web_aura_atlas";
const COLS = 6;
const ROWS = 6;
const FRAME_SIZE = 640;
const SUBDIVISIONS = 16;

/** Reveal timing stays unchanged; the baked wind/crawling loop plays at 75% speed. */
export function arachnaWebFrame(ageMs: number): number {
    const age = Math.max(0, ageMs);
    return age < 800 ? Math.floor(age / 100) : 8 + (Math.floor(((age - 800) * 0.75) / 100) % 28);
}

/** Crop the bitmap at board edges instead of squeezing its centre away from the queen. */
export function arachnaWebProjection(
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    narrowing = 0,
) {
    const bounds = arachnaWebBounds(center, footprint, range, gs, narrowing);
    if (!bounds) return undefined;
    const width = (range * 2 + footprint.width) * gs.getCellSize();
    const height = (range * 2 + footprint.height) * gs.getCellSize();
    const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
    for (let row = 0; row <= SUBDIVISIONS; row++) {
        for (let col = 0; col <= SUBDIVISIONS; col++) {
            const x = bounds.left + ((bounds.right - bounds.left) * col) / SUBDIVISIONS;
            const y = bounds.top - ((bounds.top - bounds.bottom) * row) / SUBDIVISIONS;
            const point = projectBattlefieldPoint({ x, y }, gs);
            positions.push(point.x, point.y);
            uvs.push((x - center.x) / width + 0.5, (center.y - y) / height + 0.5);
            if (row < SUBDIVISIONS && col < SUBDIVISIONS) {
                const a = row * (SUBDIVISIONS + 1) + col,
                    b = a + SUBDIVISIONS + 1;
                indices.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
    }
    return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

type WebSprite = {
    mesh: Mesh<MeshGeometry>;
    started: number;
    seen: number;
    layout: string;
    sourceUvs: Float32Array;
    frame: number;
};
const owners = new WeakMap<Container, Map<string, WebSprite>>();
export function resetArachnaQueenWebAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const sprites = owners.get(container);
    if (!sprites) return;
    for (const [id, sprite] of sprites) {
        sprite.mesh.visible = false;
        if (now - sprite.seen > 5000) {
            sprite.mesh.destroy();
            sprites.delete(id);
        }
    }
}

/** Only displays authored bitmap frames. The mesh projects that sprite onto the existing floor. */
export function drawArachnaQueenWebAura(
    container: Container | undefined,
    texture: Texture | undefined,
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    ownerId: string,
    alpha: number,
    narrowing = 0,
    now = performance.now(),
): void {
    if (!container || !texture || texture === Texture.EMPTY) return;
    let sprites = owners.get(container);
    if (!sprites) {
        sprites = new Map();
        owners.set(container, sprites);
    }
    let sprite = sprites.get(ownerId);
    const layout = auraProjectionKey(center, footprint, range, gs, narrowing);
    const projection =
        !sprite || sprite.layout !== layout ? arachnaWebProjection(center, footprint, range, gs, narrowing) : undefined;
    if ((!sprite || sprite.layout !== layout) && !projection) return;
    if (!sprite && projection) {
        const geometry = new MeshGeometry({ ...projection, uvs: projection.uvs.slice() });
        const mesh = new Mesh({ texture, geometry });
        mesh.eventMode = "none";
        mesh.once("destroyed", () => geometry.destroy());
        container.addChild(mesh);
        sprite = { mesh, started: now, seen: now, layout, sourceUvs: projection.uvs, frame: -1 };
        sprites.set(ownerId, sprite);
    } else if (sprite && projection) {
        sprite.mesh.geometry.positions = projection.positions;
        sprite.sourceUvs = projection.uvs;
        sprite.layout = layout;
        sprite.frame = -1;
    }
    if (!sprite) return;
    if (now - sprite.seen > 180) sprite.started = now;
    sprite.seen = now;
    const frame = arachnaWebFrame(now - sprite.started);
    const { mesh } = sprite;
    mesh.visible = true;
    mesh.alpha = Math.min(1, alpha * 1.12);
    mesh.texture = texture;
    if (sprite.frame === frame) return;
    const geometry = mesh.geometry;
    for (let i = 0; i < sprite.sourceUvs.length; i += 2) {
        // Half-pixel guards prevent sampling a neighbouring frame at clipped sheet edges.
        const u = Math.max(0.5 / FRAME_SIZE, Math.min(1 - 0.5 / FRAME_SIZE, sprite.sourceUvs[i]));
        const v = Math.max(0.5 / FRAME_SIZE, Math.min(1 - 0.5 / FRAME_SIZE, sprite.sourceUvs[i + 1]));
        geometry.uvs[i] = ((frame % COLS) + u) / COLS;
        geometry.uvs[i + 1] = (Math.floor(frame / COLS) + v) / ROWS;
    }
    geometry.getBuffer("aUV").update();
    sprite.frame = frame;
}
