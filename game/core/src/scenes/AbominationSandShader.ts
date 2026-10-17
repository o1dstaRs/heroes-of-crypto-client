import { GlProgram, Shader } from "pixi.js";

export const ABOMINATION_STORM_REVOLUTION_MS = 16000;
export type AbominationSandVariant = 0 | 1 | 2 | 3;
export const ABOMINATION_SAND_VARIANTS = [
    { title: "Текущая спираль", arms: 1, pitch: 10.5, tightness: 1, background: 0.025, gain: 2.3, scale: 1 },
    { title: "Двойная спираль", arms: 2, pitch: 18, tightness: 0.9, background: 0.18, gain: 1.7, scale: 1 },
    { title: "Широкий виток", arms: 1, pitch: 12.5, tightness: 0.45, background: 0.25, gain: 1.6, scale: 0.9 },
    { title: "Три тонких рукава", arms: 3, pitch: 29, tightness: 1.6, background: 0.14, gain: 2, scale: 1.15 },
] as const;

const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec4 uColor;
uniform float uLift;
void main() {
    vUV = aUV;
    vColor = uColor * uWorldColorAlpha;
    gl_Position = vec4((uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition + vec2(0.0, uLift), 1.0)).xy, 0.0, 1.0);
}`;

/** Advected dust clumps and wind-aligned grains share a slow, turbulent spiral flow. */
const fragment = /* glsl */ `#version 300 es
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uTime;
uniform float uPhaseOffset;
uniform float uArms;
uniform float uPitch;
uniform float uTightness;
uniform float uBackground;
uniform float uGain;
uniform float uScale;
uniform float uBaseLayer;
uniform float uFrontLayer;
uniform float uAirLayer;
uniform vec4 uMotion;
uniform vec4 uStep;
uniform vec4 uWake0;
uniform vec4 uWake1;
uniform vec4 uWake2;
uniform vec4 uWake3;
uniform vec4 uWake4;
uniform vec4 uWake5;

