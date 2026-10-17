import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

// Source coordinates refer to hyena_battlefield_side_right_final_v1.webp (768px).
// The body settles through the joints while the four paw contacts stay planted.
export const HYENA_IDLE_BODY_PLAYBACK_RATE = 1.3;
export const HYENA_IDLE_TAIL_PLAYBACK_RATE = 1.5;
export const HYENA_IDLE_BEND_PERIOD_MS = 3000 / HYENA_IDLE_BODY_PLAYBACK_RATE;
export const HYENA_IDLE_TAIL_PERIOD_MS = 1900 / HYENA_IDLE_TAIL_PLAYBACK_RATE;

const smoothstep = (low: number, high: number, value: number): number => {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
};

export function hyenaIdleBend(elapsedMs: number): number {
    const time = Number.isFinite(elapsedMs) ? elapsedMs : 0;
    return (1 - Math.cos((time * Math.PI * 2) / HYENA_IDLE_BEND_PERIOD_MS)) / 2;
}

export function hyenaIdleTailOffset(x: number, y: number, elapsedMs: number): [number, number] {
    const tailU = Math.max(0, Math.min(1, (152 - x) / 120));
    const tailMask = smoothstep(430, 469, y) * (1 - smoothstep(553, 581, y));
    const phase = ((Number.isFinite(elapsedMs) ? elapsedMs : 0) * Math.PI * 2) / HYENA_IDLE_TAIL_PERIOD_MS;
    const wag = tailMask * tailU * tailU * Math.sin(phase - 0.55 * tailU);
    return [7 * wag, 24 * wag];
}

/** Mirror of the shader's authoring-space displacement, used to guard contact geometry. */
export function hyenaIdleOffset(x: number, y: number, elapsedMs: number): [number, number] {
    const bend = hyenaIdleBend(elapsedMs);
    const mass = 1 - smoothstep(500, 715, y);
    const foreKnee = Math.exp(-(((x - 375) / 73) ** 2 + ((y - 625) / 68) ** 2));
    const hindKnee = Math.exp(-(((x - 120) / 67) ** 2 + ((y - 620) / 70) ** 2));
    const pawLock = 1 - smoothstep(668, 714, y);
    const kneeX = bend * (4 * foreKnee - 3 * hindKnee) * pawLock;
    const [tailX, tailY] = hyenaIdleTailOffset(x, y, elapsedMs);
    return [kneeX + tailX, 12 * bend * mass + tailY];
}

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
uniform vec4 uInputClamp;
uniform float uBend;
uniform float uTime;
uniform float uTailPhase;

vec2 hyenaOffset(vec2 p) {
    float mass = 1.0 - smoothstep(500.0, 715.0, p.y);
    vec2 fore = (p - vec2(375.0, 625.0)) / vec2(73.0, 68.0);
    vec2 hind = (p - vec2(120.0, 620.0)) / vec2(67.0, 70.0);
    float pawLock = 1.0 - smoothstep(668.0, 714.0, p.y);
    float kneeX = uBend * (4.0 * exp(-dot(fore, fore)) - 3.0 * exp(-dot(hind, hind))) * pawLock;
    float tailU = clamp((152.0 - p.x) / 120.0, 0.0, 1.0);
    float tailMask = smoothstep(430.0, 469.0, p.y) * (1.0 - smoothstep(553.0, 581.0, p.y));
    float wag = tailMask * tailU * tailU * sin(uTailPhase - 0.55 * tailU);
    return vec2(kneeX + 7.0 * wag, 12.0 * uBend * mass + 24.0 * wag);
}

