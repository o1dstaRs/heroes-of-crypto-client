import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

export const VALKYRIE_IDLE_BODY_PERIOD_MS = 4800;

// Match the count banners' 2.6 radians/second travelling wave.
export const VALKYRIE_IDLE_WIND_SPEED = 2.6;
export function valkyrieIdleMotion(elapsedMs: number): readonly [number, number, number] {
    const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    const entry = Math.min(1, time / 350);
    return [
        ((time * VALKYRIE_IDLE_WIND_SPEED) / 1000) % (2 * Math.PI),
        ((time % VALKYRIE_IDLE_BODY_PERIOD_MS) / VALKYRIE_IDLE_BODY_PERIOD_MS) * 2 * Math.PI,
        entry * entry * (3 - 2 * entry),
    ];
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
uniform vec3 uMotion;
float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 axis = b - a;
    float along = clamp(dot(p - a, axis) / dot(axis, axis), 0.0, 1.0);
    return length(p - a - along * axis);
}
float forearmFollow(vec2 p, vec2 elbow, vec2 grip) {
    vec2 axis = grip - elbow;
    float along = clamp(dot(p - elbow, axis) / dot(axis, axis), 0.0, 1.0);
    return smoothstep(0.0, 0.78, along)
        * (1.0 - smoothstep(22.0, 40.0, segmentDistance(p, elbow, grip)));
}
vec2 idleOffset(vec2 p) {
    // The axe and both hands share the upper body's rigid transform.
    // Fade through the legs to completely stationary boot soles.
    float shaft = 1.0 - smoothstep(15.0, 30.0,
        segmentDistance(p, vec2(195.0, 646.0), vec2(562.0, 168.0)));
    float body = 1.0 - smoothstep(490.0, 690.0, p.y);
    float connected = max(body, shaft);
    float angle = sin(uMotion.y) * 0.020 + sin(2.0*uMotion.y - 0.4) * 0.003;
    vec2 q = p - vec2(380.0, 510.0);
    vec2 rotated = vec2(cos(angle)*q.x - sin(angle)*q.y,
        sin(angle)*q.x + cos(angle)*q.y);
    vec2 sway = (rotated - q + vec2(4.0*sin(uMotion.y), -1.8*sin(uMotion.y))) * connected;

    // A second, slower grip adjustment moves the complete axe rigidly. Both
    // hands share that exact transform; forearms blend back to planted elbows.
    float axeShaft = 1.0 - smoothstep(22.0, 44.0,
        segmentDistance(p, vec2(195.0, 646.0), vec2(562.0, 168.0)));
    float axeHead = smoothstep(460.0, 489.0, p.x)
        * (1.0 - smoothstep(265.0, 290.0, p.y));
    float nearHand = 1.0 - smoothstep(24.0, 43.0, length(p - vec2(368.0, 404.0)));
    float farHand = 1.0 - smoothstep(23.0, 40.0, length(p - vec2(501.0, 234.0)));
    float arms = max(forearmFollow(p, vec2(300.0, 319.0), vec2(368.0, 404.0)),
        forearmFollow(p, vec2(433.0, 282.0), vec2(501.0, 234.0)));
    float gripWeight = max(max(axeShaft, axeHead), max(max(nearHand, farHand), arms));
    float gripPhase = uMotion.y - 0.85;
    float gripAngle = 0.036*sin(gripPhase);
    vec2 gripQ = p - vec2(368.0, 404.0);
    vec2 gripRotated = vec2(cos(gripAngle)*gripQ.x - sin(gripAngle)*gripQ.y,
        sin(gripAngle)*gripQ.x + cos(gripAngle)*gripQ.y);
    vec2 gripOffset = (gripRotated - gripQ
        + vec2(2.5*sin(gripPhase), -5.0*sin(gripPhase))) * gripWeight;
    // Compose with the body's rotation so the axe remains straight as she sways.
    sway += vec2(cos(angle)*gripOffset.x - sin(angle)*gripOffset.y,
        sin(angle)*gripOffset.x + cos(angle)*gripOffset.y);

    // Folded wing roots stay at the shoulder; only the free feathers ripple.
    float loose = smoothstep(195.0, 610.0, p.y);
    float wingRight = 310.0 - max(0.0, p.y - 240.0) * 0.20;
    float wing = (1.0 - smoothstep(wingRight - 40.0, wingRight + 20.0, p.x))
        * smoothstep(155.0, 225.0, p.y)
        * (1.0 - smoothstep(630.0, 725.0, p.y));
    float wavePhase = uMotion.x - (p.y - 190.0) * 0.011;
    // Broad billow plus a smaller travelling ripple: the silhouette reads from
    // distant cells without turning the feather edge into a uniform pendulum.
    float gust = 0.85 + 0.15*sin(uMotion.y - 0.8);
    vec2 wind = vec2(32.0*sin(wavePhase) + 4.0*sin(2.0*wavePhase + 0.5)
        - 8.0*(0.5 + 0.5*sin(uMotion.y - 0.6)),
        6.0*cos(wavePhase)) * wing * loose * gust;

    // Braids behind the head: fixed roots, softly moving hanging ends.
    float hair = (1.0 - smoothstep(12.0, 38.0,
        segmentDistance(p, vec2(337.0, 145.0), vec2(273.0, 218.0))))
        * smoothstep(143.0, 198.0, p.y);
    wind += vec2(11.0*sin(uMotion.x - 0.8 - p.y*0.012),
        3.5*cos(uMotion.x - 0.8 - p.y*0.012)) * hair;
    float awayFromWeapon = smoothstep(25.0, 85.0,
        segmentDistance(p, vec2(195.0, 646.0), vec2(562.0, 168.0)));
    return (sway + wind * awayFromWeapon) * uMotion.z;
}
void main() {
    vec2 destination = vBodyCoord * 768.0;
    vec2 source = destination;
    for (int i = 0; i < 12; i++) source = mix(source, destination - idleOffset(source), 0.7);
    vec2 uv = (uInputMatrix * vec3(source / 768.0, 1.0)).xy;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}`;

class ValkyrieLabIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 24,
            resources: {
                idle: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uMotion: { value: new Float32Array(3), type: "vec3<f32>" },
                },
            },
        });
    }
    public update(elapsedMs: number): void {
        this.resources.idle.uniforms.uMotion.set(valkyrieIdleMotion(elapsedMs));
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.idle.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, ValkyrieLabIdleFilter>();

/** Continuous source-art motion, mirrored in artwork coordinates; flight and combat own their frames exclusively. */
export function syncValkyrieLabIdle(sprite: Sprite, enabled: boolean, nowMs: number): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new ValkyrieLabIdleFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(nowMs);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
