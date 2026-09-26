import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

// Opaque sole bounds measured in the authored 512px hit frames: left/right/bottom,
// back foot first. Register both soles, not the changing silhouette bounds.
export const VALKYRIE_HIT_SOLES = [
    [211, 258, 469, 286, 346, 460],
    [228, 277, 468, 310, 377, 461],
    [235, 287, 468, 326, 392, 462],
    [229, 282, 468, 325, 391, 462],
    [218, 271, 468, 312, 380, 462],
    [212, 264, 468, 292, 359, 461],
    [214, 265, 468, 292, 359, 461],
    [211, 258, 469, 286, 346, 460],
] as const;

export function valkyrieHitSupport(frame: number, scale: number, anchorX: number, anchorY: number) {
    const sole = VALKYRIE_HIT_SOLES[frame];
    const neutral = VALKYRIE_HIT_SOLES[0];
    const targetX = [neutral[0], neutral[1], neutral[3], neutral[4]].map(
        (x) => anchorX * 512 + (x - anchorX * 512) / scale,
    );
    const targetY = [neutral[2], neutral[5]].map((y) => anchorY * 512 + (y - anchorY * 512) / scale);
    const sourceX = [sole[0], sole[1], sole[3], sole[4]];
    const sourceY = [sole[2], sole[5]];
    const bodyShift = [
        sourceX.reduce((sum, x, i) => sum + x - targetX[i], 0) / 4,
        (sourceY[0] - targetY[0] + sourceY[1] - targetY[1]) / 2,
    ];
    return { targetX, targetY, sourceX, sourceY, bodyShift };
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
    vec2 p = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    gl_Position = vec4(p.x * 2.0 / uOutputTexture.x - 1.0,
        p.y * 2.0 * uOutputTexture.z / uOutputTexture.y - uOutputTexture.z, 0.0, 1.0);
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
uniform vec4 uTargetX;
uniform vec4 uSourceX;
uniform vec4 uSoleY;
uniform vec2 uBodyShift;
float footX(float x) {
    if (x < uTargetX.x) return x + uSourceX.x - uTargetX.x;
    if (x < uTargetX.y) return mix(uSourceX.x, uSourceX.y, (x-uTargetX.x)/(uTargetX.y-uTargetX.x));
    if (x < uTargetX.z) return mix(uSourceX.y, uSourceX.z, (x-uTargetX.y)/(uTargetX.z-uTargetX.y));
    if (x < uTargetX.w) return mix(uSourceX.z, uSourceX.w, (x-uTargetX.z)/(uTargetX.w-uTargetX.z));
    return x + uSourceX.w - uTargetX.w;
}
void main() {
    vec2 p = vBodyCoord * 512.0;
    float nearFoot = smoothstep(uTargetX.y, uTargetX.z, p.x);
    vec2 planted = vec2(footX(p.x), p.y + mix(uSoleY.z-uSoleY.x, uSoleY.w-uSoleY.y, nearFoot));
    // The torso keeps the authored recoil. Knees and shins ease into fixed soles.
    vec2 source = mix(p + uBodyShift, planted, smoothstep(325.0, 438.0, p.y));
    vec2 uv = (uInputMatrix * vec3(source / 512.0, 1.0)).xy;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}`;
class HitSupportFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            padding: 48,
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                support: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uTargetX: { value: new Float32Array(4), type: "vec4<f32>" },
                    uSourceX: { value: new Float32Array(4), type: "vec4<f32>" },
                    uSoleY: { value: new Float32Array(4), type: "vec4<f32>" },
                    uBodyShift: { value: new Float32Array(2), type: "vec2<f32>" },
                },
            },
        });
    }
    public update(frame: number, scale: number): void {
        const pose = valkyrieHitSupport(frame, scale, this.sprite.anchor.x, this.sprite.anchor.y);
        const u = this.resources.support.uniforms;
        u.uTargetX.set(pose.targetX);
        u.uSourceX.set(pose.sourceX);
        u.uSoleY.set([...pose.targetY, ...pose.sourceY]);
        u.uBodyShift.set(pose.bodyShift);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.support.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, HitSupportFilter>();
export function syncValkyrieHitSupport(sprite: Sprite, frame: number, scale: number): void {
    const enabled = frame > 0 && frame < 7;
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new HitSupportFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(frame, scale);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const others = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...others] : others.length ? others : null;
}
