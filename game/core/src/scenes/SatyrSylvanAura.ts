import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Graphics, Mesh, MeshGeometry, type Shader } from "pixi.js";
import { arachnaWebBounds, arachnaWebProjection } from "./ArachnaQueenWebAura";
import { projectBattlefieldPoint, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";
import { createSatyrSylvanShader } from "./SatyrSylvanShader";
import { createSylvanStarMesh, updateSylvanStars } from "./SatyrSylvanStars";

type Point = HoCMath.XY;
type Footprint = { width: number; height: number };
type SylvanMesh = Mesh<MeshGeometry, Shader>;
type Aura = {
    floor: Container;
    back: Container;
    front: Container;
    ground: SylvanMesh;
    core: SylvanMesh;
    veils: SylvanMesh[];
    stars: ReturnType<typeof createSylvanStarMesh>[];
    boundary: Graphics;
    masks: Graphics[];
    layout: string;
    seen: number;
    started: number;
    scratch: Point;
    projected: Point;
};
const owners = new WeakMap<Container, Map<string, Aura>>();
// .69 bright-ring radius × 1.6 = 1.104 factual extents, matching Griffin/Pegasus width.
export const SYLVAN_ART_SCALE = 1.6;
export function sylvanArtworkProjection(
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    narrowing = 0,
) {
    return arachnaWebProjection(
        center,
        {
            width: (range * 2 + footprint.width) * SYLVAN_ART_SCALE - range * 2,
            height: (range * 2 + footprint.height) * SYLVAN_ART_SCALE - range * 2,
        },
        range,
        gs,
        narrowing,
    );
}
export function sylvanCoreProjection(center: Point, gs: GridSettings, narrowing = 0) {
    return arachnaWebProjection(center, { width: 1.6, height: 1.6 }, 1, gs, narrowing);
}
const SEGMENTS = 40,
    ROWS = 8;

function makeMesh(kind: "floor" | "veil" | "core", geometry: MeshGeometry): SylvanMesh {
    const shader = createSatyrSylvanShader(kind);
    const mesh = new Mesh({ geometry, shader });
    mesh.label = `satyr-sylvan-${kind}`;
    mesh.eventMode = "none";
    mesh.blendMode = "add";
    mesh.once("destroyed", () => {
        shader.destroy();
        geometry.destroy(true);
    });
    return mesh;
}

/** Half-cylinder, anchored in projected ground space; height is visual altitude only. */
export function sylvanVeilGeometry(
    center: Point,
    rx: number,
    ry: number,
    cell: number,
    gs: GridSettings,
    front: boolean,
) {
    const positions = new Float32Array((SEGMENTS + 1) * (ROWS + 1) * 2);
    const uvs = new Float32Array(positions.length);
    const indices = new Uint32Array(SEGMENTS * ROWS * 6);
    const p = { x: 0, y: 0 },
        projected = { x: 0, y: 0 };
    for (let y = 0; y <= ROWS; y++)
        for (let x = 0; x <= SEGMENTS; x++) {
            const u = (x / SEGMENTS) * 0.5 + (front ? 0.5 : 0),
                h = y / ROWS,
                angle = u * Math.PI * 2;
            const radius = 0.73 + 0.1 * h;
            p.x = center.x + Math.cos(angle) * rx * radius;
            p.y = center.y + Math.sin(angle) * ry * radius;
            projectBattlefieldPoint(p, gs, projected);
            const i = (y * (SEGMENTS + 1) + x) * 2;
            positions[i] = projected.x;
            positions[i + 1] = projected.y + h * cell * 0.8;
            uvs[i] = u;
            uvs[i + 1] = h;
            if (x < SEGMENTS && y < ROWS) {
                const k = (y * SEGMENTS + x) * 6,
                    v = y * (SEGMENTS + 1) + x;
                indices.set([v, v + 1, v + SEGMENTS + 1, v + 1, v + SEGMENTS + 2, v + SEGMENTS + 1], k);
            }
        }
    return { positions, uvs, indices };
}

function dispose(aura: Aura) {
    for (const layer of [aura.floor, aura.back, aura.front]) if (!layer.destroyed) layer.destroy({ children: true });
}

export function resetSatyrSylvanAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const entries = owners.get(container);
    if (!entries) return;
    for (const [key, aura] of entries) {
        if (aura.floor.destroyed || aura.back.destroyed || aura.front.destroyed || now - aura.seen > 5000) {
            dispose(aura);
            entries.delete(key);
        } else aura.floor.visible = aura.back.visible = aura.front.visible = false;
    }
}

