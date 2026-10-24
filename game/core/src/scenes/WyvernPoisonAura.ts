import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Graphics, Mesh, MeshGeometry, type Shader } from "pixi.js";
import { arachnaWebBounds, arachnaWebProjection } from "./ArachnaQueenWebAura";
import { projectBattlefieldPoint, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";
import { createWyvernPoisonShader } from "./WyvernPoisonShader";

type Point = HoCMath.XY;
type Footprint = { width: number; height: number };
type PoisonMesh = Mesh<MeshGeometry, Shader>;
type Foreground = { container: Container; depth: number };
type Wake = { mesh: PoisonMesh; born: number };
type Aura = {
    floor: Container;
    back: Container;
    front: Container;
    ground: PoisonMesh;
    boundary: Graphics;
    masks: Graphics[];
    plumes: PoisonMesh[];
    wake: Wake[];
    nextWake: number;
    lastWake: Point;
    lastWakeTime: number;
    started: number;
    seen: number;
    layout: string;
};
const owners = new WeakMap<Container, Map<string, Aura>>();
const PLUMES = 12;
const VENTS = 4;
const WAKE_CAPACITY = 6;

/** Only the paint gets extra room. The range outline continues to use the real footprint. */
export function wyvernPoisonProjection(
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    narrowing = 0,
) {
    const padding = 1.22;
    const artworkFootprint = {
        width: (range * 2 + footprint.width) * padding - range * 2,
        height: (range * 2 + footprint.height) * padding - range * 2,
    };
    const projection = arachnaWebProjection(center, artworkFootprint, range, gs, narrowing);
    if (!projection) return undefined;
    // Keep UVs in factual-range coordinates so the ring stays in place while wisps escape its edge.
    for (let i = 0; i < projection.uvs.length; i++) projection.uvs[i] = (projection.uvs[i] - 0.5) * padding + 0.5;
    return projection;
}

function makeMesh(kind: "floor" | "air" | "trail", geometry: MeshGeometry, seed = 0): PoisonMesh {
    const shader = createWyvernPoisonShader(kind, seed);
    const mesh = new Mesh({ geometry, shader });
    mesh.label = `wyvern-poison-${kind}`;
    mesh.eventMode = "none";
    mesh.once("destroyed", () => {
        shader.destroy();
        geometry.destroy(true);
    });
    return mesh;
}

function quad(): MeshGeometry {
    return new MeshGeometry({
        positions: new Float32Array(8),
        uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
    });
}

/** Keep the twelve low plumes on the expanded outer poison band. */
export function wyvernPoisonPlumePositions(
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    i: number,
    facing: -1 | 1 = 1,
) {
    const cell = gs.getCellSize();
    const a = (i / PLUMES) * Math.PI * 2 + 0.24;
    const r = 0.86 + 0.26 * Math.sin(2 * a) ** 2 + 0.02 * Math.sin(i * 2);
    const vent = i >= PLUMES;
    const source = i - PLUMES;
    const base = projectBattlefieldPoint(
        vent
            ? {
                  x: center.x + facing * (0.16 + (source % 2) * 0.29) * cell,
                  y: center.y + (source < 2 ? 0.1 : -0.19) * cell,
              }
            : {
                  x: center.x + Math.cos(a) * (range + footprint.width / 2) * cell * r,
                  y: center.y + Math.sin(a) * (range + footprint.height / 2) * cell * r,
              },
        gs,
    );
    const span = cell * (vent ? 0.94 : 1.1),
        height = cell * (vent ? 0.6 : 0.27 * 2.2);
    return new Float32Array([
        base.x - span / 2,
        base.y,
        base.x + span / 2,
        base.y,
        base.x - span / 2,
        base.y + height,
        base.x + span / 2,
        base.y + height,
    ]);
}

function dispose(aura: Aura): void {
    for (const layer of [aura.floor, aura.back, aura.front]) {
        if (!layer.destroyed) layer.destroy({ children: true });
    }
}

export function resetWyvernPoisonAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const entries = owners.get(container);
    if (!entries) return;
    for (const [key, aura] of entries) {
        if (aura.floor.destroyed || aura.back.destroyed || aura.front.destroyed || now - aura.seen > 5000) {
            dispose(aura);
            entries.delete(key);
        } else {
            aura.floor.visible = aura.back.visible = aura.front.visible = false;
        }
    }
}

