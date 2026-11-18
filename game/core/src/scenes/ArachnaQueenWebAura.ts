import { arachnaDewLoads, createArachnaDewGeometry, createArachnaDewShader, updateArachnaDew } from "./ArachnaWebDew";
import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import {
    BufferImageSource,
    Container,
    Mesh,
    type Geometry,
    type Shader,
    type MeshGeometry,
    type Texture,
} from "pixi.js";
import { ArachnaContactField, CONTACT_FIELD_SIZE } from "./ArachnaWebContacts";
import {
    createArachnaSilkGeometry,
    createArachnaSpiderGeometry,
    updateArachnaSpiders,
    updateArachnaSpiderRig,
    arachnaSilkContacts,
    type WebPlacement,
} from "./ArachnaWebGeometry";
import { createArachnaWebSpiderShader } from "./ArachnaWebSpiderShader";
import { webFireLights } from "./ArachnaWebLighting";
import { createArachnaWebSilkShader } from "./ArachnaWebSilkShader";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

type Point = HoCMath.XY;
type Footprint = { width: number; height: number };
export type WebBounds = { left: number; right: number; bottom: number; top: number };
/** Same footprint-distance contract as the engine's square aura, clipped to playable cells. */
export function arachnaWebBounds(
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    narrowing = 0,
): WebBounds | undefined {
    if (!(range > 0)) return undefined;
    const cell = gs.getCellSize();
    const inset = Math.max(0, narrowing) * cell;
    const bounds = {
        left: Math.max(center.x - (range + footprint.width / 2) * cell, gs.getMinX() + inset),
        right: Math.min(center.x + (range + footprint.width / 2) * cell, gs.getMaxX() - inset),
        bottom: Math.max(center.y - (range + footprint.height / 2) * cell, gs.getMinY() + inset),
        top: Math.min(center.y + (range + footprint.height / 2) * cell, gs.getMaxY() - inset),
    };
    return bounds.right > bounds.left && bounds.top > bounds.bottom ? bounds : undefined;
}
export const ARACHNA_WEB_ATLAS_KEY = "vfx_arachna_web_aura_atlas";
const SUBDIVISIONS = 16;

