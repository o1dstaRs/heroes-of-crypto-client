import { GOBLIN_ATTACK_BLADES } from "./GoblinKnightAttackBlades";
import { GOBLIN_ICE_GLOW_GLSL } from "./GoblinKnightIceGlow";
import { GOBLIN_MOVING_BLADES } from "./GoblinKnightBladePoses";
import { GOBLIN_REACTION_PALETTE_GLSL } from "./GoblinKnightReactionPalette";
import { Filter, GlProgram, Matrix, Texture, type Sprite } from "pixi.js";

// Equal-weight midpoint of pooled idle/walk metal, navy cloth and ice palettes.
// Generated from local canonical atlases; alpha and pose geometry are unchanged.
export const GOBLIN_SHARED_PALETTE_GLSL = /* glsl */ `
float gp00s(float x) {
    if (x <= 0.00000000) return mix(0.00000000, 0.00392157, clamp((x - 0.00000000) / 0.00000100, 0.0, 1.0));
    if (x <= 0.00000000) return mix(0.00392157, 0.01568627, clamp((x - 0.00000000) / 0.00000100, 0.0, 1.0));
    if (x <= 0.06666667) return mix(0.01568627, 0.06078431, clamp((x - 0.00000000) / 0.06666667, 0.0, 1.0));
    if (x <= 0.18431373) return mix(0.06078431, 0.13725490, clamp((x - 0.06666667) / 0.11764706, 0.0, 1.0));
    if (x <= 0.38039216) return mix(0.13725490, 0.26078431, clamp((x - 0.18431373) / 0.19607843, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.26078431, 1.00000000, clamp((x - 0.38039216) / 0.61960784, 0.0, 1.0));
    return 1.0;
}
float gp00v(float x) {
    if (x <= 0.00000000) return mix(0.00000000, 0.01960784, clamp((x - 0.00000000) / 0.00000100, 0.0, 1.0));
    if (x <= 0.01176471) return mix(0.01960784, 0.04509804, clamp((x - 0.00000000) / 0.01176471, 0.0, 1.0));
    if (x <= 0.04313725) return mix(0.04509804, 0.08823529, clamp((x - 0.01176471) / 0.03137255, 0.0, 1.0));
    if (x <= 0.09803922) return mix(0.08823529, 0.16274510, clamp((x - 0.04313725) / 0.05490196, 0.0, 1.0));
    if (x <= 0.19215686) return mix(0.16274510, 0.27843137, clamp((x - 0.09803922) / 0.09411765, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.27843137, 1.00000000, clamp((x - 0.19215686) / 0.80784314, 0.0, 1.0));
    return 1.0;
}
float gp01s(float x) {
    if (x <= 0.56862745) return mix(0.00000000, 0.56274510, clamp((x - 0.00000000) / 0.56862745, 0.0, 1.0));
    if (x <= 0.65098039) return mix(0.56274510, 0.62941176, clamp((x - 0.56862745) / 0.08235294, 0.0, 1.0));
    if (x <= 0.71372549) return mix(0.62941176, 0.68431373, clamp((x - 0.65098039) / 0.06274510, 0.0, 1.0));
    if (x <= 0.80000000) return mix(0.68431373, 0.76274510, clamp((x - 0.71372549) / 0.08627451, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.76274510, 0.92745098, clamp((x - 0.80000000) / 0.20000000, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.92745098, 1.00000000, clamp((x - 1.00000000) / 0.00000100, 0.0, 1.0));
    return 1.0;
}
float gp01v(float x) {
    if (x <= 0.01960784) return mix(0.00000000, 0.03333333, clamp((x - 0.00000000) / 0.01960784, 0.0, 1.0));
    if (x <= 0.03921569) return mix(0.03333333, 0.06470588, clamp((x - 0.01960784) / 0.01960784, 0.0, 1.0));
    if (x <= 0.09411765) return mix(0.06470588, 0.13333333, clamp((x - 0.03921569) / 0.05490196, 0.0, 1.0));
    if (x <= 0.18039216) return mix(0.13333333, 0.22352941, clamp((x - 0.09411765) / 0.08627451, 0.0, 1.0));
    if (x <= 0.28627451) return mix(0.22352941, 0.31372549, clamp((x - 0.18039216) / 0.10588235, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.31372549, 1.00000000, clamp((x - 0.28627451) / 0.71372549, 0.0, 1.0));
    return 1.0;
}
float gp02s(float x) {
    if (x <= 0.40784314) return mix(0.00000000, 0.41176471, clamp((x - 0.00000000) / 0.40784314, 0.0, 1.0));
    if (x <= 0.50588235) return mix(0.41176471, 0.49411765, clamp((x - 0.40784314) / 0.09803922, 0.0, 1.0));
    if (x <= 0.63137255) return mix(0.49411765, 0.65294118, clamp((x - 0.50588235) / 0.12549020, 0.0, 1.0));
    if (x <= 0.82352941) return mix(0.65294118, 0.85294118, clamp((x - 0.63137255) / 0.19215686, 0.0, 1.0));
    if (x <= 0.95294118) return mix(0.85294118, 0.94705882, clamp((x - 0.82352941) / 0.12941176, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.94705882, 1.00000000, clamp((x - 0.95294118) / 0.04705882, 0.0, 1.0));
    return 1.0;
}
float gp02v(float x) {
    if (x <= 0.82352941) return mix(0.00000000, 0.84509804, clamp((x - 0.00000000) / 0.82352941, 0.0, 1.0));
    if (x <= 0.91372549) return mix(0.84509804, 0.91764706, clamp((x - 0.82352941) / 0.09019608, 0.0, 1.0));
    if (x <= 0.97254902) return mix(0.91764706, 0.96274510, clamp((x - 0.91372549) / 0.05882353, 0.0, 1.0));
    if (x <= 0.98823529) return mix(0.96274510, 0.97843137, clamp((x - 0.97254902) / 0.01568627, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.97843137, 0.99019608, clamp((x - 0.98823529) / 0.01176471, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.99019608, 1.00000000, clamp((x - 1.00000000) / 0.00000100, 0.0, 1.0));
    return 1.0;
}
float gp10s(float x) {
    if (x <= 0.00784314) return mix(0.00000000, 0.00392157, clamp((x - 0.00000000) / 0.00784314, 0.0, 1.0));
    if (x <= 0.03137255) return mix(0.00392157, 0.01568627, clamp((x - 0.00784314) / 0.02352941, 0.0, 1.0));
    if (x <= 0.05490196) return mix(0.01568627, 0.06078431, clamp((x - 0.03137255) / 0.02352941, 0.0, 1.0));
    if (x <= 0.09019608) return mix(0.06078431, 0.13725490, clamp((x - 0.05490196) / 0.03529412, 0.0, 1.0));
    if (x <= 0.14117647) return mix(0.13725490, 0.26078431, clamp((x - 0.09019608) / 0.05098039, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.26078431, 1.00000000, clamp((x - 0.14117647) / 0.85882353, 0.0, 1.0));
    return 1.0;
}
float gp10v(float x) {
    if (x <= 0.03921569) return mix(0.00000000, 0.01960784, clamp((x - 0.00000000) / 0.03921569, 0.0, 1.0));
    if (x <= 0.07843137) return mix(0.01960784, 0.04509804, clamp((x - 0.03921569) / 0.03921569, 0.0, 1.0));
    if (x <= 0.13333333) return mix(0.04509804, 0.08823529, clamp((x - 0.07843137) / 0.05490196, 0.0, 1.0));
    if (x <= 0.22745098) return mix(0.08823529, 0.16274510, clamp((x - 0.13333333) / 0.09411765, 0.0, 1.0));
    if (x <= 0.36470588) return mix(0.16274510, 0.27843137, clamp((x - 0.22745098) / 0.13725490, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.27843137, 1.00000000, clamp((x - 0.36470588) / 0.63529412, 0.0, 1.0));
    return 1.0;
}
float gp11s(float x) {
    if (x <= 0.55686275) return mix(0.00000000, 0.56274510, clamp((x - 0.00000000) / 0.55686275, 0.0, 1.0));
    if (x <= 0.60784314) return mix(0.56274510, 0.62941176, clamp((x - 0.55686275) / 0.05098039, 0.0, 1.0));
    if (x <= 0.65490196) return mix(0.62941176, 0.68431373, clamp((x - 0.60784314) / 0.04705882, 0.0, 1.0));
    if (x <= 0.72549020) return mix(0.68431373, 0.76274510, clamp((x - 0.65490196) / 0.07058824, 0.0, 1.0));
    if (x <= 0.85490196) return mix(0.76274510, 0.92745098, clamp((x - 0.72549020) / 0.12941176, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.92745098, 1.00000000, clamp((x - 0.85490196) / 0.14509804, 0.0, 1.0));
    return 1.0;
}
float gp11v(float x) {
    if (x <= 0.04705882) return mix(0.00000000, 0.03333333, clamp((x - 0.00000000) / 0.04705882, 0.0, 1.0));
    if (x <= 0.09019608) return mix(0.03333333, 0.06470588, clamp((x - 0.04705882) / 0.04313725, 0.0, 1.0));
    if (x <= 0.17254902) return mix(0.06470588, 0.13333333, clamp((x - 0.09019608) / 0.08235294, 0.0, 1.0));
    if (x <= 0.26666667) return mix(0.13333333, 0.22352941, clamp((x - 0.17254902) / 0.09411765, 0.0, 1.0));
    if (x <= 0.34117647) return mix(0.22352941, 0.31372549, clamp((x - 0.26666667) / 0.07450980, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.31372549, 1.00000000, clamp((x - 0.34117647) / 0.65882353, 0.0, 1.0));
    return 1.0;
}
float gp12s(float x) {
    if (x <= 0.41568627) return mix(0.00000000, 0.41176471, clamp((x - 0.00000000) / 0.41568627, 0.0, 1.0));
    if (x <= 0.48235294) return mix(0.41176471, 0.49411765, clamp((x - 0.41568627) / 0.06666667, 0.0, 1.0));
    if (x <= 0.67450980) return mix(0.49411765, 0.65294118, clamp((x - 0.48235294) / 0.19215686, 0.0, 1.0));
    if (x <= 0.88235294) return mix(0.65294118, 0.85294118, clamp((x - 0.67450980) / 0.20784314, 0.0, 1.0));
    if (x <= 0.94117647) return mix(0.85294118, 0.94705882, clamp((x - 0.88235294) / 0.05882353, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.94705882, 1.00000000, clamp((x - 0.94117647) / 0.05882353, 0.0, 1.0));
    return 1.0;
}
float gp12v(float x) {
    if (x <= 0.86666667) return mix(0.00000000, 0.84509804, clamp((x - 0.00000000) / 0.86666667, 0.0, 1.0));
    if (x <= 0.92156863) return mix(0.84509804, 0.91764706, clamp((x - 0.86666667) / 0.05490196, 0.0, 1.0));
    if (x <= 0.95294118) return mix(0.91764706, 0.96274510, clamp((x - 0.92156863) / 0.03137255, 0.0, 1.0));
    if (x <= 0.96862745) return mix(0.96274510, 0.97843137, clamp((x - 0.95294118) / 0.01568627, 0.0, 1.0));
    if (x <= 0.98039216) return mix(0.97843137, 0.99019608, clamp((x - 0.96862745) / 0.01176471, 0.0, 1.0));
    if (x <= 1.00000000) return mix(0.99019608, 1.00000000, clamp((x - 0.98039216) / 0.01960784, 0.0, 1.0));
    return 1.0;
}
vec3 gpHsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 gpRgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec4 goblinPalette(vec4 pixel, float idle) {
    if (pixel.a < 0.001) return pixel;
    vec3 rgb = pixel.rgb / pixel.a;
    vec3 hsv = gpHsv(rgb);
    float blue = smoothstep(0.12, 0.38, (rgb.b - rgb.r) / max(rgb.b, 0.02));
    float glow = blue * smoothstep(0.30, 0.65, hsv.z) * smoothstep(0.58, 0.82, rgb.g / max(rgb.b, 0.02));
    vec3 weights = vec3(1.0 - blue, blue - glow, glow);
    vec3 result = vec3(0.0);
    result += weights[0] * gpRgb(vec3(fract(hsv.x + mix(0.00000000, 0.00000000, idle)), mix(gp00s(hsv.y), gp10s(hsv.y), idle), mix(gp00v(hsv.z), gp10v(hsv.z), idle)));
    result += weights[1] * gpRgb(vec3(fract(hsv.x + mix(0.00980392, -0.00980392, idle)), mix(gp01s(hsv.y), gp11s(hsv.y), idle), mix(gp01v(hsv.z), gp11v(hsv.z), idle)));
    result += weights[2] * gpRgb(vec3(fract(hsv.x + mix(0.00000000, 0.00000000, idle)), mix(gp02s(hsv.y), gp12s(hsv.y), idle), mix(gp02v(hsv.z), gp12v(hsv.z), idle)));
    return vec4(result * pixel.a, pixel.a);
}`;

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vBodyCoord;
uniform mat3 uBodyMatrix;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
    vec2 p = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    p.x = p.x * (2.0 / uOutputTexture.x) - 1.0;
    p.y = p.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(p, 0.0, 1.0);
    vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
    vBodyCoord = (uBodyMatrix * vec3(vTextureCoord, 1.0)).xy;
}`;
const fragment = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vBodyCoord;
uniform mat3 uInputMatrix;
uniform vec4 uRegistration;
uniform vec2 uFeet;
uniform float uReaction;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uIdleSource;
uniform float uTime;
uniform float uGlow;
uniform float uHit;
uniform float uCanvas;
uniform float uNeutralReady;
uniform sampler2D uNeutral;
uniform vec4 uBlade;
uniform vec4 uAuthoredBlade;
uniform vec4 uAttackSupport;
uniform float uAttackFrame;
uniform vec2 uAttackVisor;
${GOBLIN_SHARED_PALETTE_GLSL}
${GOBLIN_REACTION_PALETTE_GLSL}
vec4 sampleRawArt(vec2 p) {
    vec2 q = p + vec2((uCanvas - 768.0) * 0.5);
    if (any(lessThan(q, vec2(0.0))) || any(greaterThan(q, vec2(uCanvas)))) return vec4(0.0);
    return texture(uTexture, (uInputMatrix * vec3(q / uCanvas, 1.0)).xy);
}
// Keep the idle blade's physical length and thickness while following the authored wrist.
vec4 sampleArt(vec2 p) {
    if (uReaction < 2.5 || uNeutralReady < 0.5) return sampleRawArt(p);
    float leg = smoothstep(440.0,665.0,p.y);
    float side = smoothstep(350.0,440.0,p.x);
    vec2 q = p + vec2(mix(uAttackSupport.x,uAttackSupport.y,side),mix(uAttackSupport.z,uAttackSupport.w,side))*leg;
    vec4 body = sampleRawArt(q);
    vec2 axis = normalize(uAuthoredBlade.zw - uAuthoredBlade.xy);
    vec2 normal = vec2(-axis.y, axis.x);
    vec2 local = q - uAuthoredBlade.xy;
    float along = dot(local, axis);
    float across = dot(local, normal);
    float originalLength = length(uAuthoredBlade.zw - uAuthoredBlade.xy);
    if (along > -4.0 && along < originalLength + 40.0 && abs(across) < 28.0) {
        vec3 rgb = body.rgb / max(body.a, 0.001);
        float bladeMask = smoothstep(0.04, 0.12, max(rgb.g, rgb.b));
        body *= 1.0-bladeMask;
    }
    axis = normalize(uBlade.zw-uBlade.xy);
    normal = vec2(-axis.y,axis.x);
    along = dot(p-uBlade.xy,axis);
    across = dot(p-uBlade.xy,normal);
    body = reactionToIdle(body, uReaction);
    vec2 idleAxis = normalize(vec2(236.0,232.0));
    vec2 idleNormal = vec2(-idleAxis.y,idleAxis.x);
    if (along >= 0.0 && along <= length(vec2(236.0,232.0)) && abs(across) < 19.0) {
        vec2 source = vec2(353.0,474.0) + idleAxis*along + idleNormal*across;
        vec4 blade = texture(uNeutral, source / vec2(3072.0,2304.0));
        vec3 rgb = blade.rgb / max(blade.a,0.001);
        // The isolated diagonal blade includes its bright white core.
        blade *= smoothstep(0.35,0.65,max(rgb.g,rgb.b));
        body = blade + body*(1.0-blade.a);
    }
    return body;
}
${GOBLIN_ICE_GLOW_GLSL}
void main() {
    vec2 p = vBodyCoord * uCanvas - vec2((uCanvas - 768.0) * 0.5);
    if (uReaction > 0.5 && uReaction < 1.5) {
        p.x = (p.x - uRegistration.y) / uRegistration.x;
        p.y -= mix(uRegistration.z, uRegistration.w, clamp((p.x - uFeet.x) / (uFeet.y - uFeet.x), 0.0, 1.0));
        if (any(lessThan(p, vec2(0.0))) || any(greaterThan(p, vec2(768.0)))) { finalColor = vec4(0.0); return; }
    }
    vec4 art = sampleArt(p);
    vec4 body = goblinPalette(uReaction > 2.5 ? art : reactionToIdle(art, uReaction), uIdleSource);
    finalColor = uGlow > 0.5 ? goblinIceFigure(body, p) : body;
    if (uReaction > 2.5) {
        vec2 segment = uBlade.zw-uBlade.xy;
        float t = clamp(dot(p-uBlade.xy,segment)/dot(segment,segment),0.0,1.0);
        float bladeLight = 1.0-smoothstep(40.0,65.0,length(p-uBlade.xy-segment*t));
        float visorLight = 1.0-smoothstep(22.0,45.0,length(p-uAttackVisor));
        finalColor = mix(body,finalColor,max(bladeLight,visorLight));
    }
    // Pin the actual boot silhouettes, not a different sole centroid in each drawing.
    // Sample the same idle pixels in destination space; the blade remains free to recoil.
    if (uHit > 0.5 && uNeutralReady > 0.5) {
        vec2 d = vBodyCoord * uCanvas - vec2((uCanvas - 768.0) * 0.5);
        float leftBoot = smoothstep(225.0, 245.0, d.x) * (1.0 - smoothstep(350.0, 365.0, d.x));
        float rightBoot = smoothstep(390.0, 410.0, d.x) * (1.0 - smoothstep(550.0, 565.0, d.x));
        float lock = max(leftBoot, rightBoot) * smoothstep(625.0, 675.0, d.y);
        vec4 neutral = texture(uNeutral, clamp(d / 768.0, vec2(0.5/768.0), vec2(767.5/768.0)) / vec2(4.0, 3.0));
        vec2 idleBlade = vec2(236.0, 232.0);
        float idleAlong = clamp(dot(d - vec2(353.0, 474.0), idleBlade) / dot(idleBlade, idleBlade), 0.0, 1.0);
        float idleBladeDistance = length(d - vec2(353.0, 474.0) - idleBlade * idleAlong);
        neutral *= smoothstep(28.0, 45.0, idleBladeDistance);
        neutral *= 1.0 - smoothstep(0.01, 0.1, ice(neutral));
        neutral = goblinPalette(neutral, 1.0);
        lock *= 1.0 - smoothstep(0.01, 0.1, ice(finalColor));
        finalColor = mix(finalColor, neutral, lock);
    }
}
`;

