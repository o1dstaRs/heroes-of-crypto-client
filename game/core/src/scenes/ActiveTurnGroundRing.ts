import { Container, Matrix, Mesh, MeshGeometry, Texture } from "pixi.js";
import type { GridSettings, HoCMath } from "@heroesofcrypto/common";

import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

export const ACTIVE_TURN_RING_ROTATION_MS = 16000;
export const ACTIVE_TURN_GOLD_COLOR = 0xffc83d;
// The band's centreline diameter is 398 px in the 512 px artwork. Fit that circle to the
// occupied cell seams, rather than fitting the transparent canvas to the cell footprint.
const RING_BAND_DIAMETER_RATIO = 398 / 512;
const preparedSources = new WeakSet<object>();
const ringGeometries = new WeakMap<Texture, Map<number, MeshGeometry>>();
const ovalGeometries = new WeakMap<Container, MeshGeometry>();
const RING_RADII = [0, 150, 180, 199, 222, 245, 256];
const RING_SEGMENTS = 128;

function ellipseArcTable(aspect: number): Float32Array {
    const table = new Float32Array(513);
    for (let i = 1; i < table.length; i++) {
        const previous = ((i - 1) / 512) * Math.PI * 2;
        const angle = (i / 512) * Math.PI * 2;
        table[i] =
            table[i - 1] +
            Math.hypot(aspect * (Math.cos(angle) - Math.cos(previous)), Math.sin(angle) - Math.sin(previous));
    }
    const length = table[512];
    for (let i = 0; i < table.length; i++) table[i] /= length;
    return table;
}

const ovalSourceArc = ellipseArcTable(218.5 / 95);
const ovalTargetArc = ellipseArcTable(2);

function animateOvalRunes(geometry: MeshGeometry, phase: number): void {
    // Move the engraving by distance along the oval. Rotating stretched artwork directly
    // would squash each rune as it travelled from the side to the top of the ring.
    const uvs = geometry.uvs;
    for (let segment = 0; segment <= RING_SEGMENTS; segment++) {
        const arc = (((ovalTargetArc[segment * 4] - phase / (Math.PI * 2)) % 1) + 1) % 1;
        let low = 0;
        let high = 512;
        while (high - low > 1) {
            const middle = (low + high) >> 1;
            if (ovalSourceArc[middle] <= arc) low = middle;
            else high = middle;
        }
        const angle =
            ((low + (arc - ovalSourceArc[low]) / (ovalSourceArc[high] - ovalSourceArc[low])) / 512) * Math.PI * 2;
        for (let row = 0; row < RING_RADII.length; row++) {
            const radius = RING_RADII[row];
            const rx = radius === 0 ? 0 : 218.5 + ((radius - 199) * 31) / 34;
            const ry = radius === 0 ? 0 : 95 + ((radius - 199) * 26) / 34;
            const index = (row * (RING_SEGMENTS + 1) + segment) * 2;
            uvs[index] = 0.5 + (Math.cos(angle) * rx) / 512;
            uvs[index + 1] = 0.5 + (Math.sin(angle) * ry) / 256;
        }
    }
    geometry.getBuffer("aUV").update();
}

