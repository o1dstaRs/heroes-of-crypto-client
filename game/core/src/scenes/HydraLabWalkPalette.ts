import { Filter, GlProgram, type Sprite } from "pixi.js";

// Material quantiles measured from the pooled eight walk poses and current v5
// idle, on opaque scale pixels. One fixed grade avoids per-frame color flicker.
export const HYDRA_LAB_SCALE_SAMPLES = [
    [
        [19, 16, 14],
        [17, 18, 6],
    ],
    [
        [31, 27, 24],
        [25, 28, 11],
    ],
    [
        [53, 47, 43],
        [43, 46, 21],
    ],
    [
        [87, 79, 73],
        [71, 73, 41],
    ],
    [
        [129, 116, 108],
        [111, 107, 74],
    ],
    [
        [167, 151, 141],
        [154, 146, 110],
    ],
    [
        [220, 205, 190],
        [210, 192, 149],
    ],
    [
        [255, 255, 255],
        [245, 239, 216],
    ],
    [
        [20, 20, 23],
        [20, 22, 8],
    ],
    [
        [42, 44, 47],
        [39, 43, 19],
    ],
    [
        [66, 73, 76],
        [65, 70, 37],
    ],
    [
        [105, 119, 127],
        [106, 111, 75],
    ],
] as const;

// Opaque bounds (alpha > 220): idle 723 x 594, smallest walk 658 x 559.
// Constants preserve the authored gait; never refit every moving silhouette.
export const HYDRA_LAB_WALK_WIDTH_SCALE = 723 / 658;
export const HYDRA_LAB_WALK_HEIGHT_SCALE = 594 / 559;
// Register the first support foot to idle's 13px inset above its 730px anchor.
export const HYDRA_LAB_WALK_FOOT_ANCHOR_Y = (707 + 13 / HYDRA_LAB_WALK_HEIGHT_SCALE) / 768;

// Base scale quartiles -> graded walk scale quartiles (RGB, 0..255).
// Idle is already olive, so it must not receive the silver-to-olive walk grade.
export const HYDRA_LAB_IDLE_SCALE_SAMPLES = [
    [
        [14, 14, 3],
        [11, 12, 2],
    ],
    [
        [33, 32, 12],
        [23, 25, 9],
    ],
    [
        [52, 50, 27],
        [37, 39, 16],
    ],
    [
        [79, 77, 49],
        [64, 68, 35],
    ],
    [
        [140, 133, 96],
        [121, 120, 83],
    ],
    [
        [220, 204, 164],
        [201, 190, 148],
    ],
    [
        [25, 27, 14],
        [20, 27, 13],
    ],
    [
        [50, 57, 41],
        [39, 52, 32],
    ],
] as const;
type MaterialSamples = readonly (readonly [readonly number[], readonly number[]])[];

const smoothstep = (lo: number, hi: number, value: number): number => {
    const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
};

