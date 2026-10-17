import { Filter, GlProgram, type Sprite } from "pixi.js";

import {
    WYVERN_ATTACK_BODY_SCALE,
    wyvernAttackCurves,
    calibrateWyvernAttackChannel,
} from "./WyvernLabAttackCalibration";

type RGB = readonly [number, number, number];
type Sample = readonly [RGB, RGB];
type Pose =
    | "landing"
    | "takeoff"
    | "recovery"
    | "level"
    | "down"
    | "attack_straight"
    | "attack_straight_snap"
    | "attack_up"
    | "attack_up_snap"
    | "attack_down"
    | "attack_down_snap";

// Source material quartiles were measured from the opaque pixels of each key pose.
// Targets come from the canonical battlefield cutout: wing, olive scales, acid.
// Grade each repeated key pose to the same targets so its different lighting does
// not change the creature's material colors during the flight loop.
const baseWing: readonly RGB[] = [
    [31, 21, 14],
    [45, 34, 28],
    [67, 54, 48],
];
const baseScales: readonly RGB[] = [
    [42, 37, 19],
    [65, 58, 35],
    [96, 88, 62],
];
const baseAcid: readonly RGB[] = [
    [170, 188, 24],
    [181, 198, 35],
    [194, 214, 47],
];

const poseSources: Record<Pose, { wing: readonly RGB[]; scales: readonly RGB[]; acid: readonly RGB[] }> = {
    attack_straight: {
        wing: [
            [15, 9, 6],
            [26, 20, 19],
            [41, 35, 35],
        ],
        scales: [
            [25, 20, 6],
            [50, 42, 23],
            [93, 82, 62],
        ],
        acid: baseAcid,
    },
    attack_straight_snap: {
        wing: [
            [14, 8, 5],
            [25, 19, 18],
            [40, 33, 33],
        ],
        scales: [
            [23, 17, 5],
            [45, 37, 19],
            [84, 72, 53],
        ],
        acid: baseAcid,
    },
    attack_up: {
        wing: [
            [23, 16, 15],
            [37, 29, 29],
            [53, 45, 44],
        ],
        scales: [
            [19, 12, 2],
            [35, 28, 10],
            [56, 47, 26],
        ],
        acid: baseAcid,
    },
    attack_up_snap: {
        wing: [
            [24, 17, 17],
            [38, 31, 31],
            [57, 48, 46],
        ],
        scales: [
            [19, 12, 2],
            [36, 29, 9],
            [59, 49, 26],
        ],
        acid: baseAcid,
    },
    attack_down: {
        wing: [
            [17, 10, 6],
            [35, 27, 26],
            [52, 43, 42],
        ],
        scales: [
            [38, 24, 14],
            [54, 39, 24],
            [74, 62, 40],
        ],
        acid: baseAcid,
    },
    attack_down_snap: {
        wing: [
            [15, 9, 5],
            [31, 23, 22],
            [46, 36, 36],
        ],
        scales: [
            [34, 20, 11],
            [48, 33, 19],
            [69, 53, 34],
        ],
        acid: baseAcid,
    },
    landing: {
        wing: [
            [39, 26, 17],
            [59, 42, 31],
            [82, 59, 45],
        ],
        scales: [
            [57, 45, 21],
            [85, 69, 39],
            [130, 109, 72],
        ],
        acid: [
            [140, 132, 7],
            [180, 172, 17],
            [214, 210, 33],
        ],
    },
    takeoff: {
        wing: [
            [37, 24, 16],
            [52, 38, 29],
            [72, 53, 43],
        ],
        scales: [
            [50, 39, 19],
            [73, 59, 33],
            [112, 95, 61],
        ],
        acid: [
            [135, 137, 7],
            [166, 171, 14],
            [202, 211, 28],
        ],
    },
    recovery: {
        wing: [
            [42, 22, 9],
            [62, 38, 26],
            [86, 57, 44],
        ],
        scales: [
            [94, 75, 35],
            [129, 104, 57],
            [174, 149, 98],
        ],
        acid: [
            [128, 100, 7],
            [153, 131, 28],
            [201, 206, 39],
        ],
    },
    level: {
        wing: [
            [40, 24, 14],
            [60, 40, 30],
            [83, 59, 48],
        ],
        scales: [
            [82, 64, 31],
            [118, 96, 53],
            [163, 137, 89],
        ],
        acid: [
            [126, 99, 22],
            [144, 116, 34],
            [194, 189, 41],
        ],
    },
    down: {
        wing: [
            [43, 26, 16],
            [63, 44, 34],
            [86, 63, 52],
        ],
        scales: [
            [80, 62, 29],
            [109, 87, 47],
            [154, 130, 84],
        ],
        acid: [
            [128, 103, 4],
            [169, 171, 12],
            [208, 213, 35],
        ],
    },
};

