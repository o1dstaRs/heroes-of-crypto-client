import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Mesh, MeshGeometry, type Shader } from "pixi.js";
import { arachnaWebBounds, arachnaWebProjection } from "./ArachnaQueenWebAura";
import { auraProjectionKey } from "./auraProjectionKey";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";
import { createWhiteTigerPawShader, createWhiteTigerFieldShader } from "./WhiteTigerPawShader";

type Footprint = { width: number; height: number };
/** Fixed range centerline. Ribbon width is solely the decorative pawprint margin. */
export function whiteTigerPawProjection(
    center: HoCMath.XY,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    narrowing = 0,
) {
    const bounds = arachnaWebBounds(center, footprint, range, gs, narrowing);
    if (!bounds) return undefined;
    const cell = gs.getCellSize();
    const corners = [
        [bounds.left, bounds.bottom],
        [bounds.right, bounds.bottom],
        [bounds.right, bounds.top],
        [bounds.left, bounds.top],
    ];
    const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
    let arc = 0;
    for (let edge = 0; edge < 4; edge++) {
        const p = corners[edge],
            q = corners[(edge + 1) % 4];
        const dx = q[0] - p[0],
            dy = q[1] - p[1],
            length = Math.hypot(dx, dy);
        const count = Math.ceil((length / cell) * 16),
            base = positions.length / 2;
        for (let i = 0; i <= count; i++)
            for (const side of [-1, 1]) {
                const point = projectBattlefieldPoint(
                    {
                        x: p[0] + (dx * i) / count - (dy / length) * cell * 0.42 * side,
                        y: p[1] + (dy * i) / count + (dx / length) * cell * 0.42 * side,
                    },
                    gs,
                );
                positions.push(point.x, point.y);
                uvs.push((arc + (length * i) / count) / cell, side);
            }
        for (let i = 0; i < count; i++) {
            const a = base + i * 2;
            indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        arc += length;
    }
    return {
        bounds,
        perimeter: arc / cell,
        positions: new Float32Array(positions),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
    };
}

type Entry = {
    mesh: Mesh<MeshGeometry, Shader>;
    field: Mesh<MeshGeometry, Shader>;
    layout: string;
    seen: number;
    revealed: boolean;
    blend: number;
    changed: number;
};
const owners = new WeakMap<Container, Map<string, Entry>>();

export function resetWhiteTigerPawAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const entries = owners.get(container);
    if (!entries) return;
    for (const [id, entry] of entries) {
        entry.mesh.visible = false;
        entry.field.visible = false;
        if (entry.mesh.destroyed || now - entry.seen > 5000) {
            if (!entry.mesh.destroyed) entry.mesh.destroy();
            if (!entry.field.destroyed) entry.field.destroy();
            entries.delete(id);
        }
    }
}

/** Shared by the animation lab and normal selected/hovered aura rendering. */
export function drawWhiteTigerPawAura(
    container: Container | undefined,
    center: HoCMath.XY,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    ownerId: string,
    alpha: number,
    narrowing = 0,
    now = performance.now(),
    revealed = false,
): void {
    if (!container || !(alpha > 0) || !(range > 0)) return;
    let entries = owners.get(container);
    if (!entries) owners.set(container, (entries = new Map()));
    const key = `${ownerId}:${range}`;
    const layout = auraProjectionKey(center, footprint, range, gs, narrowing);
    let entry = entries.get(key);
    const previous = entry
        ? { revealed: entry.revealed, blend: entry.blend, changed: entry.changed, seen: entry.seen }
        : undefined;
    if (entry && (entry.mesh.destroyed || entry.layout !== layout)) {
        if (!entry.mesh.destroyed) entry.mesh.destroy();
        if (!entry.field.destroyed) entry.field.destroy();
        entries.delete(key);
        entry = undefined;
    }
    if (!entry) {
        const projection = whiteTigerPawProjection(center, footprint, range, gs, narrowing);
        if (!projection) return;
        const fieldProjection = arachnaWebProjection(center, footprint, range, gs, narrowing)!;
        const fieldGeometry = new MeshGeometry(fieldProjection);
        const fieldShader = createWhiteTigerFieldShader(
            [range * 2 + footprint.width, range * 2 + footprint.height],
            [footprint.width, footprint.height],
        );
        const field = new Mesh({ geometry: fieldGeometry, shader: fieldShader });
        field.label = "white-tiger-spectral-field";
        field.eventMode = "none";
        field.once("destroyed", () => {
            fieldGeometry.destroy(true);
            fieldShader.destroy();
        });
        container.addChild(field);
        const geometry = new MeshGeometry(projection),
            shader = createWhiteTigerPawShader();
        shader.resources.aura.uniforms.uPerimeter = projection.perimeter;
        const mesh = new Mesh({ geometry, shader });
        mesh.label = "white-tiger-paw-aura";
        mesh.eventMode = "none";
        mesh.once("destroyed", () => {
            geometry.destroy(true);
            shader.destroy();
        });
        container.addChild(mesh);
        entry = {
            mesh,
            field,
            layout,
            seen: previous?.seen ?? now,
            revealed: previous?.revealed ?? revealed,
            blend: previous?.blend ?? Number(revealed),
            changed: previous?.changed ?? now - 100000,
        };
        entries.set(key, entry);
    }
    if (entry.revealed !== revealed) {
        entry.revealed = revealed;
        entry.changed = now;
    }
    entry.blend += (Number(revealed) - entry.blend) * (1 - Math.exp(-Math.max(0, now - entry.seen) / 160));
    for (const mesh of [entry.mesh, entry.field]) {
        mesh.visible = true;
        mesh.alpha = Math.min(1, alpha);
        const uniforms = mesh.shader!.resources.aura.uniforms;
        uniforms.uTime = now / 1000;
        uniforms.uAlert = entry.blend;
        uniforms.uTransition = Math.max(0, now - entry.changed) / 1000;
    }
    entry.seen = now;
}