// Measured sole centers and contact heights in the authored hit frames.
const HIT_FEET = [
    [291, 469, 731, 717],
    [295, 506, 730, 714],
    [279, 487, 731, 717],
    [217, 460, 730, 717],
    [275, 494, 735, 716],
    [256, 479, 735, 715],
    [250, 445, 735, 720],
    [291, 469, 731, 717],
];
export function goblinHitRegistration(frame: number): number[] {
    const [left, right, ly, ry] = HIT_FEET[Math.max(0, Math.min(7, frame))];
    const scale = (475 - 302) / (right - left);
    return [scale, 302 - left * scale, 733 - ly, 712 - ry, left, right];
}
const GOBLIN_ATTACK_VISORS = {
    melee_attack: [
        [443.0, 145.0],
        [452.0, 151.0],
        [455.0, 153.0],
        [448.0, 144.0],
        [474.0, 140.0],
        [454.0, 142.0],
        [455.0, 137.0],
        [443.0, 145.0],
    ],
    melee_attack_up: [
        [443.0, 145.0],
        [489.0, 164.0],
        [459.0, 164.0],
        [485.0, 163.0],
        [409.0, 145.0],
        [476.0, 143.0],
        [462.0, 168.0],
        [443.0, 145.0],
    ],
    melee_attack_down: [
        [443.0, 145.0],
        [546.0, 217.0],
        [548.0, 249.0],
        [614.0, 262.0],
        [601.0, 249.0],
        [606.0, 246.0],
        [482.5, 177.0],
        [443.0, 145.0],
    ],
} as const;

