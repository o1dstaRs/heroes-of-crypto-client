import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

// Bone endpoints in the native 512px frames. Narrow perpendicular to each limb,
// keeping knees, ankles, limb length and the authored stance/flight path fixed.
// [far thigh, far shin, near thigh, near shin, upper arm, forearm]
const cruise = [
    [262, 308, 205, 347],
    [196, 351, 135, 382],
    [282, 288, 300, 329],
    [292, 339, 225, 362],
    [274, 201, 252, 234],
    [252, 240, 281, 271],
] as const;
export const VALKYRIE_LAB_LIMBS = [
    null,
    [
        [251, 337, 216, 385],
        [210, 392, 158, 437],
        [277, 337, 292, 370],
        [280, 385, 243, 437],
        [250, 239, 228, 274],
        [229, 281, 257, 311],
    ],
    [
        [251, 280, 219, 327],
        [208, 340, 162, 388],
        [277, 279, 288, 323],
        [277, 334, 230, 392],
        [265, 170, 244, 205],
        [245, 214, 272, 244],
    ],
    [
        [250, 283, 192, 317],
        [178, 322, 126, 339],
        [277, 273, 294, 298],
        [276, 309, 221, 327],
        [265, 162, 243, 199],
        [247, 208, 271, 237],
    ],
    cruise,
    cruise,
    cruise,
    cruise,
    cruise,
    cruise,
    cruise,
    cruise,
    [
        [259, 281, 197, 316],
        [187, 320, 135, 338],
        [288, 269, 306, 298],
        [289, 307, 233, 326],
        [276, 154, 254, 191],
        [258, 201, 283, 230],
    ],
    [
        [268, 318, 233, 359],
        [220, 371, 171, 415],
        [298, 315, 322, 352],
        [310, 369, 294, 436],
        [270, 186, 257, 230],
        [259, 240, 285, 271],
    ],
    [
        [266, 338, 230, 380],
        [218, 390, 178, 438],
        [289, 331, 308, 361],
        [289, 377, 259, 435],
        [271, 213, 252, 250],
        [257, 261, 282, 293],
    ],
    null,
] as const;

// Foot rectangles isolate the broad boot drawings; horizontal correction keeps ground height.
const cruiseBoots = [
    [111, 369, 145, 412],
    [202, 348, 237, 393],
] as const;
export const VALKYRIE_LAB_BOOTS = [
    null,
    [
        [137, 427, 205, 475],
        [216, 426, 293, 475],
    ],
    [
        [131, 381, 171, 442],
        [200, 381, 264, 442],
    ],
    [
        [91, 327, 140, 386],
        [188, 319, 223, 375],
    ],
    cruiseBoots,
    cruiseBoots,
    cruiseBoots,
    cruiseBoots,
    cruiseBoots,
    cruiseBoots,
    cruiseBoots,
    cruiseBoots,
    [
        [100, 328, 146, 388],
        [199, 318, 236, 376],
    ],
    [
        [135, 403, 187, 472],
        [270, 427, 345, 477],
    ],
    [
        [151, 424, 228, 479],
        [233, 421, 313, 476],
    ],
    null,
] as const;