/** Crop artwork at board edges instead of squeezing its centre away from the queen. */
export function arachnaWebProjection(
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    narrowing = 0,
) {
    const bounds = arachnaWebBounds(center, footprint, range, gs, narrowing);
    if (!bounds) return undefined;
    const width = (range * 2 + footprint.width) * gs.getCellSize();
    const height = (range * 2 + footprint.height) * gs.getCellSize();
    const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
    for (let row = 0; row <= SUBDIVISIONS; row++) {
        for (let col = 0; col <= SUBDIVISIONS; col++) {
            const x = bounds.left + ((bounds.right - bounds.left) * col) / SUBDIVISIONS;
            const y = bounds.top - ((bounds.top - bounds.bottom) * row) / SUBDIVISIONS;
            const point = projectBattlefieldPoint({ x, y }, gs);
            positions.push(point.x, point.y);
            uvs.push((x - center.x) / width + 0.5, (center.y - y) / height + 0.5);
            if (row < SUBDIVISIONS && col < SUBDIVISIONS) {
                const a = row * (SUBDIVISIONS + 1) + col,
                    b = a + SUBDIVISIONS + 1;
                indices.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
    }
    return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

type WebSprite = {
    contacts: ArachnaContactField;
    contactTexture: BufferImageSource;
    mesh: Mesh<Geometry, Shader>;
    shadow: Mesh<Geometry, Shader>;
    spiders: Mesh<MeshGeometry, Shader>;
    dew: Mesh<Geometry, Shader>;
    started: number;
    seen: number;
    projectionKey: string;
    hiddenAt?: number;
    resetAt?: number;
};
const owners = new WeakMap<Container, Map<string, WebSprite>>();
export function resetArachnaQueenWebAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const sprites = owners.get(container);
    if (!sprites) return;
    for (const [id, sprite] of sprites) {
        // Record an actual hidden render, rather than mistaking a slow frame for
        // a new inspection and continually restarting the reveal animation.
        if (!sprite.mesh.visible) sprite.hiddenAt ??= sprite.seen;
        sprite.resetAt = now;
        sprite.mesh.visible = sprite.shadow.visible = sprite.spiders.visible = sprite.dew.visible = false;
        if (now - sprite.seen > 5000) {
            sprite.shadow.destroy();
            sprite.mesh.destroy();
            sprite.spiders.destroy();
            sprite.dew.destroy();
            sprites.delete(id);
        }
    }
}

/** Source-matched silk geometry and eight articulated spiders, rendered by the engine. */
export function drawArachnaQueenWebAura(
    container: Container | undefined,
    _legacyTexture: Texture | undefined,
    center: Point,
    footprint: Footprint,
    range: number,
    gs: GridSettings,
    ownerId: string,
    alpha: number,
    narrowing = 0,
    now = performance.now(),
): void {
    if (!container || !(range > 0) || !(alpha > 0)) return;
    const bounds = arachnaWebBounds(center, footprint, range, gs, narrowing);
    if (!bounds) return;
    let sprites = owners.get(container);
    if (!sprites) owners.set(container, (sprites = new Map()));
    const placement: WebPlacement = {
        center,
        width: (range * 2 + footprint.width) * gs.getCellSize(),
        height: (range * 2 + footprint.height) * gs.getCellSize(),
        gs,
    };
    const projectionKey = [
        center.x,
        center.y,
        placement.width,
        placement.height,
        gs.getMinX(),
        gs.getMinY(),
        gs.getMaxX(),
        gs.getMaxY(),
    ].join(":");
    let sprite = sprites.get(ownerId);
    if (!sprite) {
        const contacts = new ArachnaContactField();
        contacts.update([]);
        const contactTexture = new BufferImageSource({
            resource: contacts.pixels,
            width: CONTACT_FIELD_SIZE,
            height: CONTACT_FIELD_SIZE,
            format: "rgba8unorm",
            scaleMode: "linear",
            alphaMode: "no-premultiply-alpha",
            autoGenerateMipmaps: false,
        });
        const geometry = createArachnaSilkGeometry(placement);
        const mesh = new Mesh({ geometry, shader: createArachnaWebSilkShader(false, contactTexture) });
        const shadow = new Mesh({ geometry, shader: createArachnaWebSilkShader(true, contactTexture) });
        const spiders = new Mesh({ geometry: createArachnaSpiderGeometry(), shader: createArachnaWebSpiderShader() });
        const dew = new Mesh({ geometry: createArachnaDewGeometry(), shader: createArachnaDewShader() });
        dew.label = "arachna-silk-dew";
        mesh.label = "arachna-source-silk";
        shadow.label = "arachna-silk-shadow";
        spiders.label = "arachna-running-spiders";
        for (const layer of [shadow, mesh, spiders, dew]) {
            layer.eventMode = "none";
            layer.once("destroyed", () => layer.shader?.destroy());
        }
        mesh.once("destroyed", () => mesh.geometry.destroy());
        let contactUsers = 2;
        const releaseContacts = () => {
            if (--contactUsers === 0) contactTexture.destroy();
        };
        mesh.once("destroyed", releaseContacts);
        shadow.once("destroyed", releaseContacts);
        spiders.once("destroyed", () => spiders.geometry.destroy());
        dew.once("destroyed", () => dew.geometry.destroy());
        container.addChild(shadow, mesh, spiders, dew);
        sprite = { mesh, shadow, spiders, dew, contacts, contactTexture, started: now, seen: now, projectionKey };
        sprites.set(ownerId, sprite);
    }
    if (
        (sprite.hiddenAt !== undefined && now - sprite.hiddenAt > 180) ||
        (!sprite.mesh.visible && sprite.resetAt !== undefined && now - sprite.resetAt > 180)
    )
        sprite.started = now;
    sprite.hiddenAt = undefined;
    sprite.seen = now;
    const age = Math.max(0, now - sprite.started);
    if (sprite.projectionKey !== projectionKey) {
        const previous = sprite.mesh.geometry;
        const geometry = createArachnaSilkGeometry(placement);
        sprite.mesh.geometry = sprite.shadow.geometry = geometry;
        previous.destroy();
        sprite.projectionKey = projectionKey;
    }
    for (const layer of [sprite.shadow, sprite.mesh, sprite.spiders, sprite.dew]) {
        layer.visible = true;
        layer.alpha = Math.min(1, alpha * 1.12);
        const uniforms = layer.shader!.resources.silk.uniforms;
        uniforms.uTime = age / 1000;
        uniforms.uReveal = Math.min(1, age / 800);
        uniforms.uBounds.set([bounds.left, bounds.bottom, bounds.right, bounds.top]);
        if (uniforms.uTorches) uniforms.uTorches.set(webFireLights(container));
        if (uniforms.uPlacement) uniforms.uPlacement.set([center.x, center.y, placement.width, -placement.height]);
    }
    sprite.contacts.update([...arachnaSilkContacts(age), ...arachnaDewLoads]);
    updateArachnaDew(sprite.dew.geometry, placement, age, sprite.contacts);
    sprite.contactTexture.update();
    updateArachnaSpiders(sprite.spiders.geometry, placement, age, sprite.contacts);
    const rigUniforms = sprite.spiders.shader!.resources.silk.uniforms;
    updateArachnaSpiderRig(rigUniforms.uJoints, rigUniforms.uBody, rigUniforms.uAbdomen, age, sprite.contacts);
}