export const GOBLIN_ATTACK_SUPPORT_OFFSETS = {
    melee_attack: [
        [0.0, 0.0, 0.0, 0.0],
        [5.0, 45.0, 1.0, 6.0],
        [-8.0, 53.0, 1.0, 3.0],
        [5.0, 55.0, 0.0, 3.0],
        [5.0, 71.0, 1.0, 3.0],
        [8.0, 58.0, 0.0, 1.0],
        [7.0, 41.0, 1.0, 2.0],
        [0.0, 0.0, 0.0, 0.0],
    ],
    melee_attack_up: [
        [0.0, 0.0, 0.0, 0.0],
        [5.0, 66.0, 0.0, 3.0],
        [4.0, 62.0, 1.0, 3.0],
        [4.0, 75.0, 0.0, 3.0],
        [7.0, 66.0, 0.0, 3.0],
        [7.5, 71.0, 0.0, 1.0],
        [6.0, 61.0, 1.0, 3.0],
        [0.0, 0.0, 0.0, 0.0],
    ],
    melee_attack_down: [
        [0.0, 0.0, 0.0, 0.0],
        [-2.5, 135.0, 1.0, 7.0],
        [-3.0, 161.5, 1.0, 7.0],
        [-3.0, 171.0, 1.0, 7.0],
        [1.0, 148.0, 1.0, 7.0],
        [-3.0, 148.0, 0.0, 6.0],
        [0.0, 62.5, 1.0, 7.0],
        [0.0, 0.0, 0.0, 0.0],
    ],
} as const;