export function valkyrieLimbWidth(frame: number): number {
    if (frame <= 0 || frame >= 15) return 1;
    // Crouched lift-off/contact poses have the thickest thigh and greave drawings.
    return [1, 2, 13, 14].includes(frame) ? 0.78 : 0.88;
}
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
uniform vec4 uFarThigh;
uniform vec4 uFarShin;
uniform vec4 uNearThigh;
uniform vec4 uNearShin;
uniform vec4 uUpperArm;
uniform vec4 uForearm;
uniform float uLegWidth;
uniform vec4 uFarBoot;
uniform vec4 uNearBoot;
uniform vec4 uTorso;
void narrow(vec2 p, vec4 bone, float radius, float width, inout vec2 delta, inout float total) {
    vec2 axis = bone.zw - bone.xy;
    float boneLength = length(axis);
    vec2 direction = axis / max(boneLength, 1.0);
    vec2 normal = vec2(-direction.y, direction.x);
    float along = dot(p - bone.xy, direction);
    float across = dot(p - bone.xy, normal);
    float weight = smoothstep(-10.0, 4.0, along)
        * (1.0 - smoothstep(boneLength - 4.0, boneLength + 10.0, along))
        * (1.0 - smoothstep(radius, radius + 16.0, abs(across)));
    delta += normal * across * (1.0 / width - 1.0) * weight;
    total += weight;
}
float bootShift(vec2 p, vec4 bounds) {
    float weight = smoothstep(bounds.x - 5.0, bounds.x + 5.0, p.x)
        * (1.0 - smoothstep(bounds.z - 5.0, bounds.z + 5.0, p.x))
        * smoothstep(bounds.y - 5.0, bounds.y + 10.0, p.y)
        * (1.0 - smoothstep(bounds.w, bounds.w + 6.0, p.y));
    return (p.x - (bounds.x + bounds.z) * 0.5) * (1.0 / 0.84 - 1.0) * weight;
}
void main() {
    vec2 p = vBodyCoord * 512.0;
    vec2 delta = vec2(0.0);
    float total = 0.0;
    narrow(p, uFarThigh, 17.0, uLegWidth, delta, total);
    narrow(p, uFarShin, 15.0, uLegWidth, delta, total);
    narrow(p, uNearThigh, 20.0, uLegWidth, delta, total);
    narrow(p, uNearShin, 16.0, uLegWidth, delta, total);
    narrow(p, uUpperArm, 16.0, 0.94, delta, total);
    narrow(p, uForearm, 13.0, 0.94, delta, total);
    narrow(p, uTorso, 28.0, 0.95, delta, total);
    vec2 source = p + delta / max(1.0, total);
    source.x += bootShift(p, uFarBoot) + bootShift(p, uNearBoot);
    vec2 uv = (uInputMatrix * vec3(source / 512.0, 1.0)).xy;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}`;
class ValkyrieLimbFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                limbs: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uFarThigh: { value: new Float32Array(4), type: "vec4<f32>" },
                    uFarShin: { value: new Float32Array(4), type: "vec4<f32>" },
                    uNearThigh: { value: new Float32Array(4), type: "vec4<f32>" },
                    uNearShin: { value: new Float32Array(4), type: "vec4<f32>" },
                    uUpperArm: { value: new Float32Array(4), type: "vec4<f32>" },
                    uForearm: { value: new Float32Array(4), type: "vec4<f32>" },
                    uLegWidth: { value: 1, type: "f32" },
                    uFarBoot: { value: new Float32Array(4), type: "vec4<f32>" },
                    uNearBoot: { value: new Float32Array(4), type: "vec4<f32>" },
                    uTorso: { value: new Float32Array(4), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(frame: number): void {
        const bones = VALKYRIE_LAB_LIMBS[frame];
        if (!bones) return;
        const uniforms = this.resources.limbs.uniforms;
        ["uFarThigh", "uFarShin", "uNearThigh", "uNearShin", "uUpperArm", "uForearm"].forEach((key, i) =>
            uniforms[key].set(bones[i]),
        );
        uniforms.uLegWidth = valkyrieLimbWidth(frame);
        const boots = VALKYRIE_LAB_BOOTS[frame]!;
        uniforms.uFarBoot.set(boots[0]);
        uniforms.uNearBoot.set(boots[1]);
        // Shoulder and hips derive from the same measured pose, so the torso follows the lean.
        uniforms.uTorso.set([
            bones[4][0] + 21,
            bones[4][1] - 1,
            (bones[0][0] + bones[2][0]) / 2,
            (bones[0][1] + bones[2][1]) / 2 - 15,
        ]);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.limbs.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, ValkyrieLimbFilter>();
export function syncValkyrieLabLimbs(sprite: Sprite, frame: number): void {
    const enabled = !!VALKYRIE_LAB_LIMBS[frame];
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new ValkyrieLimbFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(frame);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
