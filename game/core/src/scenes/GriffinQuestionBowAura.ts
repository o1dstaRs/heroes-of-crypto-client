import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Mesh, MeshGeometry, Texture } from "pixi.js";
import {
    rotatingAuraProjection,
    syncRotatingAuraGeometry,
    type RotatingAuraProjection,
} from "./RotatingAuraProjection";

export const GRIFFIN_QUESTION_BOW_AURA_KEY = "vfx_griffin_question_bow_aura_v3";
export const GRIFFIN_AURA_ROTATION_MS = 24000;
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
    previous?: RotatingAuraProjection,
) {
    if (!(range > 0)) return undefined;
    const cell = gs.getCellSize();
    const rx = (range + footprint.width / 2 - 0.055) * cell * ARTWORK_SCALE;
    const ry = (range + footprint.height / 2 - 0.055) * cell * ARTWORK_SCALE;
    return rotatingAuraProjection(center, rx, ry, rotation, gs, narrowing, 1, TEXTURE_RADIUS, previous);
}

type Aura = { mesh: Mesh<MeshGeometry>; started: number; seen: number; projection: RotatingAuraProjection };
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
        aura?.projection,
    );
    if (!projection) return;
    if (!aura) {
        const geometry = new MeshGeometry(projection);
        const mesh = new Mesh({ texture, geometry });
        mesh.label = "griffin-question-bow-aura";
        mesh.eventMode = "none";
        mesh.once("destroyed", () => geometry.destroy());
        container.addChild(mesh);
        aura = { mesh, started: now, seen: now, projection };
        entries.set(key, aura);
    } else {
        syncRotatingAuraGeometry(aura.mesh.geometry, projection);
        aura.projection = projection;
    }
    aura.seen = now;
    aura.mesh.texture = texture;
    aura.mesh.visible = true;
    aura.mesh.alpha = Math.min(1, alpha) * 0.65;
}
