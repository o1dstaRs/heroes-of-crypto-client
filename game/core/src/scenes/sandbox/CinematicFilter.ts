import { Filter } from "pixi.js";

/**
 * Full-scene cinematic color grade + vignette, applied as a post-process to the game world.
 *
 * It does what a production game's grading pass does, in one cheap shader:
 *  - a gentle S-curve contrast and saturation lift,
 *  - subtle split-toning (cool shadows / warm highlights) for depth and mood,
 *  - an ACES filmic tonemap (Narkowicz approximation) so highlights roll off instead of clipping,
 *  - a soft vignette to draw the eye to the action.
 *
 * Grade constants are baked into the shader (no uniforms) so there's zero risk of an unbound
 * uniform turning the scene black — tweak the numbers below to taste. Built with PixiJS v8's
 * Filter.from (GLSL ES 3.0). If it fails to build, createCinematicFilter returns undefined and the
 * caller just leaves the scene ungraded.
 */
const VERTEX = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;

// --- grade knobs (edit to taste) ---
const float CONTRAST   = 1.06;                 // S-curve strength around mid grey
const float SATURATION = 1.14;                 // >1 richer, <1 muted
const float TONEMAP    = 0.35;                 // 0 = off, 1 = full ACES
const float VIGNETTE   = 0.34;                 // 0 = off, 1 = strong edge darkening
const vec3  COOL       = vec3(0.92, 0.97, 1.07); // shadow tint
const vec3  WARM       = vec3(1.07, 1.0, 0.91);  // highlight tint

vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main(void) {
    vec4 src = texture(uTexture, vTextureCoord);
    float a = src.a;
    // Pixi filter input is premultiplied — work on straight color, then re-premultiply.
    vec3 c = a > 0.0001 ? src.rgb / a : src.rgb;

    c = (c - 0.5) * CONTRAST + 0.5;

    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, SATURATION);

    c *= mix(COOL, WARM, smoothstep(0.2, 0.8, l));

    c = mix(c, aces(c), TONEMAP);

    float vig = smoothstep(0.85, 0.32, distance(vTextureCoord, vec2(0.5)));
    c *= mix(1.0, vig, VIGNETTE);

    c = clamp(c, 0.0, 1.0);
    finalColor = vec4(c * a, a);
}
`;

export function createCinematicFilter(): Filter | undefined {
    try {
        return Filter.from({ gl: { vertex: VERTEX, fragment: FRAGMENT }, resources: {} });
    } catch {
        return undefined;
    }
}
