import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

// Source leg centre, registered centre, torso width, leg width. Standing contact
// height never changes. The opening/closing canonical idle frames bypass this pass.
const hitPoses = [
    [420, 420, 1, 1],
    [464, 426, 0.91, 0.68],
    [454, 425, 0.91, 0.7],
    [458, 425, 0.91, 0.69],
    [437, 421, 0.95, 0.79],
    [420, 420, 1, 1],
] as const;
const deathPoses = [
    [420, 420, 1, 1],
    [456, 425, 0.93, 0.76],
    [466, 433, 0.93, 0.8],
    [435, 430, 0.93, 0.83],
    [420, 420, 1, 0.78],
    [420, 420, 1, 0.78],
    [420, 420, 1, 0.78],
] as const;
// Boots, olive cloth, pink fabric, skin: sampled independently against base idle.
const hitGrades = [
    [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
    ],
    [
        [0.78, 0.86, 0.74],
        [0.91, 0.93, 1.0],
        [0.95, 0.92, 0.91],
        [1.02, 1.06, 1.07],
    ],
    [
        [0.73, 1.0, 0.87],
        [0.95, 1.02, 1.12],
        [0.89, 0.9, 0.87],
        [1.01, 1.11, 1.15],
    ],
    [
        [0.8, 0.88, 0.77],
        [0.97, 0.97, 1.0],
        [0.95, 0.92, 0.91],
        [1.04, 1.08, 1.08],
    ],
    [
        [0.81, 0.88, 0.77],
        [0.93, 0.94, 1.0],
        [0.96, 0.93, 0.92],
        [1.02, 1.05, 1.05],
    ],
    [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
    ],
] as const;
const deathGrades = [
    hitGrades[0],
    [
        [0.82, 0.88, 0.83],
        [1.03, 1, 0.97],
        [0.98, 1.01, 1],
        [1.02, 1.01, 1.02],
    ],
    [
        [0.91, 0.94, 0.91],
        [1.1, 1.08, 1.03],
        [0.98, 0.98, 0.96],
        [1.01, 1, 1],
    ],
    [
        [0.98, 0.79, 0.69],
        [0.99, 0.99, 0.97],
        [1, 1.01, 0.99],
        [1, 0.98, 0.97],
    ],
    [
        [0.78, 0.77, 0.71],
        [1.04, 1.02, 1],
        [1, 1.03, 1.02],
        [1.04, 1.03, 1.05],
    ],
    [
        [0.73, 0.71, 0.67],
        [0.98, 0.98, 0.96],
        [1, 1.02, 1.01],
        [1, 0.97, 0.97],
    ],
    [
        [0.82, 0.81, 0.77],
        [0.9, 0.9, 0.87],
        [1, 1.03, 1.02],
        [1, 0.98, 0.98],
    ],
] as const;
const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vBodyCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uBodyMatrix;
void main() {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vec2 uv = aPosition * uOutputFrame.zw * uInputSize.zw;
    vBodyCoord = (uBodyMatrix * vec3(uv, 1.0)).xy;
}`;
const fragment = /* glsl */ `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform mat3 uInputMatrix;
uniform vec4 uPose;
uniform float uProne;
uniform vec3 uBootGrade;
uniform vec3 uOliveGrade;
uniform vec3 uPinkGrade;
uniform vec3 uSkinGrade;
uniform vec4 uInputClamp;
void main() {
    vec2 p = vBodyCoord * 768.0;
    if (uProne < 0.5) {
        float torso = smoothstep(145.0, 240.0, p.y);
        float legs = smoothstep(330.0, 630.0, p.y);
        float upper = uPose.x + (p.x - uPose.x) / mix(1.0, uPose.z, torso);
        float lower = uPose.x + (p.x - uPose.y) / uPose.w;
        p.x = mix(upper, lower, legs);
    } else {
        // In the fallen poses the leg thickness runs vertically. Preserve their
        // length, the head and hand supports, and the ground row instead of squeezing X.
        float legs = smoothstep(250.0, 480.0, p.x);
        p.y = mix(p.y, 734.0 + (p.y - 734.0) / uPose.w, legs);
    }
    vec2 uv = (uInputMatrix * vec3(p / 768.0, 1.0)).xy;
    vec4 color = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
    vec3 rgb = max(color.rgb / max(color.a, 0.0001), vec3(0.0001));
    float rg = rgb.r / rgb.g;
    float gb = rgb.g / rgb.b;
    float olive = smoothstep(1.55, 1.9, gb) * (1.0 - smoothstep(1.6, 1.9, rg));
    float pink = smoothstep(1.10, 1.25, rg) * (1.0 - smoothstep(1.02, 1.16, gb));
    float skin = smoothstep(1.10, 1.3, rg) * smoothstep(1.06, 1.18, gb)
        * (1.0 - smoothstep(1.5, 1.8, gb)) * smoothstep(0.25, 0.44, rgb.r);
    float bootArea = uProne > 0.5 ? smoothstep(470.0, 590.0, p.x) : smoothstep(540.0, 650.0, p.y);
    float brown = smoothstep(1.3, 1.6, rg) * (1.0 - smoothstep(1.85, 2.2, gb));
    vec3 grade = mix(vec3(1.0), uOliveGrade, olive)
        * mix(vec3(1.0), uPinkGrade, pink)
        * mix(vec3(1.0), uSkinGrade, skin * (1.0 - bootArea))
        * mix(vec3(1.0), uBootGrade, bootArea * brown);
    finalColor = vec4(clamp(color.rgb * grade, vec3(0.0), vec3(color.a)), color.a);
}`;
class FairyReactionFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                fairyReaction: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uPose: { value: new Float32Array(4), type: "vec4<f32>" },
                    uProne: { value: 0, type: "f32" },
                    uBootGrade: { value: new Float32Array(3), type: "vec3<f32>" },
                    uOliveGrade: { value: new Float32Array(3), type: "vec3<f32>" },
                    uPinkGrade: { value: new Float32Array(3), type: "vec3<f32>" },
                    uSkinGrade: { value: new Float32Array(3), type: "vec3<f32>" },
                },
            },
        });
    }
    public update(state: string, frame: number): void {
        const uniforms = this.resources.fairyReaction.uniforms;
        uniforms.uPose.set((state === "hit" ? hitPoses : deathPoses)[frame]);
        uniforms.uProne = state === "death" && frame >= 4 ? 1 : 0;
        const [boots, olive, pink, skin] = (state === "hit" ? hitGrades : deathGrades)[frame];
        uniforms.uBootGrade.set(boots);
        uniforms.uOliveGrade.set(olive);
        uniforms.uPinkGrade.set(pink);
        uniforms.uSkinGrade.set(skin);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.fairyReaction.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, FairyReactionFilter>();
export function syncFairyLabReaction(sprite: Sprite, state: string | undefined, frame: number): void {
    const enabled = (state === "hit" && frame > 0 && frame < 5) || (state === "death" && frame > 0 && frame < 7);
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new FairyReactionFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(state!, frame);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
