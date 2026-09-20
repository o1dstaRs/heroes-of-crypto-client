import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

type Bone = readonly [number, number, number, number];
type Pose = { bones: readonly Bone[]; paws: readonly Bone[] };
// Native 768px coordinates: near hind thigh/shin, near forearm, far forearm.
// Correct thickness across each bone; its joint positions and length remain fixed.
const landing: Pose = {
    bones: [
        [303, 470, 288, 563],
        [213, 563, 223, 617],
        [442, 550, 502, 606],
        [556, 553, 622, 595],
    ],
    paws: [
        [195, 610, 268, 667],
        [329, 608, 401, 672],
        [475, 599, 584, 670],
        [602, 574, 711, 639],
    ],
};
export const MANTICORE_LAB_TRANSITION_POSES: Readonly<Record<number, Pose>> = {
    1: {
        bones: [
            [267, 525, 250, 610],
            [155, 603, 133, 654],
            [406, 637, 463, 667],
            [540, 641, 594, 666],
        ],
        paws: [
            [97, 643, 196, 699],
            [272, 649, 354, 695],
            [438, 652, 555, 706],
            [574, 643, 683, 700],
        ],
    },
    2: {
        bones: [
            [284, 472, 230, 553],
            [165, 590, 96, 651],
            [427, 539, 490, 551],
            [548, 521, 574, 548],
        ],
        paws: [
            [53, 638, 131, 706],
            [169, 618, 230, 669],
            [480, 547, 547, 626],
            [539, 536, 607, 603],
        ],
    },
    14: landing,
    15: {
        bones: landing.bones.map(([x, y, X, Y]) => [x, y + 35, X, Y + 35] as const),
        paws: landing.paws.map(([x, y, X, Y]) => [x, y + 35, X, Y + 35] as const),
    },
    16: {
        bones: [
            [269, 533, 238, 608],
            [155, 608, 117, 660],
            [409, 622, 453, 659],
            [548, 621, 591, 655],
        ],
        paws: [
            [82, 646, 184, 700],
            [291, 649, 379, 699],
            [415, 646, 535, 706],
            [550, 640, 678, 701],
        ],
    },
};
// Overall source registration now removes the 12% camera enlargement; avoid narrowing paws twice.
const widths = [0.84, 0.96, 0.94, 0.96] as const;
const radii = [38, 17, 24, 18] as const;
const PAW_WIDTH = 0.96;
const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
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
    vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
    vBodyCoord = (uBodyMatrix * vec3(vTextureCoord, 1.0)).xy;
}`;
const fragment = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform mat3 uInputMatrix;
uniform vec4 uInputClamp;
${[0, 1, 2, 3].map((i) => `uniform vec4 uBone${i};\nuniform vec4 uPaw${i};`).join("\n")}
void narrow(vec2 p, vec4 bone, float radius, float width, inout vec2 delta, inout float total) {
    vec2 axis = bone.zw - bone.xy;
    float len = length(axis);
    vec2 direction = axis / max(len, 1.0);
    vec2 normal = vec2(-direction.y, direction.x);
    float along = dot(p - bone.xy, direction);
    float across = dot(p - bone.xy, normal);
    float weight = smoothstep(-8.0, 10.0, along)
        * (1.0 - smoothstep(len - 10.0, len + 8.0, along))
        * (1.0 - smoothstep(radius, radius + 24.0, abs(across)));
    delta += normal * across * (1.0 / width - 1.0) * weight;
    total += weight;
}
float pawShift(vec2 p, vec4 bounds) {
    // Fade in from the wrist. Ground/contact Y is never displaced.
    float weight = smoothstep(bounds.x - 14.0, bounds.x + 4.0, p.x)
        * (1.0 - smoothstep(bounds.z - 4.0, bounds.z + 14.0, p.x))
        * smoothstep(bounds.y - 8.0, bounds.y + 12.0, p.y)
        * (1.0 - smoothstep(bounds.w, bounds.w + 12.0, p.y));
    return (p.x - (bounds.x + bounds.z) * 0.5) * (1.0 / ${PAW_WIDTH} - 1.0) * weight;
}
void main() {
    vec2 p = vBodyCoord * 768.0;
    vec2 delta = vec2(0.0);
    float total = 0.0;
    ${widths.map((w, i) => `narrow(p, uBone${i}, ${radii[i]}.0, ${w}, delta, total);`).join("\n")}
    vec2 source = p + delta / max(1.0, total);
    source.x += ${[0, 1, 2, 3].map((i) => `pawShift(p, uPaw${i})`).join(" + ")};
    vec2 uv = (uInputMatrix * vec3(source / 768.0, 1.0)).xy;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}`;
class ManticoreLimbFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                limbs: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    ...Object.fromEntries(
                        [0, 1, 2, 3].flatMap((i) => [
                            [`uBone${i}`, { value: new Float32Array(4), type: "vec4<f32>" }],
                            [`uPaw${i}`, { value: new Float32Array(4), type: "vec4<f32>" }],
                        ]),
                    ),
                },
            },
        });
    }
    public update(pose: Pose): void {
        const uniforms = this.resources.limbs.uniforms;
        pose.bones.forEach((bone, i) => uniforms[`uBone${i}`].set(bone));
        pose.paws.forEach((paw, i) => uniforms[`uPaw${i}`].set(paw));
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.limbs.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, ManticoreLimbFilter>();
export function syncManticoreLabLimbs(sprite: Sprite, frame: number): void {
    const pose = MANTICORE_LAB_TRANSITION_POSES[frame];
    let filter = filters.get(sprite);
    if (pose && !filter) {
        filter = new ManticoreLimbFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (pose) filter.update(pose);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === !!pose) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = pose ? [filter, ...remaining] : remaining.length ? remaining : null;
}