const framePose: readonly (Pose | undefined)[] = [
    undefined,
    "landing",
    "takeoff",
    "recovery",
    "takeoff",
    "level",
    "level",
    "down",
    "down",
    "level",
    "level",
    "recovery",
    "takeoff",
    "recovery",
    "level",
    "landing",
    "landing",
    undefined,
];

export const WYVERN_LAB_FRAME_SIZE = 768;

export function wyvernLabMaterialSamples(pose: Pose): readonly Sample[] {
    const source = poseSources[pose];
    const wing = pose.startsWith("attack_")
        ? [
              [36, 26, 23],
              [57, 45, 42],
              [80, 67, 62],
          ]
        : baseWing;
    const scales = pose.startsWith("attack_")
        ? [
              [44, 35, 14],
              [71, 62, 36],
              [109, 99, 71],
          ]
        : baseScales;
    return [
        ...source.wing.map((rgb, index) => [rgb, wing[index]] as Sample),
        ...source.scales.map((rgb, index) => [rgb, scales[index]] as Sample),
        ...source.acid.map((rgb, index) => [rgb, baseAcid[index]] as Sample),
    ];
}

export function wyvernLabPoseForFrame(frameIndex: number): Pose | undefined {
    return framePose[frameIndex];
}

/** CPU counterpart of the shader, used to check the measured material anchors. */
export function wyvernLabMaterialColor(rgb: RGB, pose: Pose): RGB {
    const gain = [0, 0, 0];
    let total = 0;
    for (const [source, target] of wyvernLabMaterialSamples(pose)) {
        const distance =
            source.reduce((sum, value, i) => sum + ((rgb[i] - value) / 255) ** 2, 0) +
            (pose.startsWith("attack_") ? 1e-10 : 0.0001);
        const weight = 1 / distance ** 2;
        for (let i = 0; i < 3; i++) gain[i] += (target[i] / source[i]) * weight;
        total += weight;
    }
    return rgb.map((value, i) => Math.max(0, Math.min(255, (value * gain[i]) / total))) as unknown as RGB;
}

// Measured over all opaque body pixels, excluding acid, after the material grade.
// Small material patches alone overexposed the rest of the creature by 18–31%.
// Match the canonical idle body mean luminance (46.69/255) per authored pose.
const attackExposure: Partial<Record<Pose, number>> = {
    attack_straight: 0.82883441,
    attack_straight_snap: 0.84595176,
    attack_up: 0.76316883,
    attack_up_snap: 0.77477549,
    attack_down: 0.76799593,
    attack_down_snap: 0.78082924,
};

