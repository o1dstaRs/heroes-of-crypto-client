import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Mesh, MeshGeometry, Texture } from "pixi.js";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

export const PEGASUS_WINGED_SWORD_AURA_KEY = "vfx_pegasus_four_swords_aura_v2";
export const PEGASUS_AURA_ROTATION_MS = 24000;
const SUBDIVISIONS = 24;
// The four swords and separate feather arcs fill the footprint; the texture has transparent corners.
const TEXTURE_RADIUS = 0.5;
const ARTWORK_SCALE = 1.5;

// Isolate the four swords in the authored 1254px texture. Feather arcs stay at their original pixels.
const SWORD_REGIONS = [
    {
        points: [
            575, 0, 682, 0, 682, 278, 748, 267, 748, 383, 674, 389, 674, 444, 581, 444, 581, 389, 508, 383, 508, 267,
            575, 278,
        ],
        dx: 0,
        dy: 1,
    },
    {
        points: [
            0, 582, 240, 582, 240, 529, 358, 529, 358, 589, 428, 589, 428, 666, 358, 666, 358, 731, 240, 731, 240, 678,
            0, 678,
        ],
        dx: 1,
        dy: 0,
    },
    {
        points: [
            1254, 582, 1014, 582, 1014, 529, 896, 529, 896, 589, 826, 589, 826, 666, 896, 666, 896, 731, 1014, 731,
            1014, 678, 1254, 678,
        ],
        dx: -1,
        dy: 0,
    },
    {
        points: [
            580, 1254, 680, 1254, 680, 991, 744, 991, 744, 867, 674, 867, 674, 809, 580, 809, 580, 867, 510, 867, 510,
            991, 580, 991,
        ],
        dx: 0,
        dy: -1,
    },
];
const insetTextures = new WeakMap<Texture, Texture>();

