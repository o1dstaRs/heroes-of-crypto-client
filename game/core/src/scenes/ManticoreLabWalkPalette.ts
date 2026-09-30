import { Filter, GlProgram, type Sprite } from "pixi.js";
import { syncManticoreLabLimbs } from "./ManticoreLabWalkGeometry";

// Corresponding material quartiles from the canonical combat cutout and flight pose 04.
// One grade across all redrawn poses prevents frame-to-frame color pumping.
// Dark/red membranes and bronze skin are calibrated separately from the pale face and black mane.
export const MANTICORE_LAB_MATERIAL_SAMPLES = [
    [
        [110, 61, 20],
        [90, 54, 20],
    ],
    [
        [152, 96, 41],
        [129, 86, 40],
    ],
    [
        [195, 137, 74],
        [170, 125, 71],
    ],
    [
        [85, 3, 1],
        [70, 5, 2],
    ],
    [
        [126, 14, 6],
        [109, 19, 12],
    ],
    [
        [160, 28, 16],
        [146, 36, 26],
    ],
    [
        [15, 10, 7],
        [13, 9, 6],
    ],
    [
        [33, 28, 24],
        [29, 26, 22],
    ],
    [
        [230, 196, 161],
        [226, 200, 169],
    ],
    [
        [246, 223, 195],
        [246, 224, 200],
    ],
    [
        [255, 255, 255],
        [255, 255, 255],
    ],
] as const;
let sharedFilter: Filter | undefined;

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
const materialTransfers = (samples: typeof MANTICORE_LAB_MATERIAL_SAMPLES) =>
    samples
        .map(
            ([source, target]) => `
    accumulate(rgb, ${vector(source.map((v) => v / 255))},
        ${vector(target.map((v, i) => v / source[i]))}, gain, total);
`,
        )
        .join("\n");
const fragment = (samples: typeof MANTICORE_LAB_MATERIAL_SAMPLES) => /* glsl */ `
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

/** CPU counterpart for checking the measured palette transfer, in 0..255 RGB. */
export function manticoreLabMaterialColor(rgb: readonly number[]): number[] {
    const gain = [0, 0, 0];
    let total = 0;
    for (const [source, target] of MANTICORE_LAB_MATERIAL_SAMPLES) {
        const distance = source.reduce((sum, v, i) => sum + ((rgb[i] - v) / 255) ** 2, 0) + 0.0001;
        const weight = 1 / distance ** 2;
        for (let i = 0; i < 3; i++) gain[i] += (target[i] / source[i]) * weight;
        total += weight;
    }
    return rgb.map((v, i) => Math.max(0, Math.min(255, (v * gain[i]) / total)));
}

/** The original first/last frames and resting figure retain their exact source colors. */
export function syncManticoreLabWalkPalette(sprite: Sprite, frameIndex: number): void {
    syncManticoreLabLimbs(sprite, frameIndex);
    const redrawn = frameIndex > 0 && frameIndex < 17;
    if (redrawn && !sharedFilter) {
        sharedFilter = new Filter({
            glProgram: GlProgram.from({ vertex, fragment: fragment(MANTICORE_LAB_MATERIAL_SAMPLES) }),
            resolution: "inherit",
            antialias: "inherit",
        });
    }
    const installed = sprite.filters ?? [];
    const desired = redrawn ? sharedFilter : undefined;
    if (installed.find((filter) => filter === sharedFilter) === desired) return;
    const remaining = installed.filter((filter) => filter !== sharedFilter);
    sprite.filters = desired ? [desired, ...remaining] : remaining.length ? remaining : null;
}
