import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Graphics, Mesh, MeshGeometry, Texture, type Shader } from "pixi.js";
import { projectBattlefieldPoint, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";
import { createPegasusWindShader, createPegasusFeatherShader } from "./PegasusFloorAuraShader";
import { createPegasusPowerCore, pegasusCoreProjection } from "./PegasusPowerCore";
import {
    griffinTornadoShape,
    griffinTornadoBounds,
    GRIFFIN_TORNADO_VISUAL_SCALE,
    GRIFFIN_TORNADO_VERTICAL_SCALE,
} from "./GriffinTornadoAura";

// Four detailed feather cutouts; all movement and gold lighting remain engine-driven.
export const PEGASUS_WINGED_SWORD_AURA_KEY = "vfx_pegasus_feather_atlas_v7";
const SEGMENTS = 40;
const ROWS = 20;
const TAU = Math.PI * 2;
type Footprint = { width: number; height: number };

// Compress only painted depth: preserve the upper edge and lift the lower edge to the red mark.
export const PEGASUS_ART_DEPTH_SCALE = 0.86;
export function pegasusAuraShape(footprint: Footprint, range: number, cell: number, facing: -1 | 1 = 1) {
    const base = griffinTornadoShape(footprint, range, cell, facing);
    return {
        ...base,
        ry: base.ry * PEGASUS_ART_DEPTH_SCALE,
        offsetY: base.offsetY + base.ry * (1 - PEGASUS_ART_DEPTH_SCALE),
    };
}

/** Every intermediate point stays on the floor. */
export function pegasusFloorPoint(
    center: HoCMath.XY,
    shape: ReturnType<typeof griffinTornadoShape>,
    angle: number,
    progress: number,
): HoCMath.XY {
    const t = Math.max(0, Math.min(1, progress));
    // Round out the diagonal shoulders without extending the cardinal bounds or the clear eye.
    const shoulder = 1 + 0.09 * Math.sin(angle * 2) ** 2;
    return {
        x:
            center.x +
            Math.cos(angle) * (shape.innerX + (shape.rx * shoulder - shape.innerX) * t) +
            shape.innerOffsetX * (1 - t),
        y: center.y + Math.sin(angle) * (shape.innerY + (shape.ry * shoulder - shape.innerY) * t) + shape.offsetY * t,
    };
}

export function pegasusFloorGeometry(
    center: HoCMath.XY,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    front: boolean,
    facing: -1 | 1 = 1,
) {
    const shape = pegasusAuraShape(footprint, range, gs.getCellSize(), facing);
    const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
    for (let row = 0; row <= ROWS; row++) {
        const h = row / ROWS;
        for (let col = 0; col <= SEGMENTS; col++) {
            const angle = (front ? Math.PI : 0) + (col / SEGMENTS) * Math.PI;
            const point = projectBattlefieldPoint(pegasusFloorPoint(center, shape, angle, h), gs);
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
    core?: Mesh<MeshGeometry, Shader>;
    stars: Graphics[];
    started: number;
    seen: number;
    layout: string;
};
const owners = new WeakMap<Container, Map<string, Storm>>();

function dispose(storm: Storm) {
    if (!storm.front.destroyed) storm.front.destroy({ children: true });
    if (!storm.back.destroyed) storm.back.destroy({ children: true });
}

export function resetPegasusWingedSwordAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const storms = owners.get(container);
    if (!storms) return;
    for (const [key, storm] of storms) {
        if (
            storm.back.destroyed ||
            storm.front.destroyed ||
            storm.core?.destroyed ||
            storm.shells.some((mesh) => mesh.destroyed) ||
            now - storm.seen > 5000
        ) {
            dispose(storm);
            storms.delete(key);
        } else {
            storm.back.visible = false;
            storm.front.visible = false;
        }
    }
}

export function drawPegasusWingedSwordAura(
    container: Container | undefined,
    texture: Texture | undefined,
    center: HoCMath.XY,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    ownerId: string,
    alpha: number,
    narrowing = 0,
    now = performance.now(),
    facing: -1 | 1 = 1,
): void {
    if (!container || container.destroyed || !(range > 0) || !(alpha > 0)) return;
    let entries = owners.get(container);
    if (!entries) owners.set(container, (entries = new Map()));
    const key = ownerId + ":" + range;
    let storm = entries.get(key);
    if (
        storm &&
        (storm.back.destroyed ||
            storm.front.destroyed ||
            storm.core?.destroyed ||
            storm.shells.some((mesh) => mesh.destroyed))
    ) {
        dispose(storm);
        entries.delete(key);
        storm = undefined;
    }
    if (storm?.back.visible) return;
    if (!storm) {
        const back = new Container(),
            front = new Container();
        back.label = "pegasus-floor-far";
        front.label = "pegasus-floor-near";
        back.eventMode = front.eventMode = "none";
        container.addChild(back, front);
        const masks = [back, front].map((layer) => {
            const mask = new Graphics();
            mask.label = "pegasus-feather-storm-range-clip";
            layer.addChild(mask);
            return mask;
        }) as [Graphics, Graphics];
        const makeShell = (isFront: boolean, detail = false) => {
            const geometry = new MeshGeometry(pegasusFloorGeometry(center, footprint, range, gs, isFront, facing));
            const shader = detail ? createPegasusFeatherShader(texture) : createPegasusWindShader();
            const mesh = new Mesh({ geometry, shader });
            mesh.label = detail ? "pegasus-feather-storm-dust" : "pegasus-feather-storm-wind";
            // Light adds energy to the stone; feather artwork keeps normal coverage blending.
            if (!detail) mesh.blendMode = "add";
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
            stars: Array.from({ length: 10 }, (_, i) => {
                const star = new Graphics();
                star.label = "pegasus-golden-star-" + i;
                star.eventMode = "none";
                // Immutable geometry: broad warm halo, long four-point rays, white-hot core.
                star.circle(0, 0, 2.5).fill({ color: 0xffa323, alpha: 0.025 });
                star.circle(0, 0, 1.6).fill({ color: 0xffbd54, alpha: 0.07 });
                star.poly([0, -1.4, 0.16, -0.16, 1.4, 0, 0.16, 0.16, 0, 1.4, -0.16, 0.16, -1.4, 0, -0.16, -0.16]).fill({
                    color: 0xffca73,
                    alpha: 0.85,
                });
                star.poly([0, -0.8, 0.12, -0.12, 0.8, 0, 0.12, 0.12, 0, 0.8, -0.12, 0.12, -0.8, 0, -0.12, -0.12]).fill(
                    0xfff2cf,
                );
                star.circle(0, 0, 0.28).fill(0xfff5d9);
                front.addChild(star);
                return star;
            }),
            started: now,
            seen: now,
            layout: "",
        };
        // Both halves remain in the terrain effect container, below all creature sprites.
        back.once("destroyed", () => {
            if (!front.destroyed) front.destroy({ children: true });
        });
        entries.set(key, storm);
    }
    const cell = gs.getCellSize(),
        shape = pegasusAuraShape(footprint, range, cell, facing);
    const bounds = griffinTornadoBounds(
        { x: center.x, y: center.y + shape.offsetY },
        footprint,
        range,
        gs,
        narrowing,
        GRIFFIN_TORNADO_VISUAL_SCALE,
        GRIFFIN_TORNADO_VERTICAL_SCALE * PEGASUS_ART_DEPTH_SCALE,
    );
    const layout = [center.x, center.y, footprint.width, footprint.height, range, cell, facing, ...bounds].join(":");
    const age = Math.max(0, now - storm.started);
    const opacity = 0.62 * Math.min(1, age / 600);
    storm.back.visible = storm.front.visible = true;
    storm.back.alpha = storm.front.alpha = opacity;
    storm.seen = now;
    if (storm.layout !== layout) {
        const points = projectedRectPoints(bounds[0], bounds[1], bounds[2], bounds[3], gs);
        const eye: number[] = [];
        for (let i = 0; i < SEGMENTS * 2; i++) {
            const p = projectBattlefieldPoint(pegasusFloorPoint(center, shape, (i / (SEGMENTS * 2)) * TAU, 0), gs);
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
                pegasusFloorGeometry(center, footprint, range, gs, i % 2 === 1, facing).positions,
            );
            mesh.geometry.getBuffer("aPosition").update();
        }
        if (i >= 2 && texture && texture !== Texture.EMPTY) {
            mesh.shader!.resources.uFeathers = texture.source;
            mesh.shader!.resources.uFeathersSampler = texture.source.style;
            mesh.shader!.resources.aura.uniforms.uReady = 1;
            mesh.shader!.resources.aura.uniforms.uStraightAlpha =
                texture.source.alphaMode === "no-premultiply-alpha" ? 1 : 0;
        }
        const uniforms = mesh.shader!.resources.aura;
        uniforms.uniforms.uTime = age / 1000;
        uniforms.update();
    });
    if (!storm.core || storm.layout !== layout) {
        const projection = pegasusCoreProjection(center, gs, narrowing);
        if (projection) {
            if (!storm.core) {
                storm.core = createPegasusPowerCore(projection);
                storm.back.addChild(storm.core);
            } else {
                storm.core.geometry.positions = projection.positions;
                storm.core.geometry.uvs = projection.uvs;
                storm.core.geometry.indices = projection.indices;
            }
            storm.core.visible = true;
        } else if (storm.core) storm.core.visible = false;
    }
    if (storm.core) {
        const uniforms = storm.core.shader!.resources.aura;
        uniforms.uniforms.uTime = age / 1000;
        uniforms.update();
    }
    storm.stars.forEach((star, i) => {
        const phase = i * 2.3999632297;
        const progress = 0.22 + 0.6 * ((i * 0.61803398875) % 1);
        const world = pegasusFloorPoint(center, shape, phase - age * 0.00013, progress);
        const point = projectBattlefieldPoint(world, gs);
        star.position.set(point.x, point.y);
        const pulse = 0.5 + 0.5 * Math.sin(age * 0.0015 + phase);
        const size = cell * (0.085 + 0.04 * pulse);
        star.scale.set(size, size * 0.72);
        star.alpha = 0.3 + 0.7 * pulse ** 3;
        star.visible = world.x >= bounds[0] && world.x <= bounds[2] && world.y >= bounds[1] && world.y <= bounds[3];
    });
    storm.layout = layout;
}