/** Sylvan Focus paint. No gameplay values, hit areas, textures or global filters are changed. */
export function drawSatyrSylvanAura(
    container: Container | undefined,
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    ownerId: string,
    alpha: number,
    narrowing = 0,
    now = performance.now(),
    foreground?: { container: Container; depth: number },
): void {
    if (!container || container.destroyed || !(alpha > 0)) return;
    const bounds = arachnaWebBounds(center, footprint, range, gs, narrowing);
    if (!bounds) return;
    let entries = owners.get(container);
    if (!entries) owners.set(container, (entries = new Map()));
    const key = `${ownerId}:${range}`;
    let aura = entries.get(key);
    if (aura && (aura.floor.destroyed || aura.back.destroyed || aura.front.destroyed)) {
        dispose(aura);
        entries.delete(key);
        aura = undefined;
    }
    if (aura?.floor.visible) return;
    const cell = gs.getCellSize(),
        rx = (range + footprint.width / 2) * cell,
        ry = (range + footprint.height / 2) * cell;
    if (!aura) {
        const floor = new Container({ label: "satyr-sylvan-floor-layer" }),
            back = new Container({ label: "satyr-sylvan-back" }),
            front = new Container({ label: "satyr-sylvan-front" });
        floor.eventMode = back.eventMode = front.eventMode = "none";
        container.addChild(floor, back, front);
        const masks = [floor, back, front].map((layer) => layer.addChild(new Graphics()));
        const ground = makeMesh(
            "floor",
            new MeshGeometry(sylvanArtworkProjection(center, footprint, range, gs, narrowing)!),
        );
        floor.addChild(ground);
        ground.mask = masks[0];
        const core = makeMesh(
            "core",
            new MeshGeometry(
                sylvanCoreProjection(center, gs, narrowing) ??
                    sylvanArtworkProjection(center, footprint, range, gs, narrowing)!,
            ),
        );
        floor.addChild(core);
        core.mask = masks[0];
        const boundary = floor.addChild(new Graphics());
        boundary.label = "satyr-gameplay-range";
        const veils = [back, front].map((layer, i) => {
            const mesh = makeMesh(
                "veil",
                new MeshGeometry(
                    sylvanVeilGeometry(center, rx * SYLVAN_ART_SCALE, ry * SYLVAN_ART_SCALE, cell, gs, i === 1),
                ),
            );
            layer.addChild(mesh);
            mesh.mask = masks[i + 1];
            return mesh;
        });
        const stars = [back, front].map((layer, i) => {
            const mesh = layer.addChild(createSylvanStarMesh());
            mesh.mask = masks[i + 1];
            return mesh;
        });
        aura = {
            floor,
            back,
            front,
            ground,
            core,
            veils,
            stars,
            boundary,
            masks,
            layout: "",
            seen: now,
            started: now,
            scratch: { x: 0, y: 0 },
            projected: { x: 0, y: 0 },
        };
        floor.once("destroyed", () => {
            if (!back.destroyed) back.destroy({ children: true });
            if (!front.destroyed) front.destroy({ children: true });
        });
        entries.set(key, aura);
    }
    const target = foreground && !foreground.container.destroyed ? foreground.container : container;
    if (aura.back.parent !== target) target.addChild(aura.back);
    if (aura.front.parent !== target) target.addChild(aura.front);
    if (foreground && target === foreground.container) {
        target.sortableChildren = true;
        aura.back.zIndex = foreground.depth - 1.25;
        aura.front.zIndex = foreground.depth;
    }
    const layout = [
        center.x,
        center.y,
        rx,
        ry,
        cell,
        gs.getMinX(),
        gs.getMaxX(),
        gs.getMinY(),
        gs.getMaxY(),
        narrowing,
    ].join(":");
    if (aura.layout !== layout) {
        const projection = sylvanArtworkProjection(center, footprint, range, gs, narrowing)!;
        aura.ground.geometry.positions.set(projection.positions);
        aura.ground.geometry.uvs.set(projection.uvs);
        aura.ground.geometry.getBuffer("aPosition").update();
        aura.ground.geometry.getBuffer("aUV").update();
        const coreProjection = sylvanCoreProjection(center, gs, narrowing);
        aura.core.visible = Boolean(coreProjection);
        if (coreProjection) {
            aura.core.geometry.positions.set(coreProjection.positions);
            aura.core.geometry.uvs.set(coreProjection.uvs);
            aura.core.geometry.getBuffer("aPosition").update();
            aura.core.geometry.getBuffer("aUV").update();
        }
        for (let i = 0; i < 2; i++) {
            aura.veils[i].geometry.positions.set(
                sylvanVeilGeometry(center, rx * SYLVAN_ART_SCALE, ry * SYLVAN_ART_SCALE, cell, gs, i === 1).positions,
            );
            aura.veils[i].geometry.getBuffer("aPosition").update();
        }
        // Preserve the previous generic field's .055-cell inset; paint radius never enters this calculation.
        const inset = Math.max(0, narrowing) * cell,
            pad = cell * 0.055;
        aura.boundary
            .clear()
            .poly(
                projectedRectPoints(
                    Math.max(center.x - rx + pad, gs.getMinX() + inset),
                    Math.max(center.y - ry + pad, gs.getMinY() + inset),
                    Math.min(center.x + rx - pad, gs.getMaxX() - inset),
                    Math.min(center.y + ry - pad, gs.getMaxY() - inset),
                    gs,
                ),
            )
            .stroke({ color: 0x77bf85, width: 1.5, alpha: 0.28 });
        const board = projectedRectPoints(
            gs.getMinX() + inset,
            gs.getMinY() + inset,
            gs.getMaxX() - inset,
            gs.getMaxY() - inset,
            gs,
        );
        for (const mask of aura.masks) mask.clear().poly(board).fill(0xffffff);
        aura.layout = layout;
    }
    aura.seen = now;
    const time = 2.4 + Math.max(0, now - aura.started) / 1000;
    const opacity = Math.min(1, alpha / 0.5);
    aura.floor.visible = aura.back.visible = aura.front.visible = true;
    aura.floor.alpha = aura.back.alpha = aura.front.alpha = opacity;
    aura.ground.shader!.resources.sylvan.uniforms.uTime = time;
    aura.core.shader!.resources.sylvan.uniforms.uTime = time;
    for (const veil of aura.veils) veil.shader!.resources.sylvan.uniforms.uTime = time;
    const transform = target.getGlobalTransform();
    const sx = Math.hypot(transform.a, transform.b),
        sy = Math.hypot(transform.c, transform.d);
    const placement = { center, rx: rx * SYLVAN_ART_SCALE, ry: ry * SYLVAN_ART_SCALE, cell, gs, narrowing };
    for (let i = 0; i < 2; i++)
        updateSylvanStars(
            aura.stars[i],
            placement,
            time,
            i === 1,
            aura.scratch,
            aura.projected,
            sx / Math.max(0.001, sy),
            sx,
        );
}
