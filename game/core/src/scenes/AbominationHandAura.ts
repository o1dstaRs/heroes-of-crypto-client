import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Mesh, MeshGeometry, Texture } from "pixi.js";
import { abominationHandProjection } from "./AbominationHandProjection";

export const ABOMINATION_HAND_ATLAS_KEY = "vfx_abomination_hand_aura_atlas";
const COLS = 4;
const FRAME_SIZE = 512;
const FRAME_MS = 100;
const POSES = 16;

/** Complete painted poses close and reopen the fingers; never blend two silhouettes. */
export function abominationHandFrame(ageMs: number): number {
    const tick = Math.floor(Math.max(0, ageMs) / FRAME_MS) % (2 * (POSES - 1));
    return tick < POSES ? tick : 2 * (POSES - 1) - tick;
}

type HandEffect = {
    mesh: Mesh<MeshGeometry>;
    started: number;
    seen: number;
    layout: string;
    sourceUvs: Float32Array;
    frame: number;
};
const owners = new WeakMap<Container, Map<string, HandEffect>>();

/** Hide pooled hands between inspections and release abandoned geometry. */
export function resetAbominationHandAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const effects = owners.get(container);
    if (!effects) return;
    for (const [key, effect] of effects) {
        effect.mesh.visible = false;
        if (now - effect.seen > 5000) {
            effect.mesh.destroy();
            effects.delete(key);
        }
    }
}

/** Complete half-size hand, wrist at the owner's feet and fingers pointing southeast. */
export function drawAbominationHandAura(
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
): void {
    if (!container || !texture || texture === Texture.EMPTY || !(alpha > 0) || !(range > 0)) return;
    let effects = owners.get(container);
    if (!effects) owners.set(container, (effects = new Map()));
    const key = `${ownerId}:${range}`;
    let effect = effects.get(key);
    // Duplicate buffs and selected/hovered/active previews share one hand per owner/range.
    if (effect?.mesh.visible) return;
    const layout = `${center.x}:${center.y}:${footprint.width}:${footprint.height}:${narrowing}:${gs.getCellSize()}:${gs.getMinX()}:${gs.getMaxX()}:${gs.getMinY()}:${gs.getMaxY()}`;
    if (!effect || effect.layout !== layout) {
        const projection = abominationHandProjection(center, footprint, range, gs, narrowing);
        if (!projection) return;
        if (!effect) {
            const geometry = new MeshGeometry(projection);
            const mesh = new Mesh({ geometry, texture });
            mesh.eventMode = "none";
            mesh.visible = false;
            mesh.label = "abomination-hand-aura";
            mesh.once("destroyed", () => geometry.destroy());
            container.addChild(mesh);
            effect = { mesh, started: now, seen: now, layout, sourceUvs: projection.uvs.slice(), frame: -1 };
            effects.set(key, effect);
        } else {
            const geometry = effect.mesh.geometry;
            geometry.uvs = projection.uvs.slice();
            geometry.positions = projection.positions;
            geometry.indices = projection.indices;
            effect.sourceUvs = projection.uvs;
            effect.layout = layout;
            effect.frame = -1;
        }
    }
    effect.seen = now;
    const age = Math.max(0, now - effect.started);
    const frame = abominationHandFrame(age);
    const { mesh } = effect;
    mesh.visible = true;
    mesh.texture = texture;
    mesh.alpha = Math.min(1, alpha * 1.3) * 0.72 * Math.min(1, age / 450);
    if (effect.frame !== frame) {
        const geometry = mesh.geometry;
        for (let i = 0; i < effect.sourceUvs.length; i += 2) {
            const u = Math.max(0.5 / FRAME_SIZE, Math.min(1 - 0.5 / FRAME_SIZE, effect.sourceUvs[i]));
            const v = Math.max(0.5 / FRAME_SIZE, Math.min(1 - 0.5 / FRAME_SIZE, effect.sourceUvs[i + 1]));
            geometry.uvs[i] = ((frame % COLS) + u) / COLS;
            geometry.uvs[i + 1] = (Math.floor(frame / COLS) + v) / COLS;
        }
        geometry.getBuffer("aUV").update();
        effect.frame = frame;
    }
}
