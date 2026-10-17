import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { CRUSADER_ATTACK_POSES, isCrusaderAttack } from "./CrusaderLabAttack";

// Blade registration measured in each 768px walk frame (guard edge to tip).
export const CRUSADER_WALK_BLADES = [
    [480, 392.5, 718, 271.1],
    [480, 384.3, 718, 267.5],
    [480, 382.0, 718, 267.2],
    [480, 383.8, 718, 270.5],
    [480, 391.6, 718, 277.0],
    [480, 399.8, 718, 283.5],
    [480, 399.1, 718, 278.8],
    [480, 390.0, 718, 269.2],
] as const;

// Authored full-body hit poses on their padded 896px canvas.
export const CRUSADER_HIT_BLADES = [
    [544, 510, 795, 387.01],
    [565.76, 507.5, 794.24, 409.2],
    [580.16, 486.6, 783.68, 322.7],
    [546.56, 526.5, 785.6, 432.6],
    [552.32, 517.3, 795.2, 392.4],
    [544, 510, 795, 387.01],
] as const;

export function crusaderFirePose(
    walkFrame = -1,
    hitFrame = -1,
    attackState?: string,
    attackFrame = -1,
): {
    blade: readonly [number, number, number, number];
    eye: readonly [number, number, number, number];
    eyesEnabled: number;
    attack: number;
    canvasSize: number;
    idleDeformation: 0 | 1;
} {
    const hit = CRUSADER_HIT_BLADES[hitFrame];
    const walk = CRUSADER_WALK_BLADES[walkFrame];
    const attack = isCrusaderAttack(attackState) ? CRUSADER_ATTACK_POSES[attackState][attackFrame] : undefined;
    return {
        blade: attack?.blade ?? hit ?? walk ?? [480, 390, 731, 267.01],
        eye: attack?.eye ?? [365, 118, 409, 127],
        eyesEnabled: attack || (!hit && !walk) ? 1 : 0,
        attack: attack ? 1 : 0,
        canvasSize: attack ? 1280 : hit ? 896 : 768,
        idleDeformation: attack || hit || walk ? 0 : 1,
    };
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
uniform float uTime;
uniform float uStrength;
uniform float uEffectAlpha;
uniform float uIdle;
uniform float uAttack;
uniform float uEyes;
uniform vec4 uEye;
uniform float uCanvasSize;
uniform vec4 uBlade;
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec4 h = fract(sin(vec4(dot(i, vec2(127.1,311.7)),
        dot(i+vec2(1,0), vec2(127.1,311.7)),
        dot(i+vec2(0,1), vec2(127.1,311.7)),
        dot(i+vec2(1,1), vec2(127.1,311.7)))) * 43758.5453);
    return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
}
float turbulence(vec2 p) {
    return 0.57*noise(p)+0.28*noise(p*2.03)+0.15*noise(p*4.07);
}
vec2 offset(vec2 p) {
    // Boots stay planted; the torso breathes without changing its silhouette.
    float upper = 1.0-smoothstep(440.0,700.0,p.y);
    vec2 sway = upper*vec2(3.5*sin(uTime*1.4),1.3*sin(uTime*2.8));
    float loose = clamp((330.0-p.x)/300.0,0.0,1.0);
    float cape = smoothstep(220.0,300.0,p.y)*(1.0-smoothstep(640.0,695.0,p.y));
    float phase = 6.2831853*1.15*loose-2.6*uTime;
    vec2 cloth = cape*pow(loose,2.0)*vec2(15.0*sin(phase),21.0*cos(phase));
    float plume = (1.0-smoothstep(145.0,175.0,p.y));
    float tip = clamp((348.0-p.x)/120.0,0.0,1.0);
    vec2 hair = plume*tip*tip*vec2(7.0*sin(7.22*tip-2.6*uTime),10.0*cos(7.22*tip-2.6*uTime));
    return (sway+cloth+hair)*uStrength*uIdle;
}
void main() {
    vec2 destination = vBodyCoord*uCanvasSize;
    vec2 p = destination;
    // Inverse warp samples the figure once, avoiding doubled limbs and contours.
    for (int i=0;i<5;i++) p=destination-offset(p);
    vec2 uv = (uInputMatrix*vec3(p/uCanvasSize,1.0)).xy;
    vec4 body = texture(uTexture,clamp(uv,uInputClamp.xy,uInputClamp.zw));
    body *= step(0.0,p.x)*step(p.x,uCanvasSize)*step(0.0,p.y)*step(p.y,uCanvasSize);

    // Fire rises vertically from the blade; the guard and hand remain clear.
    float along = (p.x-uBlade.x)/(uBlade.z-uBlade.x);
    float height = mix(uBlade.y,uBlade.w,along)-p.y;
    if (uAttack > 0.5) {
        vec2 bladeVector = uBlade.zw-uBlade.xy;
        float bladeLength = max(length(bladeVector),1.0);
        vec2 upward = vec2(bladeVector.y,-bladeVector.x)/bladeLength;
        if (upward.y > 0.0) upward = -upward;
        along = dot(p-uBlade.xy,bladeVector)/(bladeLength*bladeLength);
        height = dot(p-uBlade.xy,upward);
    }
    float edge = smoothstep(0.0,0.07,along)*(1.0-smoothstep(0.91,1.02,along));
    vec2 flow = vec2(p.x*0.055,height*0.058+uTime*3.4);
    float n = turbulence(flow+vec2(0.28*sin(height*0.09-uTime*3.0),0.0));
    float tongue = 26.0+112.0*pow(n,2.0);
    float flame = (1.0-smoothstep(tongue*0.48,tongue,height))
        *smoothstep(-9.0,2.0,height)*edge;
    float core = (1.0-smoothstep(6.0,24.0,height))*edge*smoothstep(-7.0,0.0,height);
    vec3 fireColor = mix(vec3(1.0,0.12,0.006),vec3(1.0,0.65,0.06),clamp(flame,0.0,1.0));
    fireColor = mix(fireColor,vec3(1.0,0.98,0.82),core);
    float alpha = clamp(flame*0.93+core*0.4,0.0,1.0)*uStrength*uEffectAlpha;
    float flicker = 0.92+0.08*sin(uTime*7.0);
    float glow = exp(-abs(height)*0.035)*edge*0.48*uStrength*uEffectAlpha*flicker;
    vec4 fire = vec4(fireColor*alpha,alpha);
    // A visible warm halo extends outside the blade, with a pale hot core.
    vec4 halo = vec4(vec3(1.0,0.40,0.035)*glow,glow);
    vec4 litBody = body+halo*(1.0-body.a);
    litBody.rgb += vec3(1.0,0.46,0.055)*glow*body.a;
    finalColor = fire+litBody*(1.0-alpha);

    // Follow the eye slit in canonical artwork coordinates, including torso sway.
    vec2 eyeStart = uEye.xy;
    vec2 eyeVector = uEye.zw-uEye.xy;
    float eyeAlong = clamp(dot(p-eyeStart,eyeVector)/dot(eyeVector,eyeVector),0.0,1.0);
    float eyeDistance = length(p-eyeStart-eyeAlong*eyeVector);
    float eyeCore = (1.0-smoothstep(1.2,3.9,eyeDistance))*uStrength*uEffectAlpha;
    float eyeGlow = exp(-eyeDistance*0.16)*0.65*uStrength*uEffectAlpha;
    vec3 eyeColor = mix(vec3(1.0,0.16,0.012),vec3(1.0,0.91,0.46),eyeCore);
    float eyeAlpha = clamp(eyeCore+eyeGlow*0.42,0.0,1.0)*uEyes;
    finalColor = vec4(eyeColor*eyeAlpha,eyeAlpha)+finalColor*(1.0-eyeAlpha);
    finalColor.rgb += vec3(1.0,0.20,0.015)*eyeGlow*body.a*uEyes;

}`;

/** Lab idle over the canonical Crusader art; no replacement atlas or palette. */
export class CrusaderLabIdleFilter extends Filter {
    private activatedAtMs: number | undefined;
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 4,
            resources: {
                crusaderIdle: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uTime: { value: 0, type: "f32" },
                    uStrength: { value: 0, type: "f32" },
                    uEffectAlpha: { value: 1, type: "f32" },
                    uIdle: { value: 1, type: "f32" },
                    uAttack: { value: 0, type: "f32" },
                    uEyes: { value: 1, type: "f32" },
                    uEye: { value: new Float32Array([365, 118, 409, 127]), type: "vec4<f32>" },
                    uCanvasSize: { value: 768, type: "f32" },
                    uBlade: { value: new Float32Array([480, 390, 731, 267.01]), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(nowMs: number, walkFrame = -1, hitFrame = -1, attackState?: string, attackFrame = -1): void {
        const now = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0;
        this.activatedAtMs ??= now;
        const ramp = Math.max(0, Math.min(1, (now - this.activatedAtMs) / 450));
        const u = this.resources.crusaderIdle.uniforms;
        const pose = crusaderFirePose(walkFrame, hitFrame, attackState, attackFrame);
        u.uAttack = pose.attack;
        u.uEyes = pose.eyesEnabled;
        u.uEye.set(pose.eye);
        u.uIdle = pose.idleDeformation;
        u.uCanvasSize = pose.canvasSize;
        u.uBlade.set(pose.blade);
        // Clock is independent of sprite-frame timing and the one-second idle hold.
        u.uTime = (now - this.activatedAtMs) / 1000;
        u.uStrength = ramp * ramp * (3 - 2 * ramp);
    }
    public pause(): void {
        this.activatedAtMs = undefined;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.crusaderIdle.uniforms;
        u.uEffectAlpha = this.sprite.getGlobalAlpha();
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, CrusaderLabIdleFilter>();

export function syncCrusaderLabIdle(
    sprite: Sprite,
    enabled: boolean,
    nowMs: number,
    walkFrame = -1,
    hitFrame = -1,
    attackState?: string,
    attackFrame = -1,
): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new CrusaderLabIdleFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => {
            owned.destroy();
            filters.delete(sprite);
        });
    }
    if (!filter) return;
    if (enabled) filter.update(nowMs, walkFrame, hitFrame, attackState, attackFrame);
    else filter.pause();
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