float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}
vec2 rotate(vec2 p, float angle) {
    float c = cos(angle), s = sin(angle);
    return mat2(c, s, -s, c) * p;
}
// Smooth spatial noise is advected continuously, never randomized per frame.
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
float dustNoise(vec2 p) {
    return noise(p) * 0.57 + noise(p * 2.07 + 13.4) * 0.29 + noise(p * 4.13 + 37.1) * 0.14;
}
float grains(vec2 field, float scale, float seed, float occupancy, float stretch) {
    vec2 p = field * scale + seed;
    vec2 cell = floor(p);
    float variation = hash(cell + seed);
    vec2 jitter = vec2(hash(cell + 17.3), hash(cell + 53.7));
    vec2 center = 0.42 + jitter * 0.16;
    center += 0.035 * vec2(sin(uTime * 0.7 + variation * 27.0), cos(uTime * 0.9 + jitter.x * 31.0));
    // Elliptical grains leave short trails tangent to the local wind, not sparkling dots.
    float direction = atan(field.y, field.x + 0.00001) + 1.570796;
    vec2 d = rotate(fract(p) - center, -direction);
    d.x /= stretch;
    float radius = 0.105 + variation * 0.065;
    float aa = max(length(fwidth(p)) * 0.38, 0.015);
    float grain = 1.0 - smoothstep(max(0.0, radius - aa), radius + aa, length(d));
    float fade = 0.7 + 0.3 * sin(uTime * 0.8 + variation * 21.0);
    // Preserve subpixel coverage instead of turning fine dust into oversized bright points.
    float coverage = min(1.0, radius * 1.35 / aa);
    return grain * fade * coverage * step(variation, occupancy) * (0.36 + variation * 0.30);
}
// Expanding dust stays at its sampled world position while the owner moves away.
float wakePuff(vec2 p, vec4 puff) {
    float life = clamp(puff.z / 1.35, 0.0, 1.0);
    vec2 delta = (p - puff.xy) / vec2(0.045 + life * 0.15, 0.035 + life * 0.10);
    float cloud = max(0.0, 1.0 - dot(delta, delta));
    float breakup = noise(p * 34.0 + vec2(puff.z * 0.8, -puff.z * 0.6));
    return cloud * cloud * (0.45 + breakup * 0.55) * (1.0 - life) * puff.w;
}
float movementWake(vec2 p) {
    return min(0.8, wakePuff(p, uWake0) + wakePuff(p, uWake1) + wakePuff(p, uWake2)
                  + wakePuff(p, uWake3) + wakePuff(p, uWake4) + wakePuff(p, uWake5));
}
float footfall(vec2 p) {
    float life = clamp(uStep.z / 0.55, 0.0, 1.0);
    vec2 delta = (p - uStep.xy) / vec2(0.055 + life * 0.18, 0.04 + life * 0.10);
    float cloud = max(0.0, 1.0 - dot(delta, delta));
    return cloud * cloud * (1.0 - life) * smoothstep(0.0, 0.035, uStep.z) * uStep.w;
}
// Soft overlapping lobes with directional shading, confined to the feet.
vec4 footBillows(vec2 p) {
    vec4 result = vec4(0.0);
    for (int i = 0; i < 3; i++) {
        float seed = float(i) * 2.0944;
        float t = uTime * (0.55 + float(i) * 0.12) + seed;
        vec2 center = vec2(cos(t) * 0.20, sin(t * 0.8 + seed) * 0.075 - 0.025);
        vec2 d = (p - center) / vec2(0.15, 0.095);
        float shape = max(0.0, 1.0 - dot(d, d));
        float texture = noise(p * 22.0 + vec2(t * 0.3, -t * 0.2));
        float alpha = shape * shape * (0.08 + texture * 0.18);
        vec3 normal = normalize(vec3(d.x, -d.y, sqrt(shape) + 0.15));
        float lighting = clamp(dot(normal, normalize(vec3(-0.45, 0.65, 0.75))), 0.0, 1.0);
        vec3 color = mix(vec3(0.40, 0.32, 0.22), vec3(0.75, 0.64, 0.45), lighting);
        result = vec4(color * alpha, alpha) + result * (1.0 - alpha);
    }
    return result;
}
// Sparse grains kicked up from the epicentre, with short ballistic hops and wind tails.
// Their opacity fades at both ends of the flight, so recycling never pops on screen.
float saltatingGrains(vec2 p) {
    float result = 0.0;
    float aa = max(length(fwidth(p)) * 0.5, 0.0008);
    for (int i = 0; i < 16; i++) {
        float seed = hash(vec2(float(i), 91.7));
        float life = fract(uTime * (0.42 + seed * 0.28) + seed * 17.0);
        float theta = float(i) * 2.399963 - life * 1.8 - uTime * 0.16;
        vec2 radial = vec2(cos(theta), sin(theta));
        float travel = 0.045 + life * 0.32;
        vec2 position = radial * travel - vec2(0.0, 0.38 * life * (1.0 - life));
        vec2 velocity = radial * 0.32 + vec2(radial.y, -radial.x) * travel * 1.8;
        velocity.y -= 0.38 * (1.0 - 2.0 * life);
        vec2 tail = normalize(velocity) * (0.018 + seed * 0.028);
        vec2 delta = p - position;
        float along = clamp(-dot(delta, tail) / dot(tail, tail), 0.0, 1.0);
        float distance = length(delta + tail * along);
        float size = 0.003 + seed * 0.003;
        float grain = 1.0 - smoothstep(max(0.0, size - aa), size + aa, distance);
        float fade = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.66, 1.0, life));
        result = max(result, grain * fade * (1.0 - along * 0.75));
    }
    return result;
}
void main() {
    vec2 p = vUV * 2.0 - 1.0;
    float angle = -uTime * ${((Math.PI * 2 * 1000) / ABOMINATION_STORM_REVOLUTION_MS).toFixed(12)} + uPhaseOffset / uArms;
    vec2 drift = vec2(uTime * 0.16, -uTime * 0.10);
    vec2 cloudField = rotate(p, angle * 0.65) * 3.7 + drift;
    float broad = dustNoise(cloudField);
    float detail = noise(cloudField * 3.7 - drift * 1.6);
    float density = smoothstep(0.26, 0.72, broad * 0.8 + detail * 0.2);
    float gust = smoothstep(0.35, 0.78, noise(p * 2.8 + vec2(-uTime * 0.30, uTime * 0.18)));
    vec2 eddy = vec2(noise(cloudField + 31.2), noise(cloudField - 19.7)) - 0.5;
    vec2 warped = p + eddy * (0.05 + gust * 0.10);
    float edge = min(min(vUV.x, 1.0 - vUV.x), min(vUV.y, 1.0 - vUV.y));
    float boundary = smoothstep(0.0, 0.018, edge);
    vec3 sand = mix(vec3(0.48, 0.38, 0.24), vec3(0.76, 0.64, 0.43), broad);
    // Directional self-shadow: dense cloud interiors absorb light, thin windward edges catch it.
    float litNeighbour = noise(cloudField + vec2(-0.12, -0.18));
    float shade = clamp(0.97 + (broad - litNeighbour) * 1.1 - density * 0.24, 0.62, 1.12);
    sand *= shade;

    // Preserve the approved centreline, while wind erodes only the edges of each arm.
    float radius = length(p);
    if (uFrontLayer > 0.5 && radius > 0.49) {
        finalColor = vec4(0.0);
        return;
    }
    float phase = atan(p.y, p.x + 0.000001) * uArms + radius * uPitch + angle * uArms;
    phase += 0.10 * sin(radius * 24.0 - angle);
    float erosion = (detail - 0.5) * 0.34 + (noise(cloudField * 7.0 - drift) - 0.5) * 0.12;
    float coil = pow(max(0.0, cos(phase)), uTightness);
    float spiral = smoothstep(0.30 + erosion, 0.78 + erosion * 0.5, coil);
    float band = spiral * (0.54 + density * 0.46);
    float torn = max(0.0, smoothstep(0.06, 0.56, max(0.0, cos(phase - 0.20 - gust * 0.25))) - spiral);
    torn *= smoothstep(0.40, 0.73, detail) * (0.20 + gust * 0.80);
    // A dense, winding source directly under the owner feeds the larger slow arms.
    float epicentre = 1.0 - smoothstep(0.10, 0.43, radius);
    float corePhase = atan(p.y, p.x + 0.000001) * 2.0 + radius * 27.0 + uTime * 1.65;
    float coreJets = smoothstep(0.05, 0.82, cos(corePhase + detail * 0.35));

    // Fast sand travels through the slowly turning arms, with three separate depths/sizes.
    vec2 nearField = rotate(warped, angle * 2.4) + eddy * 0.07;
    vec2 farField = rotate(p + eddy * 0.06, angle * 3.1) - drift * 0.18;
    float fineGrains = grains(farField, 40.0 * uScale, 39.1, 1.0, 1.35);
    if (uAirLayer > 0.5) {
        // Confine shredded plumes to the original ground square. Lifting the whole
        // projected sheet creates an unwanted second strip above the aura.
        float rising = dustNoise(rotate(p, angle * 1.3) * vec2(6.0, 10.0) + vec2(uTime * 0.12, uTime * 0.6));
        float plume = smoothstep(0.32, 0.70, rising) * (0.50 + gust * 0.50);
        float trail = smoothstep(0.04, 0.68, max(0.0, cos(phase - 0.32)));
        float alpha = (plume * (trail * 0.32 + torn * 0.22) + fineGrains * plume * 0.30 + movementWake(p) * 0.12) * boundary;
        finalColor = vec4(sand * alpha, alpha) * vColor;
        return;
    }
    if (uBaseLayer > 0.5) {
        // Low dust between coils, but a visibly denser sand source under the feet.
        float coreSand = grains(rotate(p + eddy * 0.025, -uTime * 1.3), 46.0, 121.4, 1.0, 1.8);
        float source = epicentre * (0.24 + density * 0.20 + coreJets * 0.17 + coreSand * 0.65);
        float wake = movementWake(p) * 0.36 + footfall(p) * 0.40;
        float alpha = min(0.78, 0.018 + density * 0.05 + fineGrains * 0.16 * gust + source + wake) * boundary;
        sand = mix(sand, vec3(0.73, 0.60, 0.39), epicentre * (0.30 + coreJets * 0.20));
        finalColor = vec4(sand * alpha, alpha) * vColor;
        return;
    }
    float mediumGrains = grains(nearField, 23.0 * uScale, 7.4, 0.85, 1.5 + gust * 0.6);
    // Broken wind filaments, much finer than the arms, sweep through the dust.
    vec2 filamentField = rotate(p / max(radius, 0.04), -uTime * 0.75) * 3.0;
    float filaments = smoothstep(0.56, 0.79, noise(filamentField + vec2(radius * 36.0, radius * 11.0)));
    if (uFrontLayer > 0.5) {
        vec2 foot = (p - vec2(0.0, 0.015)) / vec2(0.44, 0.25);
        float veil = 1.0 - smoothstep(0.25, 1.0, length(foot + eddy * 0.25));
        float hops = saltatingGrains(p) * (1.0 - smoothstep(0.35, 0.47, radius));
        float rollingDust = veil * (0.05 + density * 0.18 + mediumGrains * 0.35 + coreJets * epicentre * 0.09)
                          + footfall(p) * 0.26;
        float alpha = (1.0 - (1.0 - rollingDust) * (1.0 - hops * 0.65)) * boundary;
        sand = mix(sand, vec3(0.80, 0.70, 0.51), hops * 0.50);
        vec4 billows = footBillows(p);
        vec4 dust = vec4(sand * alpha, alpha);
        finalColor = (billows + dust * (1.0 - billows.a)) * vColor;
        return;
    }
    // Heavy grains lag the fine airborne dust and gradually settle along the floor.
    vec2 heavyField = rotate(p + eddy * 0.018, angle * 0.85) - vec2(0.0, uTime * 0.012);
    float coarseGrains = grains(heavyField, 14.0 * uScale, 73.8, 0.18, 1.8 + gust * 0.3);
    vec2 sprayField = rotate(warped, angle * 3.7 + sin(uTime * 1.3) * gust * 0.08) + vec2(uTime * 0.035, -uTime * 0.022) - uMotion.xy * 0.018;
    float fineSpray = grains(sprayField, 53.0 * uScale, 107.3, 1.0, 1.5);
    float grainAlpha = (fineGrains * 0.72 + fineSpray * 0.50 + mediumGrains * 0.95 + coarseGrains * 0.75)
                    * (uBackground + band * uGain + torn * 0.65 + epicentre * coreJets * 0.45);
    float haze = band * (0.17 + density * 0.23 + filaments * (0.06 + gust * 0.16)) + torn * 0.12;
    float alpha = (1.0 - (1.0 - min(grainAlpha, 0.75)) * (1.0 - haze)) * boundary;
    // A restrained sunlit edge gives grains contrast without additive gold sparkle.
    sand = mix(sand, vec3(0.79, 0.69, 0.50), min(0.45, grainAlpha * 0.6));
    finalColor = vec4(sand * alpha, alpha) * vColor;
}`;

export function createAbominationSandShader(
    variant: AbominationSandVariant = 0,
    phaseOffset = 0,
    baseLayer = false,
    frontLayer = false,
    airLayer = false,
): Shader {
    const style = ABOMINATION_SAND_VARIANTS[variant];
    return new Shader({
        glProgram: GlProgram.from({ name: "abomination-procedural-sand", vertex, fragment }),
        resources: {
            storm: {
                uTime: { value: 0, type: "f32" },
                uPhaseOffset: { value: phaseOffset, type: "f32" },
                uArms: { value: style.arms, type: "f32" },
                uPitch: { value: style.pitch, type: "f32" },
                uTightness: { value: style.tightness, type: "f32" },
                uBackground: { value: style.background, type: "f32" },
                uGain: { value: style.gain, type: "f32" },
                uScale: { value: style.scale, type: "f32" },
                uBaseLayer: { value: baseLayer ? 1 : 0, type: "f32" },
                uFrontLayer: { value: frontLayer ? 1 : 0, type: "f32" },
                uAirLayer: { value: airLayer ? 1 : 0, type: "f32" },
                uLift: { value: 0, type: "f32" },
                uMotion: { value: new Float32Array(4), type: "vec4<f32>" },
                uStep: { value: new Float32Array([0, 0, 10, 0]), type: "vec4<f32>" },
                uWake0: { value: new Float32Array([0, 0, 10, 0]), type: "vec4<f32>" },
                uWake1: { value: new Float32Array([0, 0, 10, 0]), type: "vec4<f32>" },
                uWake2: { value: new Float32Array([0, 0, 10, 0]), type: "vec4<f32>" },
                uWake3: { value: new Float32Array([0, 0, 10, 0]), type: "vec4<f32>" },
                uWake4: { value: new Float32Array([0, 0, 10, 0]), type: "vec4<f32>" },
                uWake5: { value: new Float32Array([0, 0, 10, 0]), type: "vec4<f32>" },
            },
        },
    });
}