/** CPU counterpart, in 0..255 RGB, for checking canonical material anchors. */
export function hydraLabWalkColor(rgb: readonly number[]): number[] {
    return hydraLabColor(rgb, HYDRA_LAB_SCALE_SAMPLES, true);
}
export function hydraLabIdleColor(rgb: readonly number[]): number[] {
    return hydraLabColor(rgb, HYDRA_LAB_IDLE_SCALE_SAMPLES, false);
}
function hydraLabColor(rgb: readonly number[], samples: MaterialSamples, gradeTassels: boolean): number[] {
    const gain = [0, 0, 0];
    let total = 0;
    for (const [source, target] of samples) {
        const distance = source.reduce((sum, value, i) => sum + ((rgb[i] - value) / 255) ** 2, 0) + 0.000001;
        const weight = 1 / distance ** 2;
        for (let i = 0; i < 3; i++) gain[i] += (target[i] / source[i]) * weight;
        total += weight;
    }
    const warm = smoothstep(0.32, 0.58, (rgb[0] - rgb[1]) / Math.max(rgb[0], 1));
    const flame = smoothstep(0.5, 0.75, (rgb[0] - rgb[2]) / Math.max(rgb[0], 1)) * smoothstep(100, 170, rgb[0]);
    const preserve = Math.max(warm, flame);
    const tassel = smoothstep(0.58, 0.8, (rgb[0] - rgb[1]) / Math.max(rgb[0], 1)) * (1 - smoothstep(150, 205, rgb[0]));
    return rgb.map((value, i) => {
        const graded = Math.max(0, Math.min(255, (value * gain[i]) / total));
        const warmColor = value * (1 + ([0.88, 1.08, 0.55][i] - 1) * (gradeTassels ? tassel : 0));
        return Math.min(255, graded * (1 - preserve) + warmColor * preserve);
    });
}

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
const vector = (values: readonly number[]) => `vec3(${values.map((v) => v.toFixed(8)).join(",")})`;
const fragment = (samples: MaterialSamples, gradeTassels: boolean) => /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
void accumulate(vec3 rgb, vec3 source, vec3 sampleGain, inout vec3 gain, inout float total) {
    vec3 delta = rgb - source;
    float distanceSquared = dot(delta, delta) + 0.000001;
    float weight = 1.0 / (distanceSquared * distanceSquared);
    gain += sampleGain * weight;
    total += weight;
}
void main() {
    vec4 pixel = texture(uTexture, vTextureCoord);
    vec3 rgb = pixel.rgb / max(pixel.a, 0.00001);
    vec3 gain = vec3(0.0);
    float total = 0.0;
    ${samples
        .map(
            ([source, target]) =>
                `accumulate(rgb, ${vector(source.map((v) => v / 255))}, ${vector(target.map((v, i) => v / source[i]))}, gain, total);`,
        )
        .join("\n    ")}
    float warm = smoothstep(0.32, 0.58, (rgb.r - rgb.g) / max(rgb.r, 1.0 / 255.0));
    float flame = smoothstep(0.5, 0.75, (rgb.r - rgb.b) / max(rgb.r, 1.0 / 255.0)) * smoothstep(100.0 / 255.0, 170.0 / 255.0, rgb.r);
    float tassel = smoothstep(0.58, 0.8, (rgb.r - rgb.g) / max(rgb.r, 1.0 / 255.0)) *
        (1.0 - smoothstep(150.0 / 255.0, 205.0 / 255.0, rgb.r));
    vec3 warmColor = rgb * mix(vec3(1.0), vec3(0.88, 1.08, 0.55), ${gradeTassels ? "tassel" : "0.0"});
    vec3 graded = clamp(mix(clamp(rgb * gain / total, 0.0, 1.0), warmColor, max(warm, flame)), 0.0, 1.0);
    finalColor = vec4(graded * pixel.a, pixel.a);
}`;

type HydraPaletteState = "idle" | "walk";
const filters = new Map<HydraPaletteState, Filter>();

export function syncHydraLabPalette(sprite: Sprite, state: HydraPaletteState | undefined): void {
    let desired = state ? filters.get(state) : undefined;
    if (state && !desired) {
        desired = new Filter({
            glProgram: GlProgram.from({
                vertex,
                fragment: fragment(
                    state === "walk" ? HYDRA_LAB_SCALE_SAMPLES : HYDRA_LAB_IDLE_SCALE_SAMPLES,
                    state === "walk",
                ),
            }),
            resolution: "inherit",
            antialias: "inherit",
        });
        filters.set(state, desired);
    }
    const installed = sprite.filters ?? [];
    const grades = [...filters.values()];
    if (installed.find((filter) => grades.includes(filter)) === desired) return;
    const remaining = installed.filter((filter) => !grades.includes(filter));
    sprite.filters = desired ? [desired, ...remaining] : remaining.length ? remaining : null;
}
