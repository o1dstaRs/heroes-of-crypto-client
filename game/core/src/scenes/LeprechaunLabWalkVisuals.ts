import { Filter, GlProgram, Matrix, type Sprite, type Texture } from "pixi.js";
import { leprechaunIdleFrames, leprechaunIdleMotion } from "./LeprechaunLabIdle";
import {
    LEPRECHAUN_IDLE_ARMS,
    LEPRECHAUN_IDLE_HANDS,
    LEPRECHAUN_IDLE_SLEEVES,
    LEPRECHAUN_IDLE_UPPER_SLEEVES,
} from "./LeprechaunIdlePalette";

export const LEPRECHAUN_HEAD_SPEED = 0.7 * 0.6;
const CYCLE_CELLS = 1.3;

// Width and shoulder/hip center in normalized 1024px atlas coordinates. The
// generated recoil poses inflate the coat and thighs; correct only that region.
const HIT_BODY_SHAPE = [
    [1, 512, 512],
    [0.96, 520, 512],
    [0.93, 553, 536],
    [0.9, 578, 552],
    [0.93, 553, 536],
    [0.97, 526, 512],
    [0.99, 512, 512],
    [1, 512, 512],
] as const;

// Separate trouser axes (left/right at thigh, then knee). Recoil bends the legs,
// but must not inflate either leg. Boot positions remain outside this correction.
const HIT_LEG_AXES = [
    [445, 598, 410, 617],
    [480, 610, 430, 643],
    [510, 650, 447, 672],
    [568, 706, 488, 730],
    [510, 650, 447, 672],
    [463, 594, 412, 625],
    [445, 598, 410, 617],
    [445, 598, 410, 617],
] as const;
const HIT_LEG_WIDTH = [1, 0.88, 0.82, 0.8, 0.82, 0.9, 0.96, 1] as const;

/** Head phase is continuous across footstep loops and path corners. */
export function leprechaunHeadFrame(distanceCells: number): number {
    const distance = Number.isFinite(distanceCells) ? Math.max(0, distanceCells) : 0;
    return Math.floor((distance / CYCLE_CELLS) * 8 * LEPRECHAUN_HEAD_SPEED + 1e-9) % 8;
}

// Collar attachment points in the approved 1024px frames. Only the head/neck region
// samples a different pose; the cane, shoulders and legs keep the original gait.
export const LEPRECHAUN_NECK_ANCHORS = [
    [530, 302],
    [556, 314],
    [561, 305],
    [554, 287],
    [540, 309],
    [516, 314],
    [503, 300],
    [509, 296],
] as const;