export function wyvernLabDisplayColor(rgb: RGB, pose: Pose): RGB {
    const graded = wyvernLabMaterialColor(rgb, pose);
    const acid = rgb[1] > rgb[0] * 0.98 && rgb[0] > 100 && rgb[2] < rgb[1] * 0.5;
    const exposure = acid ? 1 : (attackExposure[pose] ?? 1);
    return graded.map((value, channel) =>
        acid ? value : calibrateWyvernAttackChannel(value * exposure, pose, channel),
    ) as unknown as RGB;
}

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
}`;

const color = (rgb: RGB) => `vec3(${rgb.map((value) => (value / 255).toFixed(8)).join(",")})`;
const curveShader = (pose: Pose): string => {
    const curve = wyvernAttackCurves[pose];
    if (!curve) return "vec3 calibrate(vec3 rgb) { return rgb; }";
    const channels = ["r", "g", "b"];
    return (
        channels
            .map(
                (channel, c) =>
                    `float grade_${channel}(float v) {\n${curve.source
                        .slice(1)
                        .map(
                            (hi, i) =>
                                `if (v <= ${(hi[c] / 255).toFixed(8)}) return mix(${(curve.target[i][c] / 255).toFixed(8)}, ${(curve.target[i + 1][c] / 255).toFixed(8)}, clamp((v - ${(curve.source[i][c] / 255).toFixed(8)}) / ${Math.max((hi[c] - curve.source[i][c]) / 255, 0.00000001).toFixed(8)},0.0,1.0));`,
                        )
                        .join("\n")} return ${(curve.target[curve.target.length - 1][c] / 255).toFixed(8)}; }`,
            )
            .join("\n") + "\nvec3 calibrate(vec3 rgb) { return vec3(grade_r(rgb.r),grade_g(rgb.g),grade_b(rgb.b)); }"
    );
};

const fragment = (pose: Pose) => /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform float uFootX;
${curveShader(pose)}
void accumulate(vec3 rgb, vec3 source, vec3 sampleGain, inout vec3 gain, inout float total) {
    vec3 delta = rgb - source;
    float distanceSquared = dot(delta, delta) + ${pose.startsWith("attack_") ? "0.0000000001" : "0.0001"};
    float weight = 1.0 / (distanceSquared * distanceSquared);
    gain += sampleGain * weight;
    total += weight;
}
void main() {
    vec2 pivot = vec2(uFootX, 863.0/1024.0) * uOutputFrame.zw * uInputSize.zw;
    vec2 sampleUV = pivot + (vTextureCoord - pivot) / ${pose.startsWith("attack_") ? WYVERN_ATTACK_BODY_SCALE.toFixed(8) : "1.0"};
    vec4 pixel = texture(uTexture, sampleUV);
    vec3 rgb = pixel.rgb / max(pixel.a, 0.00001);
    vec3 gain = vec3(0.0);
    float total = 0.0;
    ${wyvernLabMaterialSamples(pose)
        .map(
            ([source, target]) =>
                `accumulate(rgb, ${color(source)}, ${color([(target[0] / source[0]) * 255, (target[1] / source[1]) * 255, (target[2] / source[2]) * 255])}, gain, total);`,
        )
        .join("\n    ")}
    bool acid = rgb.g > rgb.r * 0.98 && rgb.r > 100.0 / 255.0 && rgb.b < rgb.g * 0.5;
    float exposure = acid ? 1.0 : ${Number(attackExposure[pose] ?? 1).toFixed(8)};
    vec3 graded = clamp(rgb * gain / total, 0.0, 1.0) * exposure;
    if (!acid) graded = calibrate(graded);
    finalColor = vec4(graded * pixel.a, pixel.a);
}`;

const filters = new Map<Pose, Filter>();

/** Only authored attack frames are graded; source idle bookends remain exact. */
export function wyvernLabAttackPose(state: string | undefined, frame: number): Pose | undefined {
    if (!state || !["melee_attack", "melee_attack_up", "melee_attack_down"].includes(state)) return undefined;
    if (frame === 2 || frame === 5) return "attack_straight_snap";
    if (frame !== 3 && frame !== 4) return undefined;
    const direction = state === "melee_attack_up" ? "up" : state === "melee_attack_down" ? "down" : "straight";
    return `attack_${direction}${frame === 4 ? "_snap" : ""}` as Pose;
}

/** The canonical first/last frames and idle retain their unfiltered source colors. */
export function syncWyvernLabWalkPalette(sprite: Sprite, frameIndex: number, attackState?: string): void {
    const pose = attackState ? wyvernLabAttackPose(attackState, frameIndex) : wyvernLabPoseForFrame(frameIndex);
    let desired: Filter | undefined;
    if (pose) {
        desired = filters.get(pose);
        if (!desired) {
            desired = new Filter({
                glProgram: GlProgram.from({ vertex, fragment: fragment(pose) }),
                resources: { geometry: { uFootX: { value: 538 / 1024, type: "f32" } } },
                resolution: "inherit",
                antialias: "inherit",
            });
            filters.set(pose, desired);
        }
    }
    if (desired) desired.resources.geometry.uniforms.uFootX = sprite.scale.x < 0 ? 1 - 538 / 1024 : 538 / 1024;
    const installed = sprite.filters ?? [];
    const grades = [...filters.values()];
    if (installed.find((filter) => grades.includes(filter)) === desired) return;
    const remaining = installed.filter((filter) => !grades.includes(filter));
    sprite.filters = desired ? [desired, ...remaining] : remaining.length ? remaining : null;
}