vec2 bloodAt(vec2 p) {
    // Blood coats both upper canines, then falls from their tips into the open mouth.
    vec2 nearFang = p - vec2(697.0, 474.0 + 12.0 * uBend);
    float nearX = -0.23 * nearFang.y + 0.8 * sin(nearFang.y * 0.14 + uTime * 0.8);
    float nearFlow = (1.0 - smoothstep(1.4, 4.2, abs(nearFang.x - nearX)))
        * smoothstep(-1.0, 4.0, nearFang.y) * (1.0 - smoothstep(27.0, 33.0, nearFang.y));
    vec2 farFang = p - vec2(722.0, 474.0 + 12.0 * uBend);
    float farX = -0.17 * farFang.y + 0.6 * sin(farFang.y * 0.14 + uTime * 0.75);
    float farFlow = (1.0 - smoothstep(1.1, 3.5, abs(farFang.x - farX)))
        * smoothstep(-1.0, 4.0, farFang.y) * (1.0 - smoothstep(29.0, 35.0, farFang.y));
    float blood = max(nearFlow, farFlow * 0.9);
    float shine = max(nearFlow * (1.0 - smoothstep(0.2, 1.5, abs(nearFang.x - nearX - 1.2))),
                      farFlow * (1.0 - smoothstep(0.2, 1.2, abs(farFang.x - farX - 0.9))));
    for (int i = 0; i < 4; i++) {
        float t = fract(uTime * 0.38 + float(i) / 4.0);
        float fromFang = mod(float(i), 2.0);
        vec2 centrePoint = vec2(mix(691.0, 717.0, fromFang) + 1.8 * sin(float(i) * 2.3 + t * 2.4),
                                mix(501.0, 504.0, fromFang) + 12.0 * uBend + 108.0 * t * t);
        vec2 radius = vec2(4.6 + 1.4 * (1.0 - t), 7.2 + 1.8 * (1.0 - t));
        float shape = length((p - centrePoint) / radius);
        float life = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.82, 1.0, t));
        blood = max(blood, (1.0 - smoothstep(0.70, 1.0, shape)) * life);
        shine = max(shine, (1.0 - smoothstep(0.25, 0.65, length((p - centrePoint - vec2(-1.3, -1.8)) / radius))) * life);
    }
    return vec2(clamp(blood, 0.0, 1.0), clamp(shine, 0.0, 1.0));
}

void main() {
    vec2 destination = vBodyCoord * 768.0;
    vec2 source = destination;
    for (int i = 0; i < 5; i++) source = destination - hyenaOffset(source);
    vec2 uv = (uInputMatrix * vec3(source / 768.0, 1.0)).xy;
    vec4 creature = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
    vec2 blood = bloodAt(destination);
    vec3 red = mix(vec3(0.66, 0.012, 0.022), vec3(0.96, 0.085, 0.055), blood.y * 0.75);
    finalColor = vec4(creature.rgb * (1.0 - blood.x) + red * blood.x,
                      creature.a + blood.x * (1.0 - creature.a));
}`;

class HyenaIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            padding: 20,
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                hyena: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uBend: { value: 0, type: "f32" },
                    uTime: { value: 0, type: "f32" },
                    uTailPhase: { value: 0, type: "f32" },
                },
            },
        });
    }
    public update(elapsedMs: number): void {
        const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
        this.resources.hyena.uniforms.uBend = hyenaIdleBend(time);
        this.resources.hyena.uniforms.uTime = (time / 1000) * HYENA_IDLE_BODY_PLAYBACK_RATE;
        this.resources.hyena.uniforms.uTailPhase = (time * Math.PI * 2) / HYENA_IDLE_TAIL_PERIOD_MS;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.hyena.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}

const idleFilters = new WeakMap<Sprite, HyenaIdleFilter>();

export function syncHyenaIdleVisuals(sprite: Sprite, enabled: boolean, elapsedMs: number): void {
    let filter = idleFilters.get(sprite);
    if (enabled && !filter) {
        filter = new HyenaIdleFilter(sprite);
        idleFilters.set(sprite, filter);
        // The renderer may still execute the previous frame's filter instructions after the
        // lab rebuilds its scene. Leave the filter reachable through that instruction list
        // until it drains; synchronously destroying it here leaves a null program there.
    }
    if (!filter) return;
    if (enabled) filter.update(elapsedMs);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...remaining, filter] : remaining.length ? remaining : null;
}
