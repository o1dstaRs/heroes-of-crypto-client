import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { WHITE_TIGER_TAIL_SPEED } from "./WhiteTigerIdleTail";

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
uniform float uPhase;
uniform float uTime;
uniform vec4 uInputClamp;
// Masks follow the original 768px figure; the neck, feet and wing root stay fixed.
vec2 idleOffset(vec2 p) {
    float tail = clamp((235.0 - p.x) / 190.0, 0.0, 1.0);
    tail *= tail * smoothstep(630.0, 660.0, p.y);
    float wave = sin(uPhase - 0.55 * clamp((235.0 - p.x) / 190.0, 0.0, 1.0));
    vec2 offset = vec2(3.0, 20.0) * tail * wave;
    float wing = (1.0 - smoothstep(420.0, 490.0, p.x)) * smoothstep(155.0, 220.0, p.x);
    wing *= smoothstep(445.0, 485.0, p.y) * (1.0 - smoothstep(650.0, 680.0, p.y));
    // Fade at the lower membrane edge before the scales and hind leg.
    wing *= 1.0 - smoothstep(715.0 - 0.40 * p.x, 735.0 - 0.40 * p.x, p.y);
    float lift = 0.5 - 0.5 * cos(uPhase * 0.5);
    offset += vec2(-2.0, -16.0) * wing * lift;
    float venom = smoothstep(680.0, 690.0, p.x) * (1.0 - smoothstep(732.0, 738.0, p.x));
    venom *= smoothstep(408.0, 450.0, p.y) * (1.0 - smoothstep(465.0, 474.0, p.y));
    offset += vec2(1.8 * sin(uPhase * 1.3 + p.y * 0.055), 4.0 * sin(uPhase * 1.3)) * venom;
    return offset;
}
vec4 sampleBody(vec2 p) {
    vec2 uv = (uInputMatrix * vec3(p / 768.0, 1.0)).xy;
    return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}
void main() {
    vec2 destination = vBodyCoord * 768.0;
    vec2 source = destination;
    for (int i = 0; i < 8; i++) source = destination - idleOffset(source);
    vec4 body = sampleBody(source);
    // Reuse the authored venom drop, including its original highlights and colour.
    if (source.x > 700.0 && source.x < 722.0 && source.y > 474.0 && source.y < 501.0) body = vec4(0.0);
    float fall = fract(uTime / 1.35);
    vec2 dropSource = destination - vec2(1.8 * sin(fall * 3.14159), -10.0 + 105.0 * fall * fall);
    if (dropSource.x > 700.0 && dropSource.x < 722.0 && dropSource.y > 474.0 && dropSource.y < 501.0) {
        vec4 drop = sampleBody(dropSource);
        drop *= smoothstep(0.0, 0.12, fall) * (1.0 - smoothstep(0.82, 1.0, fall));
        body = drop + body * (1.0 - drop.a);
    }
    finalColor = body;
}`;

class WyvernIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                tail: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uPhase: { value: 0, type: "f32" },
                    uTime: { value: 0, type: "f32" },
                },
            },
        });
    }
    public update(nowMs: number): void {
        this.resources.tail.uniforms.uPhase = (nowMs * 0.001 * WHITE_TIGER_TAIL_SPEED) % (Math.PI * 40);
        this.resources.tail.uniforms.uTime = (nowMs * 0.001) % 1350;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.tail.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, WyvernIdleFilter>();

/** Animate only the base figure in the lab, retaining its texture, scale and palette. */
export function syncWyvernLabIdle(sprite: Sprite, enabled: boolean, nowMs: number): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new WyvernIdleFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(nowMs);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...remaining, filter] : remaining.length ? remaining : null;
}
