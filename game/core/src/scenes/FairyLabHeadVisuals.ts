import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

// Hair/face bounds measured on the 768px source frames. Keep the correction local
// to the head and blend it through the neck after registering the whole pose.
export const FAIRY_LAB_HEAD_POSES = [
    [358, 252, 427, 322, 1.12, 1],
    [424, 385, 502, 457, 1, 0.98],
    [446, 231, 522, 300, 1, 0.98],
    [443, 227, 530, 311, 0.96, 0.94],
    [438, 226, 528, 311, 0.96, 0.94],
    [442, 228, 530, 310, 0.96, 0.94],
    [442, 218, 531, 299, 0.96, 0.94],
    [438, 218, 528, 303, 0.96, 0.94],
    [445, 218, 534, 302, 0.96, 0.94],
    [437, 257, 513, 328, 1, 0.98],
    [418, 354, 497, 427, 1, 0.98],
    [358, 252, 427, 322, 1.12, 1],
] as const;
// The six flight drawings have a larger torso than the standing source. Normalize
// the artwork itself, not its wing bounding box. Grounded poses pivot at the sole;
// airborne poses pivot at the body, preserving the authored flight elevation.
// [pivotX, pivotY, visibleScale], in the original 768px frame coordinates.
export const FAIRY_LAB_BODY_POSES = [
    [384, 699, 1],
    [384, 699, 0.96],
    [400, 380, 0.94],
    [400, 380, 0.88],
    [400, 380, 0.88],
    [400, 380, 0.88],
    [400, 380, 0.88],
    [400, 380, 0.88],
    [400, 380, 0.88],
    [400, 400, 0.94],
    [384, 699, 0.96],
    [384, 699, 1],
] as const;
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
uniform vec4 uHeadBounds;
uniform vec2 uHeadScale;
uniform vec3 uBodyPose;
uniform vec4 uInputClamp;
void main() {
    vec2 p = uBodyPose.xy + (vBodyCoord * 768.0 - uBodyPose.xy) / uBodyPose.z;
    float weight = smoothstep(uHeadBounds.x - 18.0, uHeadBounds.x, p.x)
        * (1.0 - smoothstep(uHeadBounds.z, uHeadBounds.z + 18.0, p.x))
        * smoothstep(uHeadBounds.y - 18.0, uHeadBounds.y, p.y)
        * (1.0 - smoothstep(uHeadBounds.w, uHeadBounds.w + 24.0, p.y));
    vec2 pivot = vec2(mix(uHeadBounds.x, uHeadBounds.z, 0.38), uHeadBounds.w + 8.0);
    vec2 source = mix(p, pivot + (p - pivot) / uHeadScale, weight);
    vec2 uv = (uInputMatrix * vec3(source / 768.0, 1.0)).xy;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}`;
class FairyHeadFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                head: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uHeadBounds: { value: new Float32Array(4), type: "vec4<f32>" },
                    uHeadScale: { value: new Float32Array(2), type: "vec2<f32>" },
                    uBodyPose: { value: new Float32Array(3), type: "vec3<f32>" },
                },
            },
        });
    }
    public update(frame: number): void {
        const pose = FAIRY_LAB_HEAD_POSES[frame];
        this.resources.head.uniforms.uHeadBounds.set(pose.slice(0, 4));
        this.resources.head.uniforms.uHeadScale.set(pose.slice(4));
        this.resources.head.uniforms.uBodyPose.set(FAIRY_LAB_BODY_POSES[frame]);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.head.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, FairyHeadFilter>();
export function syncFairyLabHead(sprite: Sprite, frame: number): void {
    const enabled = frame >= 0 && frame < FAIRY_LAB_HEAD_POSES.length;
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new FairyHeadFilter(sprite);
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
