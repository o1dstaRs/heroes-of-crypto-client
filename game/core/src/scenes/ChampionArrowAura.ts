import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Mesh, MeshGeometry, Texture } from "pixi.js";
import { arachnaWebProjection as championArrowProjection } from "./ArachnaQueenWebAura";
export { arachnaWebProjection as championArrowProjection } from "./ArachnaQueenWebAura";

export const CHAMPION_ARROW_ATLAS_KEY = "vfx_champion_arrow_aura_atlas";
const FRAME_SIZE = 512;
const COLS = 8;
const FRAME_COUNT = 64;
const FRAME_MS = 50;

/** Mint core brightens and dims over 3.2 seconds; the green channel keeps the arrow readable. */
export function championArrowGlowTint(ageMs: number): number {
    const phase = (Math.max(0, ageMs) % 3200) / 3200;
    const glow = (1 - Math.cos(phase * Math.PI * 2)) / 2;
    const core = Math.round(64 + 191 * glow);
    return (core << 16) | (255 << 8) | core;
}

type ArrowSprite = {
    meshes: [Mesh<MeshGeometry>, Mesh<MeshGeometry>];
    started: number;
    seen: number;
};
const owners = new WeakMap<Container, Map<string, ArrowSprite>>();

/** Hide between inspections and release geometry after the owner leaves the scene. */
export function resetChampionArrowAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const sprites = owners.get(container);
    if (!sprites) return;
    for (const [key, sprite] of sprites) {
        for (const mesh of sprite.meshes) mesh.visible = false;
        if (now - sprite.seen > 5000) {
            for (const mesh of sprite.meshes) mesh.destroy();
            sprites.delete(key);
        }
    }
}

/** Adjacent baked frames blend continuously, including the last-to-first seam. */
export function championArrowFrames(ageMs: number) {
    const tick = Math.max(0, ageMs) / FRAME_MS;
    const frame = Math.floor(tick) % FRAME_COUNT;
    return { frame, next: (frame + 1) % FRAME_COUNT, mix: tick % 1 };
}

/** Authored raster arrows are projected onto the exact same playable footprint as the queen's silk. */
export function drawChampionArrowAura(
    container: Container | undefined,
    texture: Texture | undefined,
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    gs: GridSettings,
    ownerId: string,
    alpha: number,
    narrowing = 0,
    now = performance.now(),
    facing: -1 | 1 = 1,
): void {
    if (!container || !texture || texture === Texture.EMPTY || !(alpha > 0)) return;
    const projection = championArrowProjection(center, footprint, range, gs, narrowing);
    if (!projection) return;
    let sprites = owners.get(container);
    if (!sprites) owners.set(container, (sprites = new Map()));
    const key = `${ownerId}:${range}`;
    let sprite = sprites.get(key);
    if (!sprite) {
        const makeMesh = () => {
            const geometry = new MeshGeometry({
                positions: projection.positions.slice(),
                uvs: projection.uvs.slice(),
                indices: projection.indices.slice(),
            });
            const mesh = new Mesh({ texture, geometry });
            // Normal alpha-over darkens overlapping cels halfway through every 50 ms crossfade.
            // Additive light keeps their weighted brightness constant between atlas frames.
            mesh.blendMode = "add";
            mesh.eventMode = "none";
            mesh.label = "champion-arrow-aura";
            mesh.visible = false;
            mesh.once("destroyed", () => geometry.destroy());
            container.addChild(mesh);
            return mesh;
        };
        sprite = { meshes: [makeMesh(), makeMesh()], started: now, seen: now };
        sprites.set(key, sprite);
    }
    // Selected, hovered and active previews share one effect per owner.
    if (sprite.meshes[0].visible) return;
    // Keep forward motion continuous through slow rendering and brief changes
    // of selection. A fresh reveal belongs only to a newly created pooled owner.
    sprite.seen = now;
    const age = now - sprite.started;
    const { frame, next, mix } = championArrowFrames(age);
    const revealProgress = Math.min(1, Math.max(0, age / 900));
    const reveal = revealProgress * revealProgress * (3 - 2 * revealProgress);
    const opacity = Math.min(1, alpha * 1.3) * reveal * 0.8;
    const tint = championArrowGlowTint(age);
    for (let layer = 0; layer < 2; layer++) {
        const mesh = sprite.meshes[layer];
        const index = layer === 0 ? frame : next;
        mesh.visible = true;
        mesh.texture = texture;
        mesh.tint = tint;
        mesh.alpha = opacity * (layer === 0 ? 1 - mix : mix);
        const geometry = mesh.geometry;
        geometry.positions.set(projection.positions);
        geometry.indices.set(projection.indices);
        geometry.getIndex().update();
        // Project the same clipped footprint for both adjacent painted frames.
        geometry.getBuffer("aPosition").update();
        for (let i = 0; i < projection.uvs.length; i += 2) {
            const sourceU = facing < 0 ? 1 - projection.uvs[i] : projection.uvs[i];
            const u = Math.max(0.5 / FRAME_SIZE, Math.min(1 - 0.5 / FRAME_SIZE, sourceU));
            // Six authored rows fill the base 6x6 field; buffs use the actual projected aura extent too.
            const sourceV = projection.uvs[i + 1];
            const v = Math.max(0.5 / FRAME_SIZE, Math.min(1 - 0.5 / FRAME_SIZE, sourceV));
            geometry.uvs[i] = ((index % COLS) + u) / COLS;
            geometry.uvs[i + 1] = (Math.floor(index / COLS) + v) / COLS;
        }
        geometry.getBuffer("aUV").update();
    }
}
