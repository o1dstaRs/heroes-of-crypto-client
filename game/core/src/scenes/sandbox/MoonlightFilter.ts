import { Filter } from "pixi.js";

const VERTEX = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vBoardCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vBoardCoord = aPosition;
}
`;

const FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vBoardCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uIntensity;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float cloudField(vec2 p) {
    float n = 0.0;
    float a = 0.58;
    for (int i = 0; i < 4; i++) {
        n += noise2(p) * a;
        p = p * 2.03 + vec2(7.1, 3.7);
        a *= 0.48;
    }
    return n;
}

void main(void) {
    vec4 tex = texture(uTexture, vTextureCoord);
    vec3 rgb = tex.rgb;
    float t = uTime;

    // Broad cloud shadows drift diagonally across the complete board. Frequencies are deliberately low:
    // moonlight should breathe over several cells, never sparkle like fire or crawl like screen noise.
    vec2 drift = vec2(t * 0.018, -t * 0.011);
    float clouds = cloudField(vBoardCoord * vec2(2.2, 2.8) + drift);
    float veil = smoothstep(0.36, 0.86, clouds);
    float slowBreath = 0.5 + 0.5 * sin(t * 0.19 + sin(t * 0.071) * 0.8);
    float moon = (0.055 + veil * 0.11 + slowBreath * 0.025) * clamp(uIntensity, 0.0, 1.0);

    // Blood stays ruby-red instead of being washed blue. Stone and grout receive the full moon grade;
    // red-dominant pixels keep almost all of their original hue and brightness.
    float redDominance = rgb.r - max(rgb.g, rgb.b);
    float blood = smoothstep(0.035, 0.18, redDominance);
    float stoneMoon = moon * (1.0 - blood * 0.88);
    vec3 moonColor = vec3(0.34, 0.52, 0.72);
    float detail = 0.55 + dot(rgb, vec3(0.299, 0.587, 0.114)) * 1.8;
    vec3 lit = rgb * (1.0 + stoneMoon * 0.42) + moonColor * stoneMoon * detail;

    finalColor = vec4(clamp(mix(lit, rgb, blood * 0.08), 0.0, 1.0), tex.a);
}
`;

export function createMoonlightFilter(): Filter | undefined {
    try {
        const filter = Filter.from({
            gl: { vertex: VERTEX, fragment: FRAGMENT },
            resources: {
                moonlightUniforms: {
                    uTime: { value: 0, type: "f32" },
                    uIntensity: { value: 1, type: "f32" },
                },
            },
        });
        // Keep this full-sprite pass within the renderer's framebuffer budget on large HiDPI screens.
        filter.resolution = "inherit";
        filter.padding = 0;
        return filter;
    } catch {
        return undefined;
    }
}

export function updateMoonlightUniforms(filter: Filter, timeSec: number, intensity: number): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resources = filter.resources as any;
    if (resources?.moonlightUniforms?.uniforms) {
        resources.moonlightUniforms.uniforms.uTime = timeSec;
        resources.moonlightUniforms.uniforms.uIntensity = intensity;
    }
}