function ringGeometry(texture: Texture, bandThickness: number, ovalArtwork: boolean): MeshGeometry {
    const variants = ringGeometries.get(texture) ?? new Map<number, MeshGeometry>();
    const cached = variants.get(bandThickness);
    if (cached) return cached;
    // Compress only the painted band radially around its existing centreline. Keep the
    // canvas extent fixed; this is not a scale of the whole ring.
    const radii = RING_RADII;
    const segments = RING_SEGMENTS;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row < radii.length; row++) {
        const sourceRadius = radii[row];
        const radius =
            sourceRadius >= 180 && sourceRadius <= 222 ? 199 + (sourceRadius - 199) * bandThickness : sourceRadius;
        for (let segment = 0; segment <= segments; segment++) {
            const angle = (segment / segments) * Math.PI * 2;
            const x = Math.cos(angle);
            const y = Math.sin(angle);
            // Keep the rotating geometry circular in a fixed 512-unit coordinate space.
            // The dedicated oval artwork is sampled elliptically; only the ground-plane
            // transform stretches the geometry, so rotation never tilts the oval itself.
            positions.push(x * radius, y * radius);
            const sourceX = ovalArtwork
                ? sourceRadius === 0
                    ? 0
                    : 218.5 + ((sourceRadius - 199) * 31) / 34
                : sourceRadius;
            const sourceY = ovalArtwork
                ? sourceRadius === 0
                    ? 0
                    : 95 + ((sourceRadius - 199) * 26) / 34
                : sourceRadius;
            uvs.push(0.5 + (x * sourceX) / 512, 0.5 + (y * sourceY) / (ovalArtwork ? 256 : 512));
            if (row < radii.length - 1 && segment < segments) {
                const a = row * (segments + 1) + segment;
                const b = a + segments + 1;
                indices.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
    }
    const geometry = new MeshGeometry({
        positions: new Float32Array(positions),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
    });
    variants.set(bandThickness, geometry);
    ringGeometries.set(texture, variants);
    return geometry;
}

/** Authored rune artwork rotates inside the ground-plane projection, never around a screen-space ellipse. */
export function updateActiveTurnGroundRing(
    ring: Container,
    gs: GridSettings,
    center: HoCMath.XY,
    footprintWidth: number,
    footprintHeight: number,
    projected: boolean,
    texture?: Texture,
    nowMs = performance.now(),
): void {
    if (!texture || texture === Texture.EMPTY) {
        ring.visible = false;
        return;
    }
    if (!preparedSources.has(texture.source)) {
        texture.source.scaleMode = "linear";
        texture.source.autoGenerateMipmaps = true;
        texture.source.unload();
        preparedSources.add(texture.source);
    }
    const occupiesMultipleCells = footprintWidth > 1 || footprintHeight > 1;
    const isTwoByOne = footprintWidth === 2 && footprintHeight === 1;
    let geometry = ringGeometry(
        texture,
        0.88 * 0.85 * (occupiesMultipleCells ? 0.8 : 1) * (isTwoByOne ? 0.9 : 1),
        isTwoByOne,
    );
    if (isTwoByOne) {
        let animatedGeometry = ovalGeometries.get(ring);
        if (!animatedGeometry) {
            animatedGeometry = new MeshGeometry({
                positions: geometry.positions.slice(),
                uvs: geometry.uvs.slice(),
                indices: geometry.indices.slice(),
            });
            ovalGeometries.set(ring, animatedGeometry);
            const ownedGeometry = animatedGeometry;
            ring.once("destroyed", () => ownedGeometry.destroy());
        }
        geometry = animatedGeometry;
    }
    if (
        ring.children.length !== 2 ||
        !(ring.children[1] instanceof Mesh) ||
        ring.children[1].texture !== texture ||
        ring.children[1].geometry !== geometry
    ) {
        for (const child of ring.removeChildren()) child.destroy({ children: true });
        const glow = new Mesh({ texture, geometry });
        const artwork = new Mesh({ texture, geometry });
        for (const sprite of [glow, artwork]) {
            sprite.eventMode = "none";
            sprite.roundPixels = false;
        }
        glow.blendMode = "add";
        // Both layers sample the same alpha silhouette: no filtered render target, blur,
        // or halo outside the artwork. The additive light keeps the engraved edge crisp.
        glow.tint = ACTIVE_TURN_GOLD_COLOR;
        glow.alpha = 0.75;
        ring.addChild(artwork, glow);
    }
    const angle = ((nowMs % ACTIVE_TURN_RING_ROTATION_MS) / ACTIVE_TURN_RING_ROTATION_MS) * Math.PI * 2;
    if (isTwoByOne) animateOvalRunes(geometry, angle);
    for (const child of ring.children) child.rotation = isTwoByOne ? 0 : angle;
    const project = (point: HoCMath.XY) => (projected ? projectBattlefieldPoint(point, gs) : point);
    const position = project(center);
    const halfWidth = gs.getStep() * footprintWidth * 0.5;
    const halfHeight = gs.getStep() * footprintHeight * 0.5;
    const left = project({ x: center.x - halfWidth, y: center.y });
    const right = project({ x: center.x + halfWidth, y: center.y });
    const bottom = project({ x: center.x, y: center.y - halfHeight });
    const top = project({ x: center.x, y: center.y + halfHeight });
    const bandWidth = 512 * RING_BAND_DIAMETER_RATIO;
    const bandHeight = 512 * RING_BAND_DIAMETER_RATIO;
    ring.setFromMatrix(
        new Matrix(
            (right.x - left.x) / bandWidth,
            (right.y - left.y) / bandWidth,
            // Texture Y points down; the battlefield root points up. Preserve rune orientation and
            // make positive local rotation clockwise on screen, including on the slanted floor.
            (bottom.x - top.x) / bandHeight,
            (bottom.y - top.y) / bandHeight,
            position.x,
            position.y,
        ),
    );
    ring.alpha = 0.56;
    // The larger band retains more fully covered pixels after sampling and reads brighter.
    // Neutral RGB compensation matches the small ring without changing hue or transparency.
    ring.tint = footprintWidth > 1 && footprintHeight > 1 ? 0xe0e0e0 : 0xffffff;
    ring.zIndex = 4000 - position.y - 0.4;
    ring.visible = true;
}