// RGB midpoint between the actual dark battlefield v2 figure and the previous
// bright walk grade. Both states converge on this same cloth palette.
export const LEPRECHAUN_CLOTH_TARGET = {
    hue: [105.48732, 125.9672, 137.97771],
    saturation: 0.68314761,
    value: 0.23904902,
} as const;
export const LEPRECHAUN_IDLE_CLOTH_GRADE = [84.000107, 0.319153, 1.6475] as const;
const IDLE_HUE_TAILS = [78.461632, 100.000069] as const;
// Source median hue (degrees), saturation exponent and value gain per pose.
export const LEPRECHAUN_CLOTH_GRADES = [
    [128.823517, 0.97066, 0.923598],
    [105.882378, 0.596238, 0.999303],
    [109.411781, 0.497793, 1.108318],
    [111.000015, 0.690211, 1.06943],
    [122.790695, 0.843045, 0.896434],
    [127.999992, 0.973345, 0.883442],
    [131.666656, 1.296107, 0.883442],
    [126.976738, 0.633405, 0.983185],
] as const;
const CLOTH_HUE_TAILS = [
    [97.391315, 135.27272],
    [85.714355, 123.829788],
    [86.40004, 127.447348],
    [90.000046, 128.571426],
    [94.615417, 132.27272],
    [98.644081, 138.987335],
    [103.714294, 141.08107],
    [95.454575, 134.399979],
] as const;

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vBodyCoord;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uBodyMatrix;
void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vec2 uv = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vBodyCoord = (uBodyMatrix * vec3(uv, 1.0)).xy;
}
`;
const fragment = /* glsl */ `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uAtlas;
uniform vec4 uBodyRect;
uniform vec4 uHeadRect;
uniform vec2 uBodyNeck;
uniform vec2 uHeadNeck;
uniform vec3 uBodyGrade;
uniform vec3 uHeadGrade;
uniform vec2 uBodyHue;
uniform vec2 uHeadHue;
uniform vec4 uTintAlpha;
uniform float uWalking;
uniform vec3 uIdleMotion;
uniform vec3 uHitShape;
uniform vec4 uHitLegAxes;
uniform float uHitLegWidth;
uniform vec4 uIdleHand;
uniform vec3 uIdleSkinGain;
uniform vec4 uIdleArm;
uniform vec3 uIdleSleeve;
uniform vec3 uIdleUpperSleeve;
uniform vec4 uIdleHat;
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg,K.wz), vec4(c.gb,K.xy), step(c.b,c.g));
    vec4 q = mix(vec4(p.xyw,c.r), vec4(c.r,p.yzx), step(p.x,c.r));
    float d = q.x-min(q.w,q.y);
    return vec3(abs(q.z+(q.w-q.y)/(6.0*d+1e-10)), d/(q.x+1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx+vec3(0.0,2.0/3.0,1.0/3.0))*6.0-3.0);
    return c.z*mix(vec3(1.0),clamp(p-1.0,0.0,1.0),c.y);
}
float armDistance(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b-a;
    return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0));
}
vec3 idleArmColor(vec3 rgb, vec2 point) {
    if (uIdleHand.z < 0.5) return rgb;
    vec3 hsv = rgb2hsv(rgb);
    float h = hsv.x*360.0;
    float hand = 1.0-smoothstep(0.8,1.15,length((point-uIdleHand.xy)/vec2(48.0,53.0)));
    float skin = smoothstep(2.0,8.0,h)*(1.0-smoothstep(31.0,39.0,h))*smoothstep(0.15,0.3,hsv.y);
    rgb = mix(rgb,min(vec3(1.0),rgb*uIdleSkinGain),hand*skin);
    float distance = min(armDistance(point,vec2(610.0,351.0),uIdleArm.zw),
        armDistance(point,uIdleArm.zw,uIdleArm.xy));
    float sleeve = (1.0-smoothstep(25.0,39.0,distance))
        *smoothstep(53.0,62.0,h)*(1.0-smoothstep(170.0,185.0,h))*smoothstep(0.06,0.14,hsv.y);
    vec3 cloth = vec3((h+uIdleSleeve.x)/360.0,pow(hsv.y,uIdleSleeve.y),min(1.0,hsv.z*uIdleSleeve.z));
    rgb = mix(rgb,hsv2rgb(cloth),sleeve);
    float upper = (1.0-smoothstep(26.0,42.0,armDistance(point,vec2(628.0,351.0),uIdleArm.zw)))
        *smoothstep(38.0,62.0,length(point-uIdleArm.xy))
        *smoothstep(22.0,32.0,h)*(1.0-smoothstep(170.0,185.0,h))
        *smoothstep(0.06,0.14,hsv.y)*(1.0-smoothstep(0.6,0.8,hsv.y));
    vec3 upperCloth = vec3(min(110.0,h+uIdleUpperSleeve.x)/360.0,
        pow(hsv.y,uIdleUpperSleeve.y),min(1.0,hsv.z*pow(uIdleUpperSleeve.z,0.65)));
    return mix(rgb,hsv2rgb(upperCloth),upper);
}
vec3 idleHatColor(vec3 rgb, vec2 p) {
    if (uIdleHat.x < 1.0) return rgb;
    vec3 hsv = rgb2hsv(rgb);
    float h = hsv.x*360.0;
    float crown = smoothstep(448.0,464.0,p.x)*(1.0-smoothstep(595.0,616.0,p.x))
        *smoothstep(uIdleHat.x-4.0,uIdleHat.x+6.0,p.y)
        *(1.0-smoothstep(uIdleHat.x+78.0,uIdleHat.x+100.0,p.y));
    // Exclude the leather band, skin, and saturated gold fittings.
    float cloth = smoothstep(34.0,43.0,h)*(1.0-smoothstep(160.0,180.0,h))
        *smoothstep(0.05,0.12,hsv.y)*(1.0-smoothstep(0.45,0.6,hsv.y));
    vec3 corrected = vec3((h+uIdleHat.y)/360.0,pow(hsv.y,uIdleHat.z),min(1.0,hsv.z*pow(uIdleHat.w,0.4)));
    return mix(rgb,hsv2rgb(corrected),crown*cloth);
}
float idleTorsoMask(vec2 p) {
    if (uIdleHand.z < 0.5) return 0.0;
    // The lapel and coat tail stay on the resting texture. Only the connected
    // arm and hand can occlude them; a moving pose must not replace this fabric.
    float right = p.y < 480.0 ? mix(600.0,596.0,clamp((p.y-350.0)/130.0,0.0,1.0))
        : p.y < 570.0 ? mix(596.0,608.0,(p.y-480.0)/90.0)
        : mix(608.0,670.0,clamp((p.y-570.0)/140.0,0.0,1.0));
    float torso = smoothstep(542.0,552.0,p.x)*(1.0-smoothstep(right-2.0,right+2.0,p.x))
        *smoothstep(326.0,345.0,p.y)*(1.0-smoothstep(697.0,710.0,p.y));
    float arm = min(armDistance(p,vec2(610.0,351.0),uIdleArm.zw),
        armDistance(p,uIdleArm.zw,uIdleArm.xy));
    float clearArm = smoothstep(28.0,40.0,arm);
    float clearHand = smoothstep(0.85,1.1,length((p-uIdleHand.xy)/vec2(48.0,53.0)));
    return torso*clearArm*clearHand;
}
vec4 pose(vec2 point, vec4 rect, vec3 grade, vec2 hueTails) {
    if (any(lessThan(point,vec2(0.0))) || any(greaterThan(point,vec2(1024.0)))) return vec4(0.0);
    vec4 raw = texture(uAtlas,rect.xy+clamp(point,vec2(0.5),vec2(1023.5))/1024.0*rect.zw);
    if (raw.a < 0.00001) return vec4(0.0);
    float torso = idleTorsoMask(point);
    // Pose zero is the unmodified base figure in the top-left atlas cell.
    vec4 resting = texture(uAtlas,clamp(point,vec2(0.5),vec2(1023.5))/vec2(4096.0,3072.0));
    vec3 rgb = mix(idleArmColor(idleHatColor(raw.rgb/raw.a,point),point),resting.rgb/max(resting.a,0.00001),torso);
    vec3 hsv = rgb2hsv(rgb);
    float h = hsv.x*360.0;
    float cloth = smoothstep(60.0,75.0,h)*(1.0-smoothstep(175.0,195.0,h))
        *smoothstep(0.07,0.15,hsv.y);
    const vec3 targetHue = vec3(${LEPRECHAUN_CLOTH_TARGET.hue.join(",")});
    float median = grade.x;
    float hue = h < median ? targetHue.y+(h-median)*(targetHue.y-targetHue.x)/(median-hueTails.x)
        : targetHue.y+(h-median)*(targetHue.z-targetHue.y)/(hueTails.y-median);
    // Keep olive hat highlights and deep coat greens within one shared cloth hue.
    hue = mix(targetHue.y,hue,0.45);
    vec3 corrected = vec3(clamp(hue,85.0,180.0)/360.0,pow(hsv.y,grade.y),min(1.0,hsv.z*grade.z));
    rgb = mix(rgb,hsv2rgb(corrected),cloth);
    return vec4(rgb*raw.a,raw.a);
}
void main(void) {
    vec2 point = vBodyCoord*1024.0;
    float hitBody = smoothstep(210.0,320.0,point.y)*(1.0-smoothstep(720.0,860.0,point.y));
    float hitCenter = mix(uHitShape.y,uHitShape.z,clamp((point.y-320.0)/400.0,0.0,1.0));
    float hitCore = 1.0-smoothstep(180.0,290.0,abs(point.x-hitCenter));
    // Inverse UV mapping narrows the torso, while head, boots and ground stay fixed.
    point.x = hitCenter+(point.x-hitCenter)/mix(1.0,uHitShape.x,hitBody*hitCore);
    vec2 legAxes = mix(uHitLegAxes.xy,uHitLegAxes.zw,clamp((point.y-600.0)/200.0,0.0,1.0));
    float legMiddle = (legAxes.x+legAxes.y)*0.5;
    float legCenter = point.x < legMiddle ? legAxes.x : legAxes.y;
    float legRegion = smoothstep(555.0,665.0,point.y)*(1.0-smoothstep(795.0,880.0,point.y));
    float legEdge = (1.0-smoothstep(55.0,110.0,abs(point.x-legCenter)))
        *smoothstep(0.0,22.0,abs(point.x-legMiddle));
    point.x = legCenter+(point.x-legCenter)/mix(1.0,uHitLegWidth,legRegion*legEdge);
    if (uIdleMotion.z > 0.5) {
        float upper = 1.0-smoothstep(500.0,850.0,point.y);
        point -= uIdleMotion.xy*upper;
        // Idle artwork has 128px transparent padding around the original 768px
        // battlefield canvas, allowing the raised hat to clear the original bounds.
        point = point*0.75+128.0;
    }
    vec2 neckLocal = point-uBodyNeck;
    // Broad above the shoulders, narrow at the collar. The seam lies within the
    // opaque shirt/neck, with an 18px feather; the chest clover stays on the body.
    float width = mix(122.0,67.0,smoothstep(-95.0,-36.0,neckLocal.y));
    float head = (1.0-smoothstep(width,width+14.0,abs(neckLocal.x)))
        *(1.0-smoothstep(-31.0,-13.0,neckLocal.y))*uWalking;
    vec4 body = pose(point,uBodyRect,uBodyGrade,uBodyHue);
    vec4 face = pose(neckLocal+uHeadNeck,uHeadRect,uHeadGrade,uHeadHue);
    finalColor = mix(body,face,head)*uTintAlpha;
}
`;

class LeprechaunLabWalkFilter extends Filter {
    public constructor(
        private readonly sprite: Sprite,
        frames: readonly Texture[],
    ) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 8,
            resources: {
                uAtlas: frames[0].source,
                leprechaun: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uBodyRect: { value: new Float32Array(4), type: "vec4<f32>" },
                    uHeadRect: { value: new Float32Array(4), type: "vec4<f32>" },
                    uBodyNeck: { value: new Float32Array(2), type: "vec2<f32>" },
                    uHeadNeck: { value: new Float32Array(2), type: "vec2<f32>" },
                    uBodyGrade: { value: new Float32Array(3), type: "vec3<f32>" },
                    uHeadGrade: { value: new Float32Array(3), type: "vec3<f32>" },
                    uBodyHue: { value: new Float32Array(2), type: "vec2<f32>" },
                    uHeadHue: { value: new Float32Array(2), type: "vec2<f32>" },
                    uTintAlpha: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" },
                    uWalking: { value: 0, type: "f32" },
                    uIdleMotion: { value: new Float32Array(3), type: "vec3<f32>" },
                    uHitShape: { value: new Float32Array([1, 512, 512]), type: "vec3<f32>" },
                    uHitLegAxes: { value: new Float32Array(HIT_LEG_AXES[0]), type: "vec4<f32>" },
                    uHitLegWidth: { value: 1, type: "f32" },
                    uIdleHand: { value: new Float32Array(4), type: "vec4<f32>" },
                    uIdleSkinGain: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" },
                    uIdleArm: { value: new Float32Array(4), type: "vec4<f32>" },
                    uIdleSleeve: { value: new Float32Array([0, 1, 1]), type: "vec3<f32>" },
                    uIdleUpperSleeve: { value: new Float32Array([0, 1, 1]), type: "vec3<f32>" },
                    uIdleHat: { value: new Float32Array([0, 0, 1, 1]), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(
        bodyFrame: number,
        distanceCells: number,
        frames: readonly Texture[],
        idleElapsedMs = -1,
        hitFrame = -1,
    ): void {
        const u = this.resources.leprechaun.uniforms;
        const walking = bodyFrame >= 0;
        u.uHitShape.set(
            !walking && idleElapsedMs < 0 ? (HIT_BODY_SHAPE[hitFrame] ?? HIT_BODY_SHAPE[0]) : HIT_BODY_SHAPE[0],
        );
        const legFrame = !walking && idleElapsedMs < 0 ? hitFrame : -1;
        u.uHitLegAxes.set(HIT_LEG_AXES[legFrame] ?? HIT_LEG_AXES[0]);
        u.uHitLegWidth = HIT_LEG_WIDTH[legFrame] ?? 1;
        const idle =
            !walking && frames.length === 12 && idleElapsedMs >= 0 ? leprechaunIdleMotion(idleElapsedMs) : undefined;
        this.padding = idle ? 32 : 8;
        u.uIdleMotion.set(idle ? [idle.sway, idle.breathe, 1] : [0, 0, 0]);
        const poseIndex = idle?.frame ?? 0;
        const hand = LEPRECHAUN_IDLE_HANDS[poseIndex];
        u.uIdleHand.set([hand[0], hand[1], poseIndex > 0 ? 1 : 0, 0]);
        u.uIdleSkinGain.set([193.5 / hand[2], 117 / hand[3], 69 / hand[4]]);
        u.uIdleArm.set(LEPRECHAUN_IDLE_ARMS[poseIndex]);
        u.uIdleSleeve.set(LEPRECHAUN_IDLE_SLEEVES[poseIndex]);
        u.uIdleUpperSleeve.set(LEPRECHAUN_IDLE_UPPER_SLEEVES[poseIndex]);
        // Crown samples from lifted poses, normalized to the resting hat.
        const hat = (
            {
                3: [100, 69.230888, 0.357143, 0.160784],
                4: [133, 70.909225, 0.272727, 0.247059],
                9: [128, 56.249893, 0.368421, 0.164706],
                10: [100, 56.84201, 0.302325, 0.194118],
            } as Record<number, number[]>
        )[poseIndex];
        u.uIdleHat.set(
            hat ? [hat[0], 78.000061 - hat[1], Math.log(0.2625) / Math.log(hat[2]), 0.247059 / hat[3]] : [0, 0, 1, 1],
        );
        u.uWalking = walking ? 1 : 0;
        for (const [part, index] of [
            ["Body", walking ? bodyFrame : (idle?.frame ?? 0)],
            ["Head", walking ? leprechaunHeadFrame(distanceCells) : (idle?.frame ?? 0)],
        ] as const) {
            const texture = frames[index];
            const { x, y, width, height } = texture.frame;
            u[`u${part}Rect`].set([
                x / texture.source.width,
                y / texture.source.height,
                width / texture.source.width,
                height / texture.source.height,
            ]);
            u[`u${part}Neck`].set(LEPRECHAUN_NECK_ANCHORS[walking ? index : 0]);
            u[`u${part}Grade`].set(walking ? LEPRECHAUN_CLOTH_GRADES[index] : LEPRECHAUN_IDLE_CLOTH_GRADE);
            u[`u${part}Hue`].set(walking ? CLOTH_HUE_TAILS[index] : IDLE_HUE_TAILS);
        }
        this.resources.uAtlas = frames[0].source;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.leprechaun.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        const tint = this.sprite.getGlobalTint();
        const alpha = this.sprite.getGlobalAlpha();
        u.uTintAlpha.set([
            (((tint >> 16) & 255) / 255) * alpha,
            (((tint >> 8) & 255) / 255) * alpha,
            ((tint & 255) / 255) * alpha,
            alpha,
        ]);
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, LeprechaunLabWalkFilter>();
export function syncLeprechaunLabWalkVisuals(
    sprite: Sprite,
    frame: number,
    distanceCells: number,
    frames: readonly Texture[],
    gradeIdle = false,
    idleElapsedMs = -1,
    idleAtlas?: Texture,
    hitFrame = -1,
): void {
    const walking = frame >= 0 && frame < 8 && frames.length === 8;
    const enabled = walking || gradeIdle;
    const idleFrames = gradeIdle && idleElapsedMs >= 0 ? leprechaunIdleFrames(idleAtlas) : [];
    const sources = walking ? frames : idleFrames.length ? idleFrames : [sprite.texture];
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        try {
            filter = new LeprechaunLabWalkFilter(sprite, sources);
        } catch {
            return;
        } // The headless renderer cannot create WebGL programs.
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => {
            owned.destroy();
            filters.delete(sprite);
        });
    }
    if (!filter) return;
    if (enabled) filter.update(walking ? frame : -1, distanceCells, sources, idleElapsedMs, hitFrame);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