/** Translate whole sword cutouts once, before rotation/projection, without resizing the surrounding art. */
function insetSwordTexture(texture: Texture): Texture {
    const cached = insetTextures.get(texture);
    if (cached) return cached;
    if (typeof document === "undefined") return texture;
    const resource = texture.source.resource;
    const drawable =
        (typeof HTMLImageElement !== "undefined" && resource instanceof HTMLImageElement) ||
        (typeof HTMLCanvasElement !== "undefined" && resource instanceof HTMLCanvasElement) ||
        (typeof ImageBitmap !== "undefined" && resource instanceof ImageBitmap);
    if (!drawable) return texture;
    const canvas = document.createElement("canvas");
    canvas.width = texture.width;
    canvas.height = texture.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return texture;
    const source = resource as CanvasImageSource;
    const sx = canvas.width / 1254,
        sy = canvas.height / 1254;
    const path = (points: number[]) => {
        ctx.beginPath();
        ctx.moveTo(points[0] * sx, points[1] * sy);
        for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i] * sx, points[i + 1] * sy);
        ctx.closePath();
    };
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "destination-out";
    for (const region of SWORD_REGIONS) {
        path(region.points);
        ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    for (const region of SWORD_REGIONS) {
        ctx.save();
        ctx.translate(region.dx * canvas.width * 0.08, region.dy * canvas.height * 0.08);
        path(region.points);
        ctx.clip();
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
    const result = Texture.from(canvas);
    texture.once("destroy", () => result.destroy(true));
    insetTextures.set(texture, result);
    return result;
}

/** Negative world rotation appears clockwise through the battlefield's y-up transform. */
export function pegasusAuraRotation(ageMs: number): number {
    return -((Math.max(0, ageMs) % PEGASUS_AURA_ROTATION_MS) / PEGASUS_AURA_ROTATION_MS) * Math.PI * 2;
}

export function pegasusAuraProjection(
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    rotation: number,
    gs: GridSettings,
    narrowing = 0,
) {
    if (!(range > 0)) return undefined;
    const cell = gs.getCellSize();
    const rx = (range + footprint.width / 2 - 0.055) * cell * ARTWORK_SCALE;
    const ry = (range + footprint.height / 2 - 0.055) * cell * ARTWORK_SCALE;
    const inset = Math.max(0, narrowing) * cell;
    const left = Math.max(center.x - rx, gs.getMinX() + inset);
    const right = Math.min(center.x + rx, gs.getMaxX() - inset);
    const bottom = Math.max(center.y - ry, gs.getMinY() + inset);
    const top = Math.min(center.y + ry, gs.getMaxY() - inset);
    if (right <= left || top <= bottom) return undefined;
    const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
    const cos = Math.cos(rotation),
        sin = Math.sin(rotation);
    for (let row = 0; row <= SUBDIVISIONS; row++) {
        for (let col = 0; col <= SUBDIVISIONS; col++) {
            const x = left + ((right - left) * col) / SUBDIVISIONS;
            const y = top - ((top - bottom) * row) / SUBDIVISIONS;
            const projected = projectBattlefieldPoint({ x, y }, gs);
            positions.push(projected.x, projected.y);
            const dx = (x - center.x) / rx,
                dy = (y - center.y) / ry;
            // Inverse rotation samples a rigid emblem; clipping never recentres or stretches it.
            uvs.push(0.5 + (cos * dx + sin * dy) * TEXTURE_RADIUS, 0.5 - (-sin * dx + cos * dy) * TEXTURE_RADIUS);
            if (row < SUBDIVISIONS && col < SUBDIVISIONS) {
                const a = row * (SUBDIVISIONS + 1) + col,
                    b = a + SUBDIVISIONS + 1;
                indices.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
    }
    return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

type Aura = { mesh: Mesh<MeshGeometry>; started: number; seen: number };
const owners = new WeakMap<Container, Map<string, Aura>>();

export function resetPegasusWingedSwordAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const entries = owners.get(container);
    if (!entries) return;
    for (const [id, aura] of entries) {
        aura.mesh.visible = false;
        if (now - aura.seen > 5000) {
            aura.mesh.destroy();
            entries.delete(id);
        }
    }
}

/** Four swords and separate Pegasus feather arcs rotate around a clear centre beneath the owner. */
export function drawPegasusWingedSwordAura(
    container: Container | undefined,
    texture: Texture | undefined,
    center: HoCMath.XY,
    footprint: { width: number; height: number },
    range: number,
    gs: GridSettings,
    ownerId: string,
    alpha: number,
    narrowing = 0,
    now = performance.now(),
): void {
    if (!container || !texture || texture === Texture.EMPTY || !(alpha > 0)) return;
    texture = insetSwordTexture(texture);
    let entries = owners.get(container);
    if (!entries) owners.set(container, (entries = new Map()));
    const key = `${ownerId}:${range}`;
    let aura = entries.get(key);
    if (aura?.mesh.visible) return;
    const projection = pegasusAuraProjection(
        center,
        footprint,
        range,
        pegasusAuraRotation(now - (aura?.started ?? now)),
        gs,
        narrowing,
    );
    if (!projection) return;
    if (!aura) {
        const geometry = new MeshGeometry(projection);
        const mesh = new Mesh({ texture, geometry });
        mesh.label = "pegasus-winged-sword-aura";
        mesh.eventMode = "none";
        mesh.once("destroyed", () => geometry.destroy());
        container.addChild(mesh);
        aura = { mesh, started: now, seen: now };
        entries.set(key, aura);
    } else {
        aura.mesh.geometry.positions.set(projection.positions);
        aura.mesh.geometry.uvs.set(projection.uvs);
        aura.mesh.geometry.getBuffer("aPosition").update();
        aura.mesh.geometry.getBuffer("aUV").update();
    }
    aura.seen = now;
    aura.mesh.texture = texture;
    aura.mesh.visible = true;
    aura.mesh.alpha = Math.min(1, alpha) * 0.38;
}
