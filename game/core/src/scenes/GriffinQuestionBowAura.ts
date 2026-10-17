import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Mesh, MeshGeometry, Texture } from "pixi.js";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

export const GRIFFIN_QUESTION_BOW_AURA_KEY = "vfx_griffin_question_bow_aura_v3";
export const GRIFFIN_AURA_ROTATION_MS = 24000;
const SUBDIVISIONS = 24;
// The ring has transparent padding so rotated UVs can safely sample outside its border.
const TEXTURE_RADIUS = 0.5;
const ARTWORK_SCALE = 1.25;

/** Negative world rotation appears clockwise through the battlefield's y-up transform. */
export function griffinAuraRotation(ageMs: number): number {
    return -((Math.max(0, ageMs) % GRIFFIN_AURA_ROTATION_MS) / GRIFFIN_AURA_ROTATION_MS) * Math.PI * 2;
}

export function griffinAuraProjection(
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    rotation: number,
    gs: GridSettings,
    narrowing = 0,
) {
    if (!(range > 0)) return undefined;
    const cell = gs.getCellSize();
    const rx = (range + footprint.width / 2 - 0.055) * cell * ARTWORK_SCALE;
    const ry = (range + footprint.height / 2 - 0.055) * cell * ARTWORK_SCALE;
    const inset = Math.max(0, narrowing) * cell;
    const left = Math.max(center.x - rx, gs.getMinX() + inset);
    const right = Math.min(center.x + rx, gs.getMaxX() - inset);
    const bottom = Math.max(center.y - ry, gs.getMinY() + inset);
    const top = Math.min(center.y + ry, gs.getMaxY() - inset);
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
            // Inverse rotation samples a rigid emblem; clipping never recentres or stretches it.
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

type Aura = { mesh: Mesh<MeshGeometry>; started: number; seen: number };
const owners = new WeakMap<Container, Map<string, Aura>>();

export function resetGriffinQuestionBowAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const entries = owners.get(container);
    if (!entries) return;
    for (const [id, aura] of entries) {
        aura.mesh.visible = false;
        if (now - aura.seen > 5000) {
            aura.mesh.destroy();
            entries.delete(id);
        }
    }
}

/** Golden question marks and passive-icon bows rotate around the Griffin on the battlefield floor. */
export function drawGriffinQuestionBowAura(
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
    if (!container || !texture || texture === Texture.EMPTY || !(alpha > 0)) return;
    let entries = owners.get(container);
    if (!entries) owners.set(container, (entries = new Map()));
    const key = `${ownerId}:${range}`;
    let aura = entries.get(key);
    if (aura?.mesh.visible) return;
    const projection = griffinAuraProjection(
        center,
        footprint,
        range,
        griffinAuraRotation(now - (aura?.started ?? now)),
        gs,
        narrowing,
    );
    if (!projection) return;
    if (!aura) {
        const geometry = new MeshGeometry(projection);
        const mesh = new Mesh({ texture, geometry });
        mesh.label = "griffin-question-bow-aura";
        mesh.eventMode = "none";
        mesh.once("destroyed", () => geometry.destroy());
        container.addChild(mesh);
        aura = { mesh, started: now, seen: now };
        entries.set(key, aura);
    } else {
        aura.mesh.geometry.positions.set(projection.positions);
        aura.mesh.geometry.uvs.set(projection.uvs);
        aura.mesh.geometry.getBuffer("aPosition").update();
        aura.mesh.geometry.getBuffer("aUV").update();
    }
    aura.seen = now;
    aura.mesh.texture = texture;
    aura.mesh.visible = true;
    aura.mesh.alpha = Math.min(1, alpha) * 0.65;
}