export function goblinAttackSourcePoint(x: number, y: number, offsets: readonly number[]): [number, number] {
    const smooth = (lo: number, hi: number, v: number) => {
        const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
        return t * t * (3 - 2 * t);
    };
    const leg = smooth(440, 665, y);
    const side = smooth(350, 440, x);
    return [
        x + (offsets[0] * (1 - side) + offsets[1] * side) * leg,
        y + (offsets[2] * (1 - side) + offsets[3] * side) * leg,
    ];
}

function goblinAttackDestinationPoint(x: number, y: number, offsets: readonly number[]): [number, number] {
    let dx = x,
        dy = y;
    for (let i = 0; i < 12; i++) {
        const source = goblinAttackSourcePoint(dx, dy, offsets);
        dx += (x - source[0]) * 0.6;
        dy += (y - source[1]) * 0.6;
    }
    return [dx, dy];
}

class GoblinPaletteFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resources: {
                uNeutral: Texture.WHITE.source,
                paletteSource: {
                    uAttackVisor: { value: new Float32Array([470, 135]), type: "vec2<f32>" },
                    uAttackFrame: { value: 0, type: "f32" },
                    uAttackSupport: { value: new Float32Array(4), type: "vec4<f32>" },
                    uCanvas: { value: 768, type: "f32" },
                    uHit: { value: 0, type: "f32" },
                    uNeutralReady: { value: 0, type: "f32" },
                    uTime: { value: 0, type: "f32" },
                    uGlow: { value: 0, type: "f32" },
                    uAuthoredBlade: { value: new Float32Array([353, 474, 589, 706]), type: "vec4<f32>" },
                    uBlade: { value: new Float32Array([353, 474, 589, 706]), type: "vec4<f32>" },
                    uIdleSource: { value: 0, type: "f32" },
                    uReaction: { value: 0, type: "f32" },
                    uRegistration: { value: new Float32Array([1, 0, 0, 0]), type: "vec4<f32>" },
                    uFeet: { value: new Float32Array([302, 475]), type: "vec2<f32>" },
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                },
            },
            padding: 12,
            resolution: "inherit",
            antialias: "inherit",
        });
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.paletteSource.uniforms;
        u.uTime = performance.now() / 1000;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, GoblinPaletteFilter>();
