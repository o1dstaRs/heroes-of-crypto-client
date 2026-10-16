import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { manticoreIdleMotion, MANTICORE_IDLE_OFFSET_GLSL } from "./ManticoreLabIdleMotion";

import { MANTICORE_LAB_DEATH_OPENING_MS } from "./ManticoreLabReactionTiming";

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
uniform vec4 uMotion;
uniform vec4 uReaction;
uniform vec4 uEye;
uniform vec4 uInputClamp;
${MANTICORE_IDLE_OFFSET_GLSL}
void main() {
    vec2 destination = vBodyCoord * uEye.z;
    vec2 source = destination;
    // Redrawn attacks use only the eye light. Their texture coordinates are never deformed.
    if (uEye.w < 0.5) {
        for (int i = 0; i < 8; i++) {
            float support = 1.0 - smoothstep(570.0, 700.0, source.y);
            float torso = smoothstep(160.0, 320.0, source.x);
            source = destination - idleOffset(source) - uReaction.xy * support * torso;
        }
    }
    vec2 uv = (uInputMatrix * vec3(source / uEye.z, 1.0)).xy;
    vec4 color = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
    // The visible iris is at (626,492) in the original combat figure.
    // Sampling in source coordinates keeps the glow registered while the head lowers.
    vec2 eye = (source - uEye.xy) / vec2(6.2, 4.4);
    float iris = 1.0 - smoothstep(0.55, 1.12, length(eye));
    float halo = exp(-dot(eye, eye) * 0.18) * 0.85;
    float core = exp(-dot(eye, eye) * 5.0);
    vec3 rgb = color.rgb / max(color.a, 0.00001);
    rgb = mix(rgb, vec3(1.0, 0.025, 0.012), iris * (0.88 + 0.12 * uMotion.w) * uReaction.w);
    // A broad red spill remains visible after battlefield downsampling, while the iris stays sharp.
    float glow = halo * (0.55 + 0.75 * uMotion.w) * uReaction.w;
    rgb = mix(rgb, vec3(1.0, 0.035, 0.018), glow * 0.48);
    rgb += vec3(1.0, 0.015, 0.005) * glow * 0.72;
    rgb += vec3(1.0, 0.22, 0.065) * core * uMotion.w * 0.85 * uReaction.w;
    rgb = mix(rgb, vec3(1.0, 0.78, 0.62), uReaction.z);
    finalColor = vec4(clamp(rgb, 0.0, 1.0) * color.a, color.a);
}`;
class ManticoreIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                idle: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uMotion: { value: new Float32Array(4), type: "vec4<f32>" },
                    uReaction: { value: new Float32Array(4), type: "vec4<f32>" },
                    uEye: { value: new Float32Array([626, 492, 768, 0]), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(
        elapsedMs: number,
        eyeOpacity = 1,
        deathOpening = false,
        attackEye?: readonly [number, number],
    ): void {
        this.resources.idle.uniforms.uMotion.set(manticoreIdleMotion(elapsedMs));
        this.resources.idle.uniforms.uEye.set(attackEye ? [attackEye[0], attackEye[1], 896, 1] : [626, 492, 768, 0]);
        if (attackEye) this.resources.idle.uniforms.uMotion.fill(0, 0, 3);
        this.resources.idle.uniforms.uReaction.set([0, 0, 0, 0]);
        this.resources.idle.uniforms.uReaction[3] = eyeOpacity;
        if (deathOpening) {
            const t = Math.min(1, Math.max(0, elapsedMs / MANTICORE_LAB_DEATH_OPENING_MS));
            const fall = t * t * (3 - 2 * t);
            this.resources.idle.uniforms.uMotion.set([38 * fall, 0, 0, 0.8]);
            this.resources.idle.uniforms.uReaction.set([-5 * fall, 0, 0, 1 - fall]);
        }
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.idle.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, ManticoreIdleFilter>();

/** Idle motion or eye-only lighting for redrawn attacks; hit/flight/death poses stay untouched. */
export function syncManticoreLabIdle(
    sprite: Sprite,
    enabled: boolean,
    elapsedMs: number,
    eyeOpacity = 1,
    deathOpening = false,
    attackEye?: readonly [number, number],
): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new ManticoreIdleFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(elapsedMs, eyeOpacity, deathOpening, attackEye);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...remaining, filter] : remaining.length ? remaining : null;
}
