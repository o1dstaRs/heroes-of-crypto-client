import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Mesh, MeshGeometry, type Shader } from "pixi.js";
import { auraProjectionKey } from "./auraProjectionKey";
import { leprechaunCloverProjection } from "./LeprechaunCloverProjection";
import { createLeprechaunCloverShader } from "./LeprechaunCloverShader";

type Entry = { meshes: Mesh<MeshGeometry, Shader>[]; layout: string; seen: number };
const owners = new WeakMap<Container, Map<string, Entry>>();
export const LEPRECHAUN_CLOVER_AURA_LIMIT = 16;

export function resetLeprechaunCloverAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const entries = owners.get(container);
    if (!entries) return;
    for (const [id, entry] of entries) {
        for (const mesh of entry.meshes) mesh.visible = false;
        if (entry.meshes.some((mesh) => mesh.destroyed) || now - entry.seen > 5000) {
            for (const mesh of entry.meshes) if (!mesh.destroyed) mesh.destroy();
            entries.delete(id);
        }
    }
}

/** Stationary seam clovers with a steady soft green interior glow; artwork only. */
export function drawLeprechaunCloverAura(
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
    let entry = entries.get(ownerId);
    if (entry?.meshes.some((mesh) => mesh.destroyed)) {
        for (const mesh of entry.meshes) if (!mesh.destroyed) mesh.destroy();
        entries.delete(ownerId);
        entry = undefined;
    }
    const layout = auraProjectionKey(center, footprint, range, gs, narrowing);
    if (!entry || entry.layout !== layout) {
        const projection = leprechaunCloverProjection(center, footprint, range, gs, narrowing);
        if (!projection) {
            if (entry) for (const mesh of entry.meshes) mesh.visible = false;
            return;
        }
        const { ribbon, glow } = projection;
        const projections = [glow, ribbon];
        if (entry) {
            entry.meshes.forEach((mesh, i) => {
                mesh.geometry.positions = projections[i].positions;
                mesh.geometry.uvs = projections[i].uvs;
                mesh.geometry.indices = projections[i].indices;
                mesh.shader!.resources.aura.uniforms.uPerimeter = ribbon.perimeter;
            });
            entry.layout = layout;
        } else {
            if (entries.size >= LEPRECHAUN_CLOVER_AURA_LIMIT) {
                const oldest = [...entries].reduce((a, b) => (a[1].seen < b[1].seen ? a : b));
                for (const mesh of oldest[1].meshes) mesh.destroy();
                entries.delete(oldest[0]);
            }
            const meshes = projections.map((geometryData, i) => {
                const geometry = new MeshGeometry(geometryData);
                const shader = createLeprechaunCloverShader(ribbon.perimeter, i === 0);
                const mesh = new Mesh({ geometry, shader });
                mesh.label = i === 0 ? "leprechaun-inner-glow" : "leprechaun-clover-perimeter";
                mesh.eventMode = "none";
                mesh.once("destroyed", () => {
                    geometry.destroy(true);
                    shader.destroy();
                });
                container.addChild(mesh);
                return mesh;
            });
            entry = { meshes, layout, seen: now };
            entries.set(ownerId, entry);
        }
    }
    for (const mesh of entry.meshes) {
        mesh.visible = true;
        mesh.alpha = Math.min(1, alpha);
        mesh.shader!.resources.aura.uniforms.uTime = now / 1000;
    }
    entry.seen = now;
}
