import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { WOLF_REACTION_PALETTE, WOLF_REACTION_METAL_HIGHLIGHT_SLOPES } from "./WolfReactionPalette";

const HIT_POSES = [-1, 0, 1, 2, 3, 2, 1, 0, -1];
const DEATH_POSES = [-1, 0, 4, 5, 6, 7, 8, 9];
export function wolfReactionPoseIndex(state: string | undefined, frame: number): number {
    return (state === "hit" ? HIT_POSES : state === "death" ? DEATH_POSES : [])[frame] ?? -1;
}

// The same smooth spatial field is used for numeric verification and GPU rendering.
// One global exposure change cannot correct a dark ruff and an overly bright tail.
export function wolfReactionPaletteGain(pose: number, x: number, y: number): number[] {
    const patches = WOLF_REACTION_PALETTE[pose];
    if (!patches) return [1, 1, 1];
    let total = 0;
    const sum = [0, 0, 0];
    for (const [cx, cy, rx, ry, r, g, b] of patches) {
        const weight = (1 + ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) ** -3;
        total += weight;
        sum[0] += weight * r;
        sum[1] += weight * g;
        sum[2] += weight * b;
    }
    return sum.map((value) => value / total);
}

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vBodyCoord;
uniform mat3 uBodyMatrix;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vBodyCoord = (uBodyMatrix * vec3(vTextureCoord, 1.0)).xy;
}
`;
const patchIndices = Array.from({ length: 12 }, (_, index) => index);
const fragment = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uMetalHighlightSlope;
${patchIndices.map((i) => `uniform vec4 uRegion${i};\nuniform vec3 uGain${i};`).join("\n")}
void accumulate(vec2 point, vec4 region, vec3 gain, inout vec3 sum, inout float total) {
    vec2 d = (point - region.xy) / region.zw;
    float w = 1.0 / pow(1.0 + dot(d, d), 3.0);
    sum += w * gain;
    total += w;
}
void main(void) {
    vec4 pixel = texture(uTexture, vTextureCoord);
    vec3 rgb = pixel.rgb / max(pixel.a, 0.00001);
    vec3 sum = vec3(0.0);
    float total = 0.0;
    ${patchIndices.map((i) => `accumulate(vBodyCoord * 768.0, uRegion${i}, uGain${i}, sum, total);`).join("\n    ")}
    // Keep the black nose, eyes and mouth dark; never change silhouette alpha.
    float amount = smoothstep(16.0 / 255.0, 40.0 / 255.0, max(rgb.r, max(rgb.g, rgb.b)));
    rgb *= mix(vec3(1.0), sum / max(total, 0.0000000001), amount);
    // The authored steel has stronger specular contrast than idle. Limit just its
    // bright reflections without dimming the corrected fur or metal midtones.
    float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    float knee = 130.0 / 255.0;
    vec2 metalDistance = (vBodyCoord * 768.0 - uRegion6.xy) / uRegion6.zw;
    float metalWeight = 1.0 / pow(1.0 + dot(metalDistance, metalDistance), 3.0);
    float highlight = max(0.0, luma - knee) * (1.0 - uMetalHighlightSlope);
    rgb *= 1.0 - (metalWeight / max(total, 0.0000000001)) * highlight / max(luma, 0.00001);
    finalColor = vec4(clamp(rgb, 0.0, 1.0) * pixel.a, pixel.a);
}
`;

class WolfReactionFilter extends Filter {
    private pose = -1;
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 0,
            resources: {
                palette: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uMetalHighlightSlope: { value: 1, type: "f32" },
                    ...Object.fromEntries(
                        patchIndices.flatMap((index) => [
                            [`uRegion${index}`, { value: new Float32Array(4), type: "vec4<f32>" }],
                            [`uGain${index}`, { value: new Float32Array(3), type: "vec3<f32>" }],
                        ]),
                    ),
                },
            },
        });
    }
    public update(pose: number): void {
        if (this.pose === pose) return;
        this.pose = pose;
        const uniforms = this.resources.palette.uniforms;
        uniforms.uMetalHighlightSlope = WOLF_REACTION_METAL_HIGHLIGHT_SLOPES[pose];
        WOLF_REACTION_PALETTE[pose].forEach((patch, index) => {
            uniforms[`uRegion${index}`].set(patch.slice(0, 4));
            uniforms[`uGain${index}`].set(patch.slice(4));
        });
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        args[0].calculateSpriteMatrix(this.resources.palette.uniforms.uBodyMatrix, this.sprite);
        super.apply(...args);
    }
}

const reactionFilters = new WeakMap<Sprite, WolfReactionFilter>();
export function syncWolfReactionVisuals(sprite: Sprite, state: string | undefined, frame: number): void {
    const pose = wolfReactionPoseIndex(state, frame);
    let filter = reactionFilters.get(sprite);
    if (pose >= 0) {
        if (!filter) {
            try {
                filter = new WolfReactionFilter(sprite);
                reactionFilters.set(sprite, filter);
                const owned = filter;
                sprite.once("destroyed", () => {
                    owned.destroy();
                    reactionFilters.delete(sprite);
                });
            } catch {
                // Headless renderers retain the original authored frame.
            }
        }
        filter?.update(pose);
    }
    const installed = sprite.filters ?? [];
    const desired = pose >= 0 ? filter : undefined;
    const current = installed.find((entry) => entry === filter);
    if (current === desired) return;
    const rest = installed.filter((entry) => entry !== filter);
    sprite.filters = desired ? [desired, ...rest] : rest.length ? rest : null;
}
