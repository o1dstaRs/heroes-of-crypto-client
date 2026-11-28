import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Graphics, Mesh, MeshGeometry, type Texture, type Shader } from "pixi.js";
import { projectBattlefieldPoint, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";
import { createGriffinTornadoShader } from "./GriffinTornadoShader";
import { createGriffinTornadoDustShader } from "./GriffinTornadoDustShader";

export const GRIFFIN_TORNADO_DEBRIS_KEY = "vfx_griffin_tornado_silver_v2";
export const GRIFFIN_TORNADO_VISUAL_SCALE = 1.1025;
export const GRIFFIN_TORNADO_EYE_SCALE = 0.8;
export type GriffinTornadoForeground = { container: Container; depth: number };
export const GRIFFIN_TORNADO_ART = {
    segments: 40,
    rows: 20,
    widthScale: GRIFFIN_TORNADO_VISUAL_SCALE,
    heightScale: 1,
    eyeScale: GRIFFIN_TORNADO_EYE_SCALE,
    eyeInset: 0.22,
    verticalOffset: 0,
    innerLiftLimit: 0.6,
    outerLiftLimit: 0.8,
    playbackRate: 0.8,
    fadeMilliseconds: 600,
    cacheMilliseconds: 5000,
    minimumOpacity: 0.85,
};
const { segments: SEGMENTS, rows: ROWS } = GRIFFIN_TORNADO_ART;
const TAU = Math.PI * 2;
type Footprint = { width: number; height: number };

export function griffinTornadoShape(footprint: Footprint, range: number, cell: number, facing: -1 | 1 = 1) {
    // A tighter painted eye hugs the figure; artwork never changes gameplay reach.
    const extentX = (range + footprint.width / 2) * cell;
    const extentY = (range + footprint.height / 2) * cell;
    const eyeInset = GRIFFIN_TORNADO_ART.eyeInset * cell;
    return {
        rx: extentX * GRIFFIN_TORNADO_VISUAL_SCALE,
        // Stop the outer coils at the covered rows on both sides of the footprint.
        ry: extentY * GRIFFIN_TORNADO_ART.heightScale,
        offsetY: GRIFFIN_TORNADO_ART.verticalOffset * cell,
        // The tighter edge follows the front legs in board space, including on a mirrored board.
        innerOffsetX: -eyeInset * facing,
        innerX: (footprint.width / 2) * cell * Math.SQRT2 * GRIFFIN_TORNADO_EYE_SCALE - eyeInset,
        innerY: (footprint.height / 2) * cell * Math.SQRT2 * GRIFFIN_TORNADO_EYE_SCALE,
    };
}

/** Continuous elliptical coils rise into a shallow funnel inside the artwork bounds. */
export function griffinTornadoPoint(
    center: HoCMath.XY,
    shape: ReturnType<typeof griffinTornadoShape>,
    angle: number,
    progress: number,
): HoCMath.XY {
    const c = Math.cos(angle),
        s = Math.sin(angle);
    const t = Math.max(0, Math.min(1, progress));
    const rx = shape.innerX + (shape.rx - shape.innerX) * t;
    const ry = shape.innerY + (shape.ry - shape.innerY) * t;
    // Raise the middle coils, keeping both the clear eye and outer range intact.
    const lift = Math.min(
        (shape.innerY / GRIFFIN_TORNADO_EYE_SCALE) * Math.sin(Math.PI * t),
        (ry - shape.innerY) * GRIFFIN_TORNADO_ART.innerLiftLimit,
        (shape.ry - ry) * GRIFFIN_TORNADO_ART.outerLiftLimit,
    );
    return {
        x: center.x + c * rx + shape.innerOffsetX * (1 - t),
        y: center.y + s * ry + lift + shape.offsetY * t,
    };
}

/** Artwork clipping only. An explicit visual scale never feeds the gameplay-range outline. */
export function griffinTornadoBounds(
    center: HoCMath.XY,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    narrowing = 0,
    visualScale = 1,
    verticalScale = visualScale,
) {
    const cell = gs.getCellSize();
    const inset = Math.max(0, narrowing) * cell;
    const x = (range + footprint.width / 2) * cell * visualScale;
    const y = (range + footprint.height / 2) * cell * verticalScale;
    return [
        Math.max(center.x - x, gs.getMinX() + inset),
        Math.max(center.y - y, gs.getMinY() + inset),
        Math.min(center.x + x, gs.getMaxX() - inset),
        Math.min(center.y + y, gs.getMaxY() - inset),
    ];
}

/** Both depth-sorted halves share one continuous raised elliptical surface. */
export function griffinTornadoGeometry(
    center: HoCMath.XY,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    front: boolean,
    facing: -1 | 1 = 1,
) {
    const shape = griffinTornadoShape(footprint, range, gs.getCellSize(), facing);
    const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
    for (let row = 0; row <= ROWS; row++) {
        const h = row / ROWS;
        for (let col = 0; col <= SEGMENTS; col++) {
            const angle = (front ? Math.PI : 0) + (col / SEGMENTS) * Math.PI;
            const point = projectBattlefieldPoint(griffinTornadoPoint(center, shape, angle, h), gs);
            positions.push(point.x, point.y);
            uvs.push(angle / TAU, h);
            if (row < ROWS && col < SEGMENTS) {
                const a = row * (SEGMENTS + 1) + col,
                    b = a + SEGMENTS + 1;
                indices.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
    }
    return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

type Storm = {
    back: Container;
    front: Container;
    shells: Mesh<MeshGeometry, Shader>[];
    masks: [Graphics, Graphics];
    started: number;
    seen: number;
    layout: string;
};
const owners = new WeakMap<Container, Map<string, Storm>>();

function dispose(storm: Storm) {
    if (!storm.front.destroyed) storm.front.destroy({ children: true });
    if (!storm.back.destroyed) storm.back.destroy({ children: true });
}

export function resetGriffinTornadoAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const storms = owners.get(container);
    if (!storms) return;
    for (const [key, storm] of storms) {
        if (storm.back.destroyed || storm.front.destroyed || now - storm.seen > GRIFFIN_TORNADO_ART.cacheMilliseconds) {
            dispose(storm);
            storms.delete(key);
        } else {
            storm.back.visible = false;
            storm.front.visible = false;
        }
    }
}

export function drawGriffinTornadoAura(
    container: Container | undefined,
    _texture: Texture | undefined,
    center: HoCMath.XY,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    ownerId: string,
    alpha: number,
    narrowing = 0,
    now = performance.now(),
    foreground?: GriffinTornadoForeground,
    facing: -1 | 1 = 1,
): void {
    if (!container || !(range > 0) || !(alpha > 0)) return;
    let entries = owners.get(container);
    if (!entries) owners.set(container, (entries = new Map()));
    const key = ownerId + ":" + range;
    let storm = entries.get(key);
    if (storm?.back.destroyed || storm?.front.destroyed) {
        dispose(storm);
        entries.delete(key);
        storm = undefined;
    }
    if (storm?.back.visible) return;
    if (!storm) {
        const back = new Container(),
            front = new Container();
        back.label = "griffin-tornado-back";
        front.label = "griffin-tornado-front";
        back.eventMode = front.eventMode = "none";
        container.addChild(back, front);
        const masks = [back, front].map((layer) => {
            const mask = new Graphics();
            mask.label = "griffin-tornado-range-clip";
            layer.addChild(mask);
            return mask;
        }) as [Graphics, Graphics];
        const makeShell = (isFront: boolean, detail = false) => {
            const geometry = new MeshGeometry(griffinTornadoGeometry(center, footprint, range, gs, isFront, facing));
            const shader = detail ? createGriffinTornadoDustShader() : createGriffinTornadoShader();
            const mesh = new Mesh({ geometry, shader });
            mesh.label = detail ? "griffin-tornado-dust" : "griffin-tornado-wind";
            // Both wind and powder respect the clear oval eye and artwork bounds.
            mesh.mask = masks[isFront ? 1 : 0];
            mesh.eventMode = "none";
            mesh.once("destroyed", () => {
                shader.destroy();
                geometry.destroy(true);
            });
            (isFront ? front : back).addChild(mesh);
            return mesh;
        };
        storm = {
            back,
            front,
            shells: [makeShell(false), makeShell(true), makeShell(false, true), makeShell(true, true)],
            masks,
            started: now,
            seen: now,
            layout: "",
        };
        // The owning floor disposes the front half even though it lives among depth-sorted units.
        back.once("destroyed", () => {
            if (!front.destroyed) front.destroy({ children: true });
        });
        entries.set(key, storm);
    }
    if (foreground && !foreground.container.destroyed) {
        if (storm.front.parent !== foreground.container) foreground.container.addChild(storm.front);
        foreground.container.sortableChildren = true;
        storm.front.zIndex = foreground.depth;
    } else if (storm.front.parent !== container) {
        container.addChild(storm.front);
    }
    const cell = gs.getCellSize(),
        shape = griffinTornadoShape(footprint, range, cell, facing);
    const bounds = griffinTornadoBounds(
        { x: center.x, y: center.y + shape.offsetY },
        footprint,
        range,
        gs,
        narrowing,
        GRIFFIN_TORNADO_VISUAL_SCALE,
        GRIFFIN_TORNADO_ART.heightScale,
    );
    const layout = [center.x, center.y, footprint.width, footprint.height, range, cell, facing, ...bounds].join(":");
    const age = Math.max(0, now - storm.started);
    const time = (age / 1000) * GRIFFIN_TORNADO_ART.playbackRate;
    const opacity =
        Math.min(1, Math.max(GRIFFIN_TORNADO_ART.minimumOpacity, alpha)) *
        Math.min(1, age / GRIFFIN_TORNADO_ART.fadeMilliseconds);
    storm.back.visible = storm.front.visible = true;
    storm.back.alpha = storm.front.alpha = opacity;
    storm.seen = now;
    if (storm.layout !== layout) {
        const points = projectedRectPoints(bounds[0], bounds[1], bounds[2], bounds[3], gs);
        const eye: number[] = [];
        for (let i = 0; i < SEGMENTS * 2; i++) {
            const p = projectBattlefieldPoint(griffinTornadoPoint(center, shape, (i / (SEGMENTS * 2)) * TAU, 0), gs);
            eye.push(p.x, p.y);
        }
        for (const mask of storm.masks) {
            mask.clear().poly(points).fill(0xffffff);
            mask.poly(eye).cut();
        }
    }
    storm.shells.forEach((mesh, i) => {
        if (storm!.layout !== layout) {
            mesh.geometry.positions.set(
                griffinTornadoGeometry(center, footprint, range, gs, i % 2 === 1, facing).positions,
            );
            mesh.geometry.getBuffer("aPosition").update();
        }
        const uniforms = mesh.shader!.resources.storm;
        uniforms.uniforms.uTime = time;
        uniforms.update();
    });
    storm.layout = layout;
}
