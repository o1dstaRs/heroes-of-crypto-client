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
const PLUMES = 8;
const VENTS = 4;
const WAKE_CAPACITY = 6;

function plumeArt(index: number) {
    const angle = (index / PLUMES) * Math.PI * 2 + 0.24;
    const radius = 0.68 + 0.13 * Math.sin(index * 2.3);
    const vent = index >= PLUMES;
    const source = index - PLUMES;
    return {
        vent,
        front: vent ? source >= 2 : Math.sin(angle) < -0.24,
        x: vent ? 0.16 + (source % 2) * 0.29 : Math.cos(angle) * radius,
        y: vent ? (source < 2 ? 0.1 : -0.19) : Math.sin(angle) * radius,
        width: (vent ? 1.1 : 1.42) * (1 + 0.16 * Math.sin(index * 2.7)),
        height: (vent ? 0.48 : 0.39) * (1 + 0.15 * Math.cos(index * 1.8)),
        opacity: vent ? 0.48 : 0.53,
        seed: index * 3.71 + 4.3,
    };
}

export const WYVERN_POISON_ART = {
    plumes: Array.from({ length: PLUMES + VENTS }, (_, i) => plumeArt(i)),
    padding: 1.22,
    initialTime: 6.4,
    fullOpacity: 0.5,
    sourceX: 0.3,
    sourceY: -0.05,
    cacheMilliseconds: 5000,
    wake: {
        capacity: WAKE_CAPACITY,
        duration: 1.8,
        halfSize: 0.7,
        seedStep: 7.31,
        maxGapMilliseconds: 200,
        minIntervalMilliseconds: 90,
        minDistance: 0.18,
        teleportDistance: 2,
    },
};

/** Give the mist room to feather out past its footprint. */
export function wyvernPoisonProjection(
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    narrowing = 0,
) {
    const padding = WYVERN_POISON_ART.padding;
    const artworkFootprint = {
        width: (range * 2 + footprint.width) * padding - range * 2,
        height: (range * 2 + footprint.height) * padding - range * 2,
    };
    const projection = arachnaWebProjection(center, artworkFootprint, range, gs, narrowing);
    if (!projection) return undefined;
    // Keep UVs centered on the aura even when the board crops the mist.
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

/** Scatter low wisps across the aura, with a denser patch at Wyvern's feet. */
export function wyvernPoisonPlumePositions(
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    i: number,
    facing: -1 | 1 = 1,
) {
    const cell = gs.getCellSize();
    const art = WYVERN_POISON_ART.plumes[i] ?? plumeArt(i);
    const base = projectBattlefieldPoint(
        {
            x: center.x + art.x * cell * (art.vent ? facing : range + footprint.width / 2),
            y: center.y + art.y * cell * (art.vent ? 1 : range + footprint.height / 2),
        },
        gs,
    );
    const span = cell * art.width;
    const height = cell * art.height;
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
        if (
            aura.floor.destroyed ||
            aura.back.destroyed ||
            aura.front.destroyed ||
            now - aura.seen > WYVERN_POISON_ART.cacheMilliseconds
        ) {
            dispose(aura);
            entries.delete(key);
        } else {
            aura.floor.visible = aura.back.visible = aura.front.visible = false;
        }
    }
}

/** Draw Wyvern's poison mist when its aura is shown. */
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
    if (!arachnaWebBounds(center, footprint, range, gs, narrowing)) return;
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
        const plumes = WYVERN_POISON_ART.plumes.map((art) => {
            const mesh = makeMesh("air", quad(), art.seed);
            mesh.alpha = art.opacity;
            mesh.shader!.resources.poison.uniforms.uVent = art.vent ? 1 : 0;
            if (art.vent) mesh.label = "wyvern-poison-vent";
            mesh.mask = masks[art.front ? 2 : 1];
            (art.front ? front : back).addChild(mesh);
            return mesh;
        });
        const wake = Array.from({ length: WAKE_CAPACITY }, (_, i) => {
            const mesh = makeMesh("trail", quad(), i * WYVERN_POISON_ART.wake.seedStep);
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
        const inset = Math.max(0, narrowing) * cell;
        const board = projectedRectPoints(
            gs.getMinX() + inset,
            gs.getMinY() + inset,
            gs.getMaxX() - inset,
            gs.getMaxY() - inset,
            gs,
        );
        for (const mask of aura.masks) mask.clear().poly(board).fill(0xffffff);
        const source = aura.ground.shader!.resources.poison.uniforms.uSource as Float32Array;
        source[0] = (facing * WYVERN_POISON_ART.sourceX) / (range + footprint.width / 2);
        source[1] = WYVERN_POISON_ART.sourceY / (range + footprint.height / 2);
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
    const wake = WYVERN_POISON_ART.wake;
    // Emit bounded residual vapour only for continuous travel, never teleports or re-selection.
    if (now - aura.seen > wake.maxGapMilliseconds || distance > cell * wake.teleportDistance) {
        for (const puff of aura.wake) puff.born = -Infinity;
        aura.lastWake.x = center.x;
        aura.lastWake.y = center.y;
    } else if (distance > cell * wake.minDistance && now - aura.lastWakeTime >= wake.minIntervalMilliseconds) {
        const puff = aura.wake[aura.nextWake];
        aura.nextWake = (aura.nextWake + 1) % WAKE_CAPACITY;
        const p = aura.lastWake,
            half = cell * wake.halfSize;
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
    const time = WYVERN_POISON_ART.initialTime + Math.max(0, now - aura.started) / 1000;
    const opacity = Math.min(1, alpha / WYVERN_POISON_ART.fullOpacity);
    aura.floor.visible = aura.back.visible = aura.front.visible = true;
    aura.floor.alpha = aura.back.alpha = aura.front.alpha = opacity;
    aura.ground.shader!.resources.poison.uniforms.uTime = time;
    for (const mesh of aura.plumes) mesh.shader!.resources.poison.uniforms.uTime = time;
    for (const puff of aura.wake) {
        const age = (now - puff.born) / 1000;
        puff.mesh.visible = age >= 0 && age < wake.duration;
        if (puff.mesh.visible) puff.mesh.shader!.resources.poison.uniforms.uTime = age;
    }
}
