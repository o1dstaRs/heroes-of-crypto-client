import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { EFREET_LAB_CLAP_START_FRAME } from "./EfreetLabIdleTiming";
import { EFREET_LAB_CAST_FIRE_BOUNDS, EFREET_LAB_MELEE_FIRE_BOUNDS } from "./EfreetLabMeleeFireBounds";

// Outer hand-fire boundaries and palm heights in the registered 512×768 hit cels.
// They follow the recoil, keeping heat, turbulence, rising tongues and glow on both flames.
const idleHandFireBounds = [170, 336, 352, 370];
const hitHandFireBounds = [
    idleHandFireBounds,
    [182, 346, 350, 360],
    [220, 364, 332, 334],
    [214, 368, 320, 338],
    [178, 336, 358, 360],
    [174, 336, 360, 374],
    [172, 338, 360, 374],
    idleHandFireBounds,
];
// Width of the largest connected opaque silhouette in each hit cel, excluding sparks.
// Match the 384px neutral silhouette around the shared belt landmark without moving its anchor.
const hitBodyWidths = [384, 335, 319, 289, 341, 336, 334, 384];

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vBodyCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uBodyMatrix;
void main() {
    vec2 p = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    gl_Position = vec4(p.x * 2.0 / uOutputTexture.x - 1.0,
        p.y * 2.0 * uOutputTexture.z / uOutputTexture.y - uOutputTexture.z, 0.0, 1.0);
    vBodyCoord = (uBodyMatrix * vec3(aPosition * uOutputFrame.zw * uInputSize.zw, 1.0)).xy;
}`;

// Same ascending two-scale turbulence, heat palette and rising envelope as Nightmare's lab fire.
// Geometry masks restrict combustion to the two hand flames and the lower fire body.
export const EFREET_FIRE_GLSL = /* glsl */ `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uPoseTexture;
uniform vec4 uPoseFrame;
uniform float uTime;
uniform float uAlpha;
uniform float uClapping;
uniform float uMoving;
uniform float uWindPhase;
uniform float uAuthoredReaction;
uniform vec4 uHandFireBounds;
uniform float uHitWidthScale;
uniform vec4 uIdleDebrisBounds;
uniform vec2 uPoseSize;
uniform vec2 uCanvasOffset;
uniform float uMeleeFire;
uniform float uCastFire;
uniform vec4 uMeleeFireA;
uniform vec4 uMeleeFireB;
uniform vec4 uMeleeFireC;
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec4 h = fract(sin(vec4(dot(i, vec2(127.1,311.7)), dot(i+vec2(1,0),vec2(127.1,311.7)),
        dot(i+vec2(0,1),vec2(127.1,311.7)), dot(i+vec2(1,1),vec2(127.1,311.7)))) * 43758.5453);
    return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
}
vec4 sampleBody(vec2 p) {
    vec2 canvasPoint=p+uCanvasOffset;
    if (any(lessThan(canvasPoint,vec2(0.0))) || any(greaterThanEqual(canvasPoint,uPoseSize))) return vec4(0.0);
    // Two repeated idle cels contain a detached tail-tip fragment above the hair.
    // Exclude its source rectangle before every combustion sample; clap fire is intact.
    if (p.x>=uIdleDebrisBounds.x && p.y>=uIdleDebrisBounds.y
        && p.x<uIdleDebrisBounds.z && p.y<uIdleDebrisBounds.w) return vec4(0.0);
    vec2 uv=clamp(canvasPoint,vec2(0.5),uPoseSize-vec2(0.5))/uPoseSize;
    return texture(uPoseTexture,uPoseFrame.xy+uv*uPoseFrame.zw)*uAlpha;
}
float fireRect(vec2 p,vec4 bounds) {
    return smoothstep(bounds.x-6.0,bounds.x,p.x)*(1.0-smoothstep(bounds.z,bounds.z+6.0,p.x))
        *smoothstep(bounds.y-6.0,bounds.y,p.y)*(1.0-smoothstep(bounds.w,bounds.w+6.0,p.y))
        *step(1.0,bounds.z-bounds.x);
}
float region(vec2 p) {
    float left = (1.0-smoothstep(uHandFireBounds.x-27.0,uHandFireBounds.x,p.x))
        *(1.0-smoothstep(uHandFireBounds.y-24.0,uHandFireBounds.y,p.y));
    float right = smoothstep(uHandFireBounds.z,uHandFireBounds.z+27.0,p.x)
        *(1.0-smoothstep(uHandFireBounds.w-27.0,uHandFireBounds.w,p.y));
    float lower = smoothstep(410.0,435.0,p.y);
    if (uMeleeFire>0.5) {
        float authored=max(lower,max(fireRect(p,uMeleeFireA),
            max(fireRect(p,uMeleeFireB),fireRect(p,uMeleeFireC))));
        // Side jets rise beside the head; warm facial skin must retain its original pigment.
        float head=smoothstep(242.0,258.0,p.x)*(1.0-smoothstep(345.0,361.0,p.x))
            *(1.0-smoothstep(278.0,293.0,p.y));
        return authored*(1.0-head*smoothstep(160.0,180.0,p.y));
    }
    return max(max(left,right),lower);
}
float firePigment(vec4 c) {
    vec3 rgb = c.rgb/max(c.a,0.001);
    return smoothstep(0.25,0.55,rgb.r-rgb.b)*smoothstep(0.12,0.33,rgb.g)*c.a;
}
vec2 idleOffset(vec2 p) {
    float breath = sin(uTime * 2.1);
    // Extend only the bottom of the flame: 41.6 native pixels become 10% of the
    // calibrated 703px figure. The waist, chest, head and hands keep their size.
    float extension = 41.6 * smoothstep(480.0,600.0,p.y);
    float upper = 1.0-smoothstep(400.0,595.0,p.y);
    vec2 offset = vec2(0.0,extension-5.0*breath*upper);
    // Flame roots remain on the palms; only the two independent idle flames shrink.
    float leftFlame=(1.0-smoothstep(145.0,166.0,p.x))*(1.0-smoothstep(296.0,316.0,p.y));
    float rightFlame=smoothstep(353.0,374.0,p.x)*(1.0-smoothstep(330.0,350.0,p.y));
    offset -= (1.0-uClapping)*0.2*(leftFlame*(p-vec2(105.0,316.0))
        +rightFlame*(p-vec2(420.0,350.0)));
    // Keep torso width constant; shoulders and elbows trail vertical breathing.
    float arms = max(1.0-smoothstep(150.0,205.0,p.x),smoothstep(335.0,390.0,p.x))
        *smoothstep(260.0,290.0,p.y)*(1.0-smoothstep(365.0,390.0,p.y));
    offset.y += 2.0*sin(uTime*2.1-0.55)*arms;
    // Multiple travelling waves grow toward loose hair tips, leaving the roots and face fixed.
    float hair = smoothstep(130.0,155.0,p.x)*(1.0-smoothstep(262.0,293.0,p.x))
        *smoothstep(155.0,180.0,p.y)
        *(1.0-smoothstep(245.0+max(0.0,220.0-p.x)*0.25,
            266.0+max(0.0,220.0-p.x)*0.25,p.y));
    float loose = clamp((295.0-p.x)/145.0,0.0,1.0);
    float wave = sin((295.0-p.x)*0.038-uTime*4.1)
        +0.4*sin((295.0-p.x)*0.076-uTime*6.3+1.2);
    offset += hair*loose*vec2(3.5*sin(uTime*3.4-p.x*0.027),9.0*wave);
    // Belt stays attached; skirt panels and separate streamers below it catch the wind.
    float cloth = smoothstep(378.0,410.0,p.y)*(1.0-smoothstep(475.0,510.0,p.y));
    float side = max(1.0-smoothstep(185.0,235.0,p.x),smoothstep(320.0,360.0,p.x));
    float skirt = 1.0-smoothstep(423.0,449.0,p.y);
    float fabric = cloth*max(side,skirt);
    float flutter = sin(p.y*0.051+p.x*0.024-uTime*4.6)
        +0.35*sin(p.y*0.103-uTime*7.2);
    offset += fabric*vec2(11.0*flutter,6.0*sin(p.x*0.043-uTime*4.0));
    // Local artwork faces right. Mirroring the sprite also mirrors its wake, so
    // hair, skirt and combustion always stream behind the movement facing.
    float drift = uMoving;
    float wake = sin(uWindPhase-p.y*0.026);
    float tail = smoothstep(385.0,600.0,p.y);
    offset.x += drift*(8.0*upper-tail*(104.0+12.0*wake));
    offset += drift*hair*loose*vec2(-56.0,8.0*sin(uWindPhase-p.x*0.05));
    offset += drift*fabric*vec2(-22.0+7.0*sin(uWindPhase-p.y*0.05),
        4.0*sin(uWindPhase-p.x*0.043));
    float leftHeight=clamp((316.0-p.y)/110.0,0.0,1.0);
    float rightHeight=clamp((350.0-p.y)/110.0,0.0,1.0);
    offset.x -= drift*40.0*(leftFlame*leftHeight+rightFlame*rightHeight);
    return offset;
}
void main() {
    vec2 destination=vBodyCoord*uPoseSize-uCanvasOffset;
    // Map the complete connected figure and its combustion together. Height and
    // the registered belt stay fixed; recoil cels must not squeeze the figure.
    destination.x=293.5+(destination.x-293.5)/uHitWidthScale;
    vec2 p=destination;
    // Inverse mapping moves connected pixels together and avoids layered cut seams.
    for (int i=0;i<16;i++) p=mix(p,destination-(1.0-uAuthoredReaction)*idleOffset(p),0.5);
    vec2 flow=vec2(p.x*0.065,(p.y+uTime*68.0)*0.037);
    float curl=noise(flow)*0.65+noise(flow*2.03+vec2(4.1,uTime*0.7))*0.35;
    float mask=region(p);
    vec2 flameSource=p+mask*vec2((curl-0.5)*6.0,sin(p.x*0.07+uTime*4.3)*2.0);
    vec4 body=sampleBody(flameSource);
    float pulse=smoothstep(0.18,0.8,curl);
    float pigment=firePigment(body)/max(body.a,0.001);
    float heat=clamp(pulse*0.65+body.r/max(body.a,0.001)*0.55,0.0,1.0);
    vec3 core=mix(vec3(1.0,0.19,0.008),vec3(1.0,0.91,0.42),heat*heat);
    body.rgb=mix(body.rgb,core*body.a,mask*pigment*0.96);
    vec2 risePoint=flameSource+vec2((curl-0.5)*15.0,8.0+pulse*24.0);
    float lick=mask*region(risePoint)*firePigment(sampleBody(risePoint))*(0.45+pulse*0.5);
    float glow=mask*(firePigment(sampleBody(p+vec2(9.0,7.0)))
        +firePigment(sampleBody(p+vec2(-9.0,7.0)))+firePigment(sampleBody(p+vec2(0.0,15.0))))*0.13;
    float flameAlpha=clamp(lick+glow,0.0,uAlpha)*(1.0-body.a);
    vec3 flameColor=mix(vec3(1.0,0.16,0.006),vec3(1.0,0.65,0.075),pulse);
    float alpha=min(body.a+flameAlpha,uAlpha);
    finalColor=vec4(min(body.rgb+flameColor*flameAlpha,vec3(alpha)),alpha);
}`;

class EfreetIdleFireFilter extends Filter {
    private lastUpdateMs?: number;
    private movementStrength = 0;
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment: EFREET_FIRE_GLSL }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 32,
            resources: {
                uPoseTexture: sprite.texture.source,
                fire: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uPoseFrame: { value: [0, 0, 1, 1], type: "vec4<f32>" },
                    uTime: { value: 0, type: "f32" },
                    uAlpha: { value: 1, type: "f32" },
                    uClapping: { value: 0, type: "f32" },
                    uMoving: { value: 0, type: "f32" },
                    uWindPhase: { value: 0, type: "f32" },
                    uAuthoredReaction: { value: 0, type: "f32" },
                    uHandFireBounds: { value: idleHandFireBounds, type: "vec4<f32>" },
                    uHitWidthScale: { value: 1, type: "f32" },
                    uIdleDebrisBounds: { value: [0, 0, 0, 0], type: "vec4<f32>" },
                    uPoseSize: { value: [512, 768], type: "vec2<f32>" },
                    uCanvasOffset: { value: [0, 0], type: "vec2<f32>" },
                    uMeleeFire: { value: 0, type: "f32" },
                    uCastFire: { value: 0, type: "f32" },
                    uMeleeFireA: { value: [0, 0, 0, 0], type: "vec4<f32>" },
                    uMeleeFireB: { value: [0, 0, 0, 0], type: "vec4<f32>" },
                    uMeleeFireC: { value: [0, 0, 0, 0], type: "vec4<f32>" },
                },
            },
        });
    }
    public update(
        nowMs: number,
        frameIndex: number,
        moving: boolean,
        windPhase: number,
        authoredReaction: boolean,
        authoredState: string,
    ): void {
        this.resources.fire.uniforms.uAuthoredReaction = authoredReaction ? 1 : 0;
        this.resources.fire.uniforms.uHandFireBounds = authoredReaction
            ? (hitHandFireBounds[frameIndex] ?? idleHandFireBounds)
            : idleHandFireBounds;
        this.resources.fire.uniforms.uHitWidthScale =
            authoredReaction && authoredState === "hit" ? 384 / (hitBodyWidths[frameIndex] ?? 384) : 1;
        const meleeBounds = authoredReaction
            ? authoredState === "cast"
                ? EFREET_LAB_CAST_FIRE_BOUNDS[frameIndex]
                : EFREET_LAB_MELEE_FIRE_BOUNDS[authoredState]?.[frameIndex]
            : undefined;
        this.resources.fire.uniforms.uMeleeFire = meleeBounds ? 1 : 0;
        this.resources.fire.uniforms.uCastFire = meleeBounds && authoredState === "cast" ? 1 : 0;
        this.resources.fire.uniforms.uMeleeFireA = meleeBounds?.[0] ?? [0, 0, 0, 0];
        this.resources.fire.uniforms.uMeleeFireB = meleeBounds?.[1] ?? [0, 0, 0, 0];
        this.resources.fire.uniforms.uMeleeFireC = meleeBounds?.[2] ?? [0, 0, 0, 0];
        this.resources.fire.uniforms.uIdleDebrisBounds =
            !authoredReaction && frameIndex < EFREET_LAB_CLAP_START_FRAME && [6, 7].includes(frameIndex % 12)
                ? [253, 150, 284, 177]
                : [0, 0, 0, 0];
        const dt = this.lastUpdateMs === undefined ? 0 : Math.max(0, nowMs - this.lastUpdateMs);
        this.lastUpdateMs = nowMs;
        this.movementStrength += ((moving ? 1 : 0) - this.movementStrength) * (1 - Math.exp(-dt / 140));
        this.resources.fire.uniforms.uMoving = this.movementStrength;
        this.resources.fire.uniforms.uWindPhase = windPhase;
        this.resources.fire.uniforms.uTime = nowMs / 1000;
        this.resources.fire.uniforms.uClapping = !moving && frameIndex >= EFREET_LAB_CLAP_START_FRAME ? 1 : 0;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.fire.uniforms;
        const texture = this.sprite.texture;
        const { x, y, width, height } = texture.frame;
        u.uPoseSize = [width, height];
        u.uCanvasOffset = [(width - 512) / 2, (height - 768) / 2];
        this.resources.uPoseTexture = texture.source;
        u.uPoseFrame = [
            x / texture.source.width,
            y / texture.source.height,
            width / texture.source.width,
            height / texture.source.height,
        ];
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uAlpha = this.sprite.getGlobalAlpha();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, EfreetIdleFireFilter>();
export function syncEfreetLabIdleFire(
    sprite: Sprite,
    enabled: boolean,
    nowMs: number,
    frameIndex = 0,
    moving = false,
    windPhase = 0,
    authoredReaction = false,
    authoredState = "hit",
): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new EfreetIdleFireFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(nowMs, frameIndex, moving, windPhase, authoredReaction, authoredState);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...remaining, filter] : remaining.length ? remaining : null;
}