export function syncGoblinWalkPalette(
    sprite: Sprite,
    enabled: boolean,
    idleSource = false,
    reaction?: string,
    frame = 0,
    neutral?: Texture,
): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new GoblinPaletteFilter(sprite);
        filters.set(sprite, filter);
    }
    if (!filter) return;
    filter.resources.paletteSource.uniforms.uIdleSource = idleSource ? 1 : 0;
    const u = filter.resources.paletteSource.uniforms;
    const attack = !!reaction?.startsWith("melee_attack");
    u.uCanvas = attack ? 1280 : 768;
    u.uHit = reaction === "hit" || attack ? 1 : 0;
    u.uAttackFrame = frame;
    if (attack)
        u.uAttackVisor.set(
            GOBLIN_ATTACK_VISORS[reaction as keyof typeof GOBLIN_ATTACK_VISORS][Math.max(0, Math.min(7, frame))],
        );
    const support = attack
        ? GOBLIN_ATTACK_SUPPORT_OFFSETS[reaction as keyof typeof GOBLIN_ATTACK_SUPPORT_OFFSETS][
              Math.max(0, Math.min(7, frame))
          ]
        : [0, 0, 0, 0];
    u.uAttackSupport.set(support);
    u.uNeutralReady = neutral?.width === 3072 && neutral.height === 2304 ? 1 : 0;
    if (u.uNeutralReady) filter.resources.uNeutral = neutral!.source;
    const attackMode = reaction === "melee_attack" ? 3 : reaction === "melee_attack_up" ? 4 : 5;
    u.uReaction =
        reaction === "hit" || attack
            ? frame === 0 || frame === 7
                ? 0
                : attack
                  ? attackMode
                  : 1
            : reaction === "death"
              ? 2
              : 0;
    u.uGlow = reaction === "death" ? 0 : 1;
    const poses = attack
        ? GOBLIN_ATTACK_BLADES[reaction as keyof typeof GOBLIN_ATTACK_BLADES]
        : GOBLIN_MOVING_BLADES[reaction === "hit" ? "hit" : "walk"];
    u.uBlade.set(poses[Math.max(0, Math.min(7, frame))]);
    u.uAuthoredBlade.set(u.uBlade);
    if (attack && frame > 0 && frame < 7) {
        const dx = u.uBlade[2] - u.uBlade[0];
        const dy = u.uBlade[3] - u.uBlade[1];
        const wrist = goblinAttackDestinationPoint(u.uBlade[0], u.uBlade[1], support);
        u.uBlade[0] = wrist[0];
        u.uBlade[1] = wrist[1];
        const scale = Math.hypot(236, 232) / Math.hypot(dx, dy);
        u.uBlade[2] = u.uBlade[0] + dx * scale;
        u.uBlade[3] = u.uBlade[1] + dy * scale;
    }
    const registration = goblinHitRegistration(frame);
    u.uRegistration.set(registration.slice(0, 4));
    u.uFeet.set(registration.slice(4));
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
