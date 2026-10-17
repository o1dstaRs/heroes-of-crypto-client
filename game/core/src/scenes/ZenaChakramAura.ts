import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Mesh, MeshGeometry, Texture } from "pixi.js";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

type Point = HoCMath.XY;
export const ZENA_CHAKRAM_AURA_KEY = "vfx_zena_chakram_aura_v2";
const ROTATION_MS = 40000;
const SUBDIVISIONS = 24;
// Authored ring radius inside the padded sprite; arrows extend 20% beyond it.
const TEXTURE_RADIUS = 0.42;
const SPRITE_EXTENT = 1.2;
/** One full-size, constant-opacity ring; negative world rotation is clockwise on the y-up floor. */
export function zenaAuraRings(nowMs: number) {
    return [{ progress: 1, rotation: -((nowMs % ROTATION_MS) / ROTATION_MS) * Math.PI * 2, fade: 1 }];
}
/** Amber light and pale gold from the Rallying Volley aura icon. */
export const ZENA_AURA_PALETTE = {
    field: 0xc56a18,
    rim: 0xff9d28,
    arrow: 0xffdfa0,
};

/** Clip the floor geometry, retaining the original centre and rotated texture coordinates. */
export function zenaAuraProjection(
    center: Point,
    rx: number,
    ry: number,
    rotation: number,
    gs: GridSettings,
    narrowing = 0,
) {
    if (!(rx > 0 && ry > 0)) return undefined;
    const inset = Math.max(0, narrowing) * gs.getCellSize();
    const left = Math.max(center.x - rx * SPRITE_EXTENT, gs.getMinX() + inset);
    const right = Math.min(center.x + rx * SPRITE_EXTENT, gs.getMaxX() - inset);
    const bottom = Math.max(center.y - ry * SPRITE_EXTENT, gs.getMinY() + inset);
    const top = Math.min(center.y + ry * SPRITE_EXTENT, gs.getMaxY() - inset);
    if (right <= left || top <= bottom) return undefined;
    const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
    const cos = Math.cos(rotation),
        sin = Math.sin(rotation);
    for (let row = 0; row <= SUBDIVISIONS; row++) {
        for (let col = 0; col <= SUBDIVISIONS; col++) {
            const x = left + ((right - left) * col) / SUBDIVISIONS;
            const y = top - ((top - bottom) * row) / SUBDIVISIONS;
            const projected = projectBattlefieldPoint({ x, y }, gs);
            positions.push(projected.x, projected.y);
            const dx = (x - center.x) / rx,
                dy = (y - center.y) / ry;
            // Keep affine UVs beyond the image bounds: the sampler clamps to its transparent border.
            // Clamping individual vertices would deform the rim on diagonal waves.
            uvs.push(0.5 + (cos * dx + sin * dy) * TEXTURE_RADIUS, 0.5 - (-sin * dx + cos * dy) * TEXTURE_RADIUS);
            if (row < SUBDIVISIONS && col < SUBDIVISIONS) {
                const a = row * (SUBDIVISIONS + 1) + col,
                    b = a + SUBDIVISIONS + 1;
                indices.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
    }
    return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

type AuraSprite = { meshes: Mesh<MeshGeometry>[]; seen: number; drawn: boolean };
const owners = new WeakMap<Container, Map<string, AuraSprite>>();
export function resetZenaChakramAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const sprites = owners.get(container);
    if (!sprites) return;
    for (const [id, sprite] of sprites) {
        sprite.drawn = false;
        for (const mesh of sprite.meshes) mesh.visible = false;
        if (now - sprite.seen > 5000) {
            for (const mesh of sprite.meshes) mesh.destroy();
            sprites.delete(id);
        }
    }
}

/** The full-size chakram and arrow pairs rotate slowly together on the floor. */
export function drawZenaChakramAura(
    container: Container | undefined,
    texture: Texture | undefined,
    center: Point,
    extentX: number,
    extentY: number,
    _footprint: { width: number; height: number },
    gs: GridSettings,
    nowMs: number,
    alphaMultiplier: number,
    narrowing = 0,
    ownerId = "zena",
): void {
    if (!container || !texture || texture === Texture.EMPTY) return;
    let sprites = owners.get(container);
    if (!sprites) {
        sprites = new Map();
        owners.set(container, sprites);
    }
    let sprite = sprites.get(ownerId);
    if (!sprite) {
        sprite = { meshes: [], seen: nowMs, drawn: false };
        sprites.set(ownerId, sprite);
    }
    if (sprite.drawn) return;
    sprite.drawn = true;
    sprite.seen = nowMs;
    let slot = 0;
    for (const { progress, rotation, fade } of zenaAuraRings(nowMs)) {
        const rx = extentX * progress,
            ry = extentY * progress;
        const alpha = fade * alphaMultiplier;
        if (!(alpha > 0)) continue;
        const projection = zenaAuraProjection(center, rx, ry, rotation, gs, narrowing);
        if (!projection) continue;
        let mesh = sprite.meshes[slot++];
        if (!mesh) {
            const geometry = new MeshGeometry(projection);
            mesh = new Mesh({ texture, geometry });
            mesh.eventMode = "none";
            mesh.once("destroyed", () => geometry.destroy());
            container.addChild(mesh);
            sprite.meshes.push(mesh);
        } else {
            mesh.geometry.positions.set(projection.positions);
            mesh.geometry.uvs.set(projection.uvs);
            mesh.geometry.getBuffer("aPosition").update();
            mesh.geometry.getBuffer("aUV").update();
        }
        mesh.texture = texture;
        mesh.visible = true;
        // Normal blending keeps the bronze relief and dark engraving readable at a steady, unobtrusive opacity.
        mesh.alpha = Math.min(1, alpha * 0.25);
    }
    for (; slot < sprite.meshes.length; slot++) sprite.meshes[slot].visible = false;
}
