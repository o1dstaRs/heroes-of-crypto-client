import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

export const ANGEL_IDLE_PERIOD_MS = 4800;

// One shared phase keeps the wind seamless. Startup fades from the canonical landing cel.
export function angelIdleMotion(elapsedMs: number): [number, number, number, number] {
    const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
    const phase = (time / ANGEL_IDLE_PERIOD_MS) * Math.PI * 2;
    const t = Math.min(1, time / 650);
    const fade = t * t * (3 - 2 * t);
    return [phase, fade, 0.009 * Math.sin(phase) * fade, (1 - Math.cos(phase)) * 0.9 * fade];
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

export const ANGEL_IDLE_FRAGMENT = /* glsl */ `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform mat3 uInputMatrix;
uniform vec4 uInputClamp;
uniform vec4 uMotion;
float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
}
vec2 rotateAround(vec2 p, vec2 pivot, float angle) {
    float c = cos(angle), s = sin(angle);
    return pivot + mat2(c, s, -s, c) * (p - pivot);
}
void main() {
    vec2 p = vBodyCoord * 768.0;
    float phase = uMotion.x, fade = uMotion.y;
    // The head and ribcage follow a slow weight transfer over planted boots.
    // No global X/Y scale is animated. Support below y=680 is completely stationary.
    float support = 1.0 - smoothstep(340.0, 680.0, p.y);
    // Hand, guard and blade use the SAME rigid transform, including the blade tip.
    float weapon = 1.0 - smoothstep(20.0, 38.0,
        segmentDistance(p, vec2(264.0, 347.0), vec2(632.0, 730.0)));
    weapon = max(weapon, 1.0 - smoothstep(35.0, 50.0, length(p - vec2(365.0, 443.0))));
    float weight = mix(support, 1.0 - smoothstep(340.0, 680.0, 398.0), weapon);
    p = rotateAround(p, vec2(440.0, 670.0), -uMotion.z * weight);
    p.y += uMotion.w * weight;
    // The outer wing is behind the arm. Boundary follows that overlap instead of
    // dragging the armor with the feathers. Its root at the scapula stays attached.
    float wingEdge = mix(302.0, 270.0, smoothstep(290.0, 480.0, p.y));
    float wing = 1.0 - smoothstep(wingEdge - 12.0, wingEdge + 10.0, p.x);
    float rootDistance = min(1.0, length(p - vec2(325.0, 185.0)) / 430.0);
    float gust = sin(phase - 0.65) + 0.28 * sin(phase * 2.0 - p.y * 0.011);
    p.x -= wing * rootDistance * 8.0 * gust * fade;
    p.y -= wing * rootDistance * 2.1 * sin(phase - p.y * 0.008) * fade;
    // The smaller far wing has a shorter lever and lags behind the near wing.
    float farWing = smoothstep(302.0, 318.0, p.x) * (1.0 - smoothstep(362.0, 375.0, p.x))
        * smoothstep(42.0, 57.0, p.y) * (1.0 - smoothstep(117.0, 149.0, p.y));
    p.x -= farWing * 2.5 * sin(phase - 1.0) * fade;
    p.y -= farWing * 0.8 * sin(phase - 1.5) * fade;
    // Hair tips move behind the rigid forehead/face, with a quicker wind harmonic.
    float hair = smoothstep(374.0, 394.0, p.x) * (1.0 - smoothstep(425.0, 441.0, p.x))
        * smoothstep(22.0, 39.0, p.y) * (1.0 - smoothstep(111.0, 133.0, p.y));
    p.x -= hair * (2.8 * sin(phase * 2.0 - 0.8) + 0.9 * sin(phase * 3.0 - p.y * 0.045)) * fade;
    p.y -= hair * 1.1 * sin(phase * 2.0 - 1.4) * fade;
    vec2 uv = (uInputMatrix * vec3(p / 768.0, 1.0)).xy;
    vec4 painted = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
    // Measured blade centerline, excluding the hand and sun-shaped guard.
    // Evaluating in the same canonical coordinates makes the light follow the sword.
    vec2 start = vec2(381.0, 466.0), end = vec2(630.0, 729.0), ab = end - start;
    float along = clamp(dot(p - start, ab) / dot(ab, ab), 0.0, 1.0);
    float distanceToBlade = segmentDistance(p, start, end);
    float width = mix(5.6, 0.8, along);
    float core = 1.0 - smoothstep(width, width + 2.4, distanceToBlade);
    float halo = exp(-distanceToBlade * distanceToBlade / 150.0) * 0.43
        + exp(-distanceToBlade * distanceToBlade / 720.0) * 0.11;
    float radiance = fade * (0.94 + 0.06 * sin(phase - 0.4));
    float light = clamp((core * 0.98 + halo) * radiance, 0.0, 0.995);
    // White premultiplied emission, including a soft transparent halo. No opaque matte.
    finalColor = vec4(vec3(light) + painted.rgb * (1.0 - light),
        light + painted.a * (1.0 - light));
}`;

export class AngelIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment: ANGEL_IDLE_FRAGMENT }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 12,
            resources: {
                angelIdle: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uMotion: { value: new Float32Array(4), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(elapsedMs: number): void {
        this.resources.angelIdle.uniforms.uMotion.set(angelIdleMotion(elapsedMs));
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.angelIdle.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, AngelIdleFilter>();
export function syncAngelLabIdle(sprite: Sprite, enabled: boolean, elapsedMs: number): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new AngelIdleFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(elapsedMs);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...remaining, filter] : remaining.length ? remaining : null;
}
