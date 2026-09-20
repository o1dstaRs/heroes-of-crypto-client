import { Filter, GlProgram, type Sprite } from "pixi.js";
import { syncValkyrieLabLimbs } from "./ValkyrieLabWalkGeometry";

// Original 768px idle figure, downsampled to 435px at (58, 49) in the 512px carrier.
export const VALKYRIE_LAB_WALK_SCALE = 512 / 435;
export const VALKYRIE_LAB_WALK_ANCHOR_X = (58 + 435 / 2) / 512;
export const VALKYRIE_LAB_TRANSITION_SPEED = 1.3 * 1.15 * 1.2;
export const VALKYRIE_LAB_FLIGHT_SPEED = 1.07;
// Convert the idle registration into the carrier, including its transparent top margin.
export const valkyrieLabWalkAnchorY = (idleAnchorY: number): number => (49 + 435 * idleAnchorY) / 512;
// Match the source forearm/torso length rather than the changing outstretched-wing bounds.
export const VALKYRIE_LAB_BODY_SCALE = 1.12;
// Match head/forearm size, not the height of the bent-leg silhouette. Spread the
// correction over takeoff/landing so the neutral endpoints never change size.
export const VALKYRIE_LAB_POSE_SCALES = [
    1, 1.02, 1.05, 1.08, 1.12, 1.12, 1.12, 1.12, 1.12, 1.12, 1.12, 1.12, 1.08, 1.04, 1.02, 1,
] as const;
// Keep limb length while correcting the redraw's broad torso, thighs and greaves.
export const VALKYRIE_LAB_WIDTH_SCALE = 0.94;
const appliedBodyScales = new WeakMap<Sprite, readonly [number, number]>();
const colorFilters = new Map<string, Filter>();
const ownedColorFilters = new Set<Filter>();
export const VALKYRIE_LAB_SOURCE_TEXTURE = "valkyrie_battlefield_side_right_distance_readable_v2";

// Corresponding material samples from the ACTUAL battlefield texture (not valkyrie_final).
// Both source sheets are mapped to this one palette so takeoff/flight/landing agree.
const BASE_MATERIALS = [
    [140, 114, 84],
    [142, 132, 124],
    [186, 108, 72],
    [70, 55, 39],
    [142, 103, 56],
    [245, 240, 229],
] as const;
const FLIGHT_MATERIALS = [
    [129, 101, 63],
    [122, 95, 80],
    [222, 122, 85],
    [81, 54, 26],
    [143, 84, 32],
    [255, 255, 255],
] as const;
const TRANSITION_MATERIALS = [
    [143, 99, 71],
    [132, 121, 113],
    [218, 117, 74],
    [91, 67, 52],
    [139, 98, 63],
    [255, 255, 255],
] as const;
export const VALKYRIE_LAB_MATERIAL_SAMPLES = FLIGHT_MATERIALS.map((source, i) => [source, BASE_MATERIALS[i]] as const);
const TRANSITION_SAMPLES = TRANSITION_MATERIALS.map((source, i) => [source, BASE_MATERIALS[i]] as const);
const samplesForFrame = (frame: number) =>
    frame >= 4 && frame <= 11 ? VALKYRIE_LAB_MATERIAL_SAMPLES : TRANSITION_SAMPLES;

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
}`;
const vector = (rgb: readonly number[]) => `vec3(${rgb.map((v) => v.toFixed(8)).join(",")})`;
const materialTransfers = (samples: ReadonlyArray<readonly [readonly number[], readonly number[]]>) =>
    samples
        .map(
            ([source, target]) => `
    accumulate(rgb, ${vector(source.map((v) => v / 255))},
        ${vector(target.map((v, i) => v / source[i]))}, gain, total);
`,
        )
        .join("\n");
const fragment = (samples: ReadonlyArray<readonly [readonly number[], readonly number[]]>) => /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
void accumulate(vec3 rgb, vec3 sampleColor, vec3 sampleGain, inout vec3 gain, inout float total) {
    vec3 delta = rgb - sampleColor;
    float distanceSquared = dot(delta, delta) + 0.0001;
    float weight = 1.0 / (distanceSquared * distanceSquared);
    gain += sampleGain * weight;
    total += weight;
}
void main() {
    vec4 pixel = texture(uTexture, vTextureCoord);
    vec3 rgb = pixel.rgb / max(pixel.a, 0.00001);
    vec3 gain = vec3(0.0);
    float total = 0.0;
    ${materialTransfers(samples)}
    finalColor = vec4(clamp(rgb * gain / total, 0.0, 1.0) * pixel.a, pixel.a);
}`;

export function valkyrieMaterialFilter(
    samples: ReadonlyArray<readonly [readonly number[], readonly number[]]>,
): Filter {
    return new Filter({
        glProgram: GlProgram.from({ vertex, fragment: fragment(samples) }),
        resolution: "inherit",
        antialias: "inherit",
    });
}

/** CPU counterpart for checking the measured palette transfer, in 0..255 RGB. */
export function valkyrieLabMaterialColor(rgb: readonly number[], frame = 4): number[] {
    const gain = [0, 0, 0];
    let total = 0;
    for (const [source, target] of samplesForFrame(frame)) {
        const distance = source.reduce((sum, v, i) => sum + ((rgb[i] - v) / 255) ** 2, 0) + 0.0001;
        const weight = 1 / distance ** 2;
        for (let i = 0; i < 3; i++) gain[i] += (target[i] / source[i]) * weight;
        total += weight;
    }
    return rgb.map((v, i) => Math.max(0, Math.min(255, (v * gain[i]) / total)));
}

/** Endpoints are the canonical idle itself; only the redrawn poses need calibration. */
export function syncValkyrieLabWalk(sprite: Sprite, frameIndex: number, scaleWasReset = false): void {
    syncValkyrieLabLimbs(sprite, frameIndex);
    const redrawn = frameIndex > 0 && frameIndex < 15;
    const scaleY = redrawn ? VALKYRIE_LAB_POSE_SCALES[frameIndex] : 1;
    const scaleX = redrawn ? scaleY * VALKYRIE_LAB_WIDTH_SCALE : 1;
    const previous = scaleWasReset ? [1, 1] : (appliedBodyScales.get(sprite) ?? [1, 1]);
    if (scaleX !== previous[0] || scaleY !== previous[1]) {
        sprite.scale.set((sprite.scale.x * scaleX) / previous[0], (sprite.scale.y * scaleY) / previous[1]);
    }
    if (redrawn) appliedBodyScales.set(sprite, [scaleX, scaleY]);
    else appliedBodyScales.delete(sprite);
    const family = frameIndex >= 4 && frameIndex <= 11 ? "flight" : "transitions";
    let colorFilter = colorFilters.get(family);
    if (redrawn && !colorFilter) {
        colorFilter = new Filter({
            glProgram: GlProgram.from({ vertex, fragment: fragment(samplesForFrame(frameIndex)) }),
            resolution: "inherit",
            antialias: "inherit",
        });
        colorFilters.set(family, colorFilter);
        ownedColorFilters.add(colorFilter);
    }
    const installed = sprite.filters ?? [];
    const desired = redrawn ? colorFilter : undefined;
    if (installed.find((filter) => ownedColorFilters.has(filter)) === desired) return;
    const remaining = installed.filter((filter) => !ownedColorFilters.has(filter));
    sprite.filters = desired ? [desired, ...remaining] : remaining.length ? remaining : null;
}
