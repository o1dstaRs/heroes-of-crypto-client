import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Mesh, MeshGeometry, type Shader, type Texture } from "pixi.js";
import { arachnaWebProjection } from "./ArachnaQueenWebAura";
import { createAbominationSandShader } from "./AbominationSandShader";

import { createSandMotion, updateSandMotion, type SandMotion } from "./AbominationSandMotion";

type SandMesh = Mesh<MeshGeometry, Shader>;

export type AbominationSandForeground = { container: Container; depth: number };

type SandEffect = {
    meshes: SandMesh[];
    front?: SandMesh;
    createFront: () => SandMesh;
    started: number;
    seen: number;
    layout: string;
    motion: SandMotion;
};
const owners = new WeakMap<Container, Map<string, SandEffect>>();

function writePuff(
    target: Float32Array,
    puff: { x: number; y: number; born: number } | undefined,
    center: HoCMath.XY,
    width: number,
    height: number,
    now: number,
): void {
    target[0] = puff ? (2 * (puff.x - center.x)) / width : 0;
    target[1] = puff ? (2 * (center.y - puff.y)) / height : 0;
    target[2] = puff ? Math.max(0, (now - puff.born) / 1000) : 10;
    target[3] = puff ? 1 : 0;
}

/** Hide between inspections and release all GPU resources after an owner leaves. */
export function resetAbominationSandAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const effects = owners.get(container);
    if (!effects) return;
    for (const [key, effect] of effects) {
        for (const mesh of effect.meshes) if (!mesh.destroyed) mesh.visible = false;
        if (now - effect.seen > 5000) {
            for (const mesh of effect.meshes) if (!mesh.destroyed) mesh.destroy();
            effects.delete(key);
        }
    }
}

/** Ground dust and two turbulent spirals share geometry and a continuous clock with the foot veil. */
export function drawAbominationSandAura(
    container: Container | undefined,
    _texture: Texture | undefined,
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    gs: GridSettings,
    ownerId: string,
    alpha: number,
    narrowing = 0,
    now = performance.now(),
    foreground?: AbominationSandForeground,
): void {
    if (!container || !(alpha > 0) || !(range > 0)) return;
    let effects = owners.get(container);
    if (!effects) owners.set(container, (effects = new Map()));
    const key = `${ownerId}:${range}`;
    let effect = effects.get(key);
    // Duplicate buffs and selected/hovered/active previews share the same layers per owner.
    if (effect?.meshes[0].visible) return;
    const layout = `${center.x}:${center.y}:${footprint.width}:${footprint.height}:${narrowing}:${gs.getCellSize()}:${gs.getMinX()}:${gs.getMaxX()}:${gs.getMinY()}:${gs.getMaxY()}`;
    if (!effect || effect.layout !== layout) {
        const projection = arachnaWebProjection(center, footprint, range, gs, narrowing);
        if (!projection) return;
        if (!effect) {
            const geometry = new MeshGeometry(projection);
            let geometryUsers = 0;
            const makeMesh = (phase: number, baseLayer = false, frontLayer = false, airLayer = false) => {
                const shader = createAbominationSandShader(0, phase, baseLayer, frontLayer, airLayer);
                geometryUsers++;
                const mesh = new Mesh({ geometry, shader });
                mesh.eventMode = "none";
                mesh.visible = false;
                mesh.label = frontLayer
                    ? "abomination-sand-foot-veil"
                    : airLayer
                      ? "abomination-sand-raised-plumes"
                      : baseLayer
                        ? "abomination-engine-sand-base"
                        : phase === 0
                          ? "abomination-engine-sand"
                          : "abomination-engine-sand-half-turn";
                mesh.once("destroyed", () => {
                    shader.destroy();
                    if (--geometryUsers === 0) geometry.destroy(true);
                });
                if (!frontLayer) container.addChild(mesh);
                return mesh;
            };
            effect = {
                meshes: [makeMesh(0, true), makeMesh(0), makeMesh(Math.PI), makeMesh(0, false, false, true)],
                createFront: () => makeMesh(0, false, true),
                started: now,
                seen: now,
                layout,
                motion: createSandMotion(center, now),
            };
            // The floor owns the cross-container veil, including scene teardown.
            const ownedEffect = effect;
            effect.meshes[0].once("destroyed", () => {
                if (ownedEffect.front && !ownedEffect.front.destroyed) ownedEffect.front.destroy();
            });
            effects.set(key, effect);
        } else {
            const geometry = effect.meshes[0].geometry;
            geometry.positions.set(projection.positions);
            geometry.uvs.set(projection.uvs);
            geometry.getBuffer("aPosition").update();
            geometry.getBuffer("aUV").update();
            effect.layout = layout;
        }
    }
    if (foreground && !foreground.container.destroyed) {
        if (!effect.front || effect.front.destroyed) {
            effect.front = effect.createFront();
            effect.meshes = effect.meshes.filter((mesh) => !mesh.destroyed);
            effect.meshes.push(effect.front);
        }
        if (effect.front.parent !== foreground.container) foreground.container.addChild(effect.front);
        foreground.container.sortableChildren = true;
        effect.front.zIndex = foreground.depth;
    }
    updateSandMotion(effect.motion, center, now, gs.getCellSize());
    effect.seen = now;
    const age = Math.max(0, now - effect.started);
    const opacity = Math.min(1, Math.max(0.9, alpha)) * Math.min(1, age / 450);
    const width = (range * 2 + footprint.width) * gs.getCellSize();
    const height = (range * 2 + footprint.height) * gs.getCellSize();
    for (const mesh of effect.meshes) {
        if (mesh.destroyed) continue;
        mesh.visible = mesh !== effect.front || !!foreground;
        mesh.alpha = opacity;
        const storm = mesh.shader!.resources.storm;
        storm.uniforms.uTime = age / 1000;
        const motion = effect.motion;
        const speed = Math.hypot(motion.velocity.x, motion.velocity.y);
        const movement = storm.uniforms.uMotion as Float32Array;
        movement[0] = motion.velocity.x;
        movement[1] = -motion.velocity.y;
        movement[2] = Math.min(1, speed / 3);
        movement[3] = motion.distance;
        for (let i = 0; i < 6; i++) writePuff(storm.uniforms[`uWake${i}`], motion.wakes[i], center, width, height, now);
        writePuff(storm.uniforms.uStep, motion.step, center, width, height, now);
        storm.uniforms.uLift = gs.getCellSize() * (mesh === effect.front ? 0.12 : 0);
        storm.update();
    }
}
