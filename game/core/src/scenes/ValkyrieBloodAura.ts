import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Mesh, MeshGeometry, type Shader } from "pixi.js";
import { auraProjectionKey } from "./auraProjectionKey";
import { whiteTigerPawProjection } from "./WhiteTigerPawAura";
import { createValkyrieBloodShader } from "./ValkyrieBloodShader";
import { ValkyrieBloodSpray } from "./ValkyrieBloodSpray";

type Entry = {
    mesh: Mesh<MeshGeometry, Shader>;
    spray: ValkyrieBloodSpray;
    bounds: NonNullable<ReturnType<typeof whiteTigerPawProjection>>["bounds"];
    layout: string;
    seen: number;
};
const owners = new WeakMap<Container, Map<string, Entry>>();
export const VALKYRIE_BLOOD_AURA_LIMIT = 16;

export function resetValkyrieBloodAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const entries = owners.get(container);
    if (!entries) return;
    for (const [id, entry] of entries) {
        entry.mesh.visible = false;
        entry.spray.mesh.visible = false;
        if (entry.mesh.destroyed || now - entry.seen > 5000) {
            if (!entry.mesh.destroyed) entry.mesh.destroy();
            entries.delete(id);
        }
    }
}

/** Tiger's exact clipped range ribbon, with blood in place of paws; shared lab/combat path. */
export function drawValkyrieBloodAura(
    container: Container | undefined,
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    gs: GridSettings,
    ownerId: string,
    alpha: number,
    narrowing = 0,
    now = performance.now(),
): void {
    if (!container || !(alpha > 0) || !(range > 0)) return;
    let entries = owners.get(container);
    if (!entries) owners.set(container, (entries = new Map()));
    const layout = auraProjectionKey(center, footprint, range, gs, narrowing);
    let entry = entries.get(ownerId);
    if (entry?.mesh.destroyed) {
        entries.delete(ownerId);
        entry = undefined;
    }
    if (entry && entry.layout !== layout) {
        const projection = whiteTigerPawProjection(center, footprint, range, gs, narrowing);
        if (!projection) {
            entry.mesh.visible = false;
            entry.spray.mesh.visible = false;
            return;
        }
        // Upload changed bounds into the owned buffers; walking never recompiles a material.
        entry.mesh.geometry.positions = projection.positions;
        entry.mesh.geometry.uvs = projection.uvs;
        entry.mesh.geometry.indices = projection.indices;
        entry.mesh.shader!.resources.aura.uniforms.uPerimeter = projection.perimeter;
        entry.bounds = projection.bounds;
        entry.layout = layout;
    }
    if (!entry) {
        const projection = whiteTigerPawProjection(center, footprint, range, gs, narrowing);
        if (!projection) return;
        if (entries.size >= VALKYRIE_BLOOD_AURA_LIMIT) {
            let oldestId = "",
                oldest = Infinity;
            for (const [id, candidate] of entries) {
                if (candidate.seen < oldest) {
                    oldestId = id;
                    oldest = candidate.seen;
                }
            }
            entries.get(oldestId)!.mesh.destroy();
            entries.delete(oldestId);
        }
        const geometry = new MeshGeometry(projection);
        const shader = createValkyrieBloodShader(projection.perimeter);
        const mesh = new Mesh({ geometry, shader });
        const spray = new ValkyrieBloodSpray();
        mesh.label = "valkyrie-blood-aura";
        mesh.eventMode = "none";
        mesh.once("destroyed", () => {
            geometry.destroy(true);
            shader.destroy();
            if (!spray.mesh.destroyed) spray.mesh.destroy();
        });
        container.addChild(mesh, spray.mesh);
        entry = { mesh, spray, bounds: projection.bounds, layout, seen: now };
        entries.set(ownerId, entry);
    }
    entry.mesh.visible = true;
    entry.mesh.alpha = Math.min(1, alpha);
    entry.mesh.shader!.resources.aura.uniforms.uTime = now / 1000;
    entry.spray.update(entry.bounds, gs, now / 1000, alpha, narrowing);
    entry.seen = now;
}