/** Selected Ouroboros artwork only. Reach, buffs, damage and movement stay in the engine. */
export function drawWyvernPoisonAura(
    container: Container | undefined,
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    ownerId: string,
    alpha: number,
    narrowing = 0,
    now = performance.now(),
    foreground?: Foreground,
    facing: -1 | 1 = 1,
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
    // Sidebar, hover and active-unit paths can refer to the same owner in one frame.
    if (aura?.floor.visible) return;
    if (!aura) {
        const floor = new Container({ label: "wyvern-ouroboros-floor" });
        const back = new Container({ label: "wyvern-ouroboros-back" });
        const front = new Container({ label: "wyvern-ouroboros-front" });
        floor.eventMode = back.eventMode = front.eventMode = "none";
        container.addChild(floor, back, front);
        const masks = [floor, back, front].map((layer) => {
            const mask = new Graphics();
            layer.addChild(mask);
            return mask;
        });
        const ground = makeMesh(
            "floor",
            new MeshGeometry(wyvernPoisonProjection(center, footprint, range, gs, narrowing)!),
        );
        ground.mask = masks[0];
        floor.addChild(ground);
        const boundary = new Graphics();
        boundary.label = "wyvern-gameplay-range";
        floor.addChild(boundary);
        const plumes = Array.from({ length: PLUMES + VENTS }, (_, i) => {
            const mesh = makeMesh("air", quad(), i * 3.71 + 4.3);
            const vent = i >= PLUMES;
            mesh.alpha = vent ? (i >= PLUMES + 2 ? 0.59 : 0.74) : 0.64;
            mesh.shader!.resources.poison.uniforms.uVent = vent ? 1 : 0;
            if (vent) mesh.label = "wyvern-poison-vent";
            const isFront = vent ? i >= PLUMES + 2 : Math.sin((i / PLUMES) * Math.PI * 2 + 0.24) < -0.24;
            mesh.mask = masks[isFront ? 2 : 1];
            (isFront ? front : back).addChild(mesh);
            return mesh;
        });
        const wake = Array.from({ length: WAKE_CAPACITY }, (_, i) => {
            const mesh = makeMesh("trail", quad(), i * 7.31);
            mesh.visible = false;
            mesh.mask = masks[0];
            floor.addChild(mesh);
            return { mesh, born: -Infinity };
        });
        aura = {
            floor,
            back,
            front,
            ground,
            boundary,
            masks,
            plumes,
            wake,
            nextWake: 0,
            lastWake: { ...center },
            lastWakeTime: now,
            started: now,
            seen: now,
            layout: "",
        };
        // The floor owns external depth-sorted layers too, including on scene replacement.
        floor.once("destroyed", () => {
            if (!back.destroyed) back.destroy({ children: true });
            if (!front.destroyed) front.destroy({ children: true });
        });
        entries.set(key, aura);
    }
    if (foreground && !foreground.container.destroyed) {
        if (aura.back.parent !== foreground.container) foreground.container.addChild(aura.back);
        if (aura.front.parent !== foreground.container) foreground.container.addChild(aura.front);
        foreground.container.sortableChildren = true;
        aura.back.zIndex = foreground.depth - 1.25;
        aura.front.zIndex = foreground.depth;
    } else {
        if (aura.back.parent !== container) container.addChild(aura.back);
        if (aura.front.parent !== container) container.addChild(aura.front);
    }
    const cell = gs.getCellSize();
    const layout = [
        center.x,
        center.y,
        footprint.width,
        footprint.height,
        range,
        cell,
        gs.getMinX(),
        gs.getMaxX(),
        gs.getMinY(),
        gs.getMaxY(),
        narrowing,
        facing,
    ].join(":");
    if (aura.layout !== layout) {
        const projection = wyvernPoisonProjection(center, footprint, range, gs, narrowing)!;
        aura.ground.geometry.positions.set(projection.positions);
        aura.ground.geometry.uvs.set(projection.uvs);
        aura.ground.geometry.getBuffer("aPosition").update();
        aura.ground.geometry.getBuffer("aUV").update();
        // Factual range is independent of shader radius, lighting, smoke and trails.
        aura.boundary
            .clear()
            .poly(projectedRectPoints(bounds.left, bounds.bottom, bounds.right, bounds.top, gs))
            .stroke({ color: 0x9da886, width: 1.5, alpha: 0.43 });
        const inset = Math.max(0, narrowing) * cell;
        const board = projectedRectPoints(
            gs.getMinX() + inset,
            gs.getMinY() + inset,
            gs.getMaxX() - inset,
            gs.getMaxY() - inset,
            gs,
        );
        // Only the board clips the paint. Poison now fills the entire footprint, including the feet.
        for (const mask of aura.masks) mask.clear().poly(board).fill(0xffffff);
        const source = aura.ground.shader!.resources.poison.uniforms.uSource as Float32Array;
        source[0] = (facing * 0.3) / (range + footprint.width / 2);
        source[1] = -0.05 / (range + footprint.height / 2);
        source[2] = 1 / (range + footprint.width / 2);
        source[3] = 1 / (range + footprint.height / 2);
        for (let i = 0; i < PLUMES + VENTS; i++) {
            const geometry = aura.plumes[i].geometry;
            geometry.positions.set(wyvernPoisonPlumePositions(center, footprint, range, gs, i, facing));
            geometry.getBuffer("aPosition").update();
        }
        aura.layout = layout;
    }
    const distance = Math.hypot(center.x - aura.lastWake.x, center.y - aura.lastWake.y);
    // Emit bounded residual vapour only for continuous travel, never teleports or re-selection.
    if (now - aura.seen > 200 || distance > cell * 2) {
        for (const puff of aura.wake) puff.born = -Infinity;
        aura.lastWake.x = center.x;
        aura.lastWake.y = center.y;
    } else if (distance > cell * 0.18 && now - aura.lastWakeTime >= 90) {
        const puff = aura.wake[aura.nextWake];
        aura.nextWake = (aura.nextWake + 1) % WAKE_CAPACITY;
        const p = aura.lastWake,
            half = cell * 0.7;
        const corners = [
            { x: p.x - half, y: p.y - half },
            { x: p.x + half, y: p.y - half },
            { x: p.x - half, y: p.y + half },
            { x: p.x + half, y: p.y + half },
        ].map((point) => projectBattlefieldPoint(point, gs));
        puff.mesh.geometry.positions.set(corners.flatMap((point) => [point.x, point.y]));
        puff.mesh.geometry.getBuffer("aPosition").update();
        puff.born = now;
        aura.lastWake.x = center.x;
        aura.lastWake.y = center.y;
        aura.lastWakeTime = now;
    }
    aura.seen = now;
    // Start at the chosen reference phase; selection strength must not wash out the approved artwork.
    const time = 6.4 + Math.max(0, now - aura.started) / 1000;
    const opacity = Math.min(1, alpha / 0.5);
    aura.floor.visible = aura.back.visible = aura.front.visible = true;
    aura.floor.alpha = aura.back.alpha = aura.front.alpha = opacity;
    aura.ground.shader!.resources.poison.uniforms.uTime = time;
    for (const mesh of aura.plumes) mesh.shader!.resources.poison.uniforms.uTime = time;
    for (const puff of aura.wake) {
        const age = (now - puff.born) / 1000;
        puff.mesh.visible = age >= 0 && age < 1.8;
        if (puff.mesh.visible) puff.mesh.shader!.resources.poison.uniforms.uTime = age;
    }
}
