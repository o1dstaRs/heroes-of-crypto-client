import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Mesh, MeshGeometry, Texture } from "pixi.js";
import {
    rotatingAuraProjection,
    syncRotatingAuraGeometry,
    type RotatingAuraProjection,
} from "./RotatingAuraProjection";

export const CRUSADER_SIX_SWORDS_AURA_KEY = "vfx_crusader_six_swords_aura_v1";
export const CRUSADER_AURA_ROTATION_MS = 24000;
// The authored six-sword circle includes a transparent glow margin.
const TEXTURE_RADIUS = 0.5;
const ARTWORK_SCALE = 1.1;

/** Negative world rotation appears clockwise through the battlefield's y-up transform. */
export function crusaderAuraRotation(ageMs: number): number {
    return -((Math.max(0, ageMs) % CRUSADER_AURA_ROTATION_MS) / CRUSADER_AURA_ROTATION_MS) * Math.PI * 2;
}

export function crusaderAuraProjection(
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

export function resetCrusaderSixSwordsAuras(container?: Container, now = performance.now()): void {
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

/** Six golden swords rotate on the floor beneath the Crusader. */
export function drawCrusaderSixSwordsAura(
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
    const projection = crusaderAuraProjection(
        center,
        footprint,
        range,
        crusaderAuraRotation(now - (aura?.started ?? now)),
        gs,
        narrowing,
        aura?.projection,
    );
    if (!projection) return;
    if (!aura) {
        const geometry = new MeshGeometry(projection);
        const mesh = new Mesh({ texture, geometry });
        mesh.label = "crusader-six-swords-aura";
        mesh.eventMode = "none";
        mesh.blendMode = "add";
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
    aura.mesh.alpha = Math.min(1, alpha * 1.5);
}
