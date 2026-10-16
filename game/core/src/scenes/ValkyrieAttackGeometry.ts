import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

// Native 768px coordinates. Bone lengths and the attack reach are not scaled.
export const VALKYRIE_ATTACK_POSES = {
    cast: [
        {
            arm: [369, 308, 394, 351, 434, 337],
            torso: [398, 319, 411, 407],
            farLeg: [382, 432, 361, 491, 351, 566],
            nearLeg: [432, 437, 435, 484, 434, 563],
            axe: [460, 227, -79],
            soles: [336, 384, 597, 415, 478, 590],
        },
        {
            arm: [370, 308, 414, 328, 446, 287],
            torso: [398, 319, 411, 407],
            farLeg: [382, 432, 361, 491, 351, 566],
            nearLeg: [432, 437, 435, 484, 434, 563],
            axe: [474, 211, -74],
            soles: [336, 384, 597, 413, 478, 592],
        },
        {
            arm: [372, 296, 420, 293, 464, 253],
            torso: [398, 319, 411, 407],
            farLeg: [382, 432, 361, 491, 351, 566],
            nearLeg: [432, 437, 435, 484, 434, 563],
            axe: [505, 199, -55],
            soles: [336, 385, 597, 414, 479, 591],
        },
        {
            arm: [375, 294, 410, 266, 430, 215],
            torso: [398, 319, 411, 407],
            farLeg: [382, 432, 361, 491, 351, 566],
            nearLeg: [432, 437, 435, 484, 434, 563],
            axe: [465, 181, -46],
            soles: [336, 384, 597, 415, 480, 590],
        },
        {
            arm: [375, 294, 410, 266, 434, 216],
            torso: [398, 319, 411, 407],
            farLeg: [382, 432, 361, 491, 351, 566],
            nearLeg: [432, 437, 435, 484, 434, 563],
            axe: [469, 184, -46],
            soles: [336, 384, 597, 416, 480, 590],
        },
        {
            arm: [370, 308, 414, 328, 447, 287],
            torso: [398, 319, 411, 407],
            farLeg: [382, 432, 361, 491, 351, 566],
            nearLeg: [432, 437, 435, 484, 434, 563],
            axe: [493, 199, -63],
            soles: [336, 384, 597, 413, 478, 591],
        },
    ],
    melee_attack: [
        {
            arm: [444, 315, 392, 335, 349, 306],
            torso: [426, 321, 413, 408],
            farLeg: [385, 429, 367, 486, 344, 567],
            nearLeg: [438, 433, 461, 481, 450, 564],
            axe: [273, 250, -145],
            soles: [326, 374, 597, 425, 489, 591],
        },
        {
            arm: [391, 310, 460, 269, 449, 227],
            torso: [410, 319, 414, 407],
            farLeg: [386, 414, 366, 484, 337, 563],
            nearLeg: [434, 415, 455, 476, 447, 563],
            axe: [332, 186, -163],
            soles: [323, 373, 597, 427, 491, 591],
        },
        {
            arm: [403, 306, 419, 347, 450, 365],
            torso: [420, 324, 401, 411],
            farLeg: [373, 425, 352, 490, 335, 565],
            nearLeg: [428, 428, 457, 479, 448, 563],
            axe: [616, 362, 0],
            soles: [323, 372, 597, 428, 492, 591],
        },
        {
            arm: [435, 300, 475, 314, 540, 314],
            torso: [428, 319, 396, 407],
            farLeg: [373, 422, 352, 488, 337, 567],
            nearLeg: [425, 427, 452, 480, 446, 564],
            axe: [660, 307, -3],
            soles: [323, 374, 597, 425, 491, 591],
        },
        {
            arm: [438, 305, 473, 333, 528, 361],
            torso: [430, 327, 404, 411],
            farLeg: [377, 427, 351, 492, 336, 565],
            nearLeg: [433, 428, 456, 480, 447, 564],
            axe: [627, 399, 21],
            soles: [321, 370, 597, 430, 494, 591],
        },
        {
            arm: [387, 305, 380, 357, 409, 390],
            torso: [410, 323, 418, 414],
            farLeg: [389, 428, 368, 487, 345, 567],
            nearLeg: [443, 433, 455, 481, 445, 565],
            axe: [513, 246, -53],
            soles: [336, 385, 597, 414, 479, 591],
        },
    ],
    melee_attack_up: [
        {
            arm: [390, 313, 362, 365, 341, 419],
            torso: [418, 330, 410, 417],
            farLeg: [380, 426, 358, 489, 332, 564],
            nearLeg: [436, 427, 462, 479, 448, 563],
            axe: [286, 477, 140],
            soles: [318, 371, 597, 429, 494, 589],
        },
        {
            arm: [375, 317, 397, 362, 446, 368],
            torso: [409, 330, 414, 412],
            farLeg: [387, 425, 363, 484, 334, 565],
            nearLeg: [440, 424, 464, 478, 451, 563],
            axe: [554, 229, -50],
            soles: [315, 369, 597, 431, 496, 589],
        },
        {
            arm: [397, 303, 459, 282, 495, 253],
            torso: [416, 322, 416, 413],
            farLeg: [390, 427, 364, 485, 329, 565],
            nearLeg: [442, 425, 471, 479, 454, 565],
            axe: [540, 177, -62],
            soles: [312, 366, 597, 436, 501, 591],
        },
        {
            arm: [403, 292, 461, 264, 489, 212],
            torso: [411, 313, 420, 409],
            farLeg: [394, 416, 368, 480, 331, 567],
            nearLeg: [444, 409, 467, 470, 456, 563],
            axe: [524, 169, -55],
            soles: [312, 366, 597, 436, 501, 590],
        },
        {
            arm: [410, 296, 451, 268, 488, 227],
            torso: [416, 317, 420, 414],
            farLeg: [391, 426, 363, 486, 330, 565],
            nearLeg: [442, 427, 467, 479, 454, 564],
            axe: [534, 183, -47],
            soles: [312, 365, 597, 435, 500, 591],
        },
        {
            arm: [387, 307, 405, 350, 449, 373],
            torso: [414, 328, 417, 417],
            farLeg: [390, 430, 367, 489, 341, 568],
            nearLeg: [444, 430, 458, 481, 449, 564],
            axe: [552, 297, -44],
            soles: [326, 378, 597, 422, 488, 590],
        },
    ],
    melee_attack_down: [
        {
            arm: [380, 312, 400, 348, 442, 353],
            torso: [410, 327, 418, 415],
            farLeg: [390, 426, 365, 487, 337, 565],
            nearLeg: [440, 428, 458, 480, 446, 565],
            axe: [500, 190, -73],
            soles: [321, 371, 597, 430, 491, 590],
        },
        {
            arm: [390, 298, 421, 260, 417, 207],
            torso: [412, 312, 418, 408],
            farLeg: [391, 422, 364, 484, 334, 565],
            nearLeg: [440, 426, 464, 480, 450, 565],
            axe: [334, 184, -165],
            soles: [316, 366, 597, 434, 497, 589],
        },
        {
            arm: [420, 323, 449, 371, 490, 419],
            torso: [439, 341, 410, 413],
            farLeg: [383, 425, 355, 482, 326, 564],
            nearLeg: [439, 428, 473, 478, 456, 562],
            axe: [585, 498, 39],
            soles: [314, 365, 597, 437, 499, 589],
        },
        {
            arm: [449, 333, 478, 381, 517, 428],
            torso: [452, 355, 409, 411],
            farLeg: [384, 421, 354, 481, 309, 563],
            nearLeg: [441, 429, 489, 465, 478, 558],
            axe: [630, 508, 36],
            soles: [297, 348, 597, 452, 515, 583],
        },
        {
            arm: [429, 333, 465, 385, 519, 432],
            torso: [438, 353, 407, 413],
            farLeg: [379, 426, 351, 484, 318, 563],
            nearLeg: [440, 430, 481, 472, 470, 558],
            axe: [614, 482, 28],
            soles: [304, 354, 597, 446, 509, 583],
        },
        {
            arm: [382, 305, 386, 354, 438, 366],
            torso: [407, 325, 412, 415],
            farLeg: [385, 428, 363, 490, 341, 565],
            nearLeg: [438, 430, 456, 480, 445, 562],
            axe: [540, 277, -49],
            soles: [332, 381, 597, 419, 482, 589],
        },
    ],
} as const;

type Attack = keyof typeof VALKYRIE_ATTACK_POSES;
export const VALKYRIE_ATTACK_IDLE_SOLES = [339, 386, 597, 414, 474, 588] as const;
export function valkyrieAttackPose(state: string | undefined, frame: number) {
    return state && Object.hasOwn(VALKYRIE_ATTACK_POSES, state)
        ? VALKYRIE_ATTACK_POSES[state as Attack][frame - 1]
        : undefined;
}
/** Rotation only: the source axe head retains its idle dimensions at every angle. */
export function valkyrieAttackAxeSource(x: number, y: number, axe: readonly number[]): [number, number] {
    const angle = (axe[2] * Math.PI) / 180;
    const dx = x - axe[0],
        dy = y - axe[1];
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    const across = -dx * Math.sin(angle) + dy * Math.cos(angle);
    return [500 + along * 0.6 + across * 0.8, 277 - along * 0.8 + across * 0.6];
}
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
const fragment = /* glsl */ `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uIdleAtlas;
uniform mat3 uInputMatrix;
uniform vec4 uInputClamp;
uniform vec4 uUpperArm;
uniform vec4 uForearm;
uniform vec4 uTorso;
uniform vec4 uFarThigh;
uniform vec4 uFarShin;
uniform vec4 uNearThigh;
uniform vec4 uNearShin;
uniform vec4 uSoleX;
uniform vec2 uSoleY;
uniform vec4 uAxe;
uniform vec2 uAtlasSize;
uniform vec4 uWidths;
uniform vec4 uBladeBounds;
uniform float uCast;
uniform float uBackAxe;
void crossEdge(vec2 p,vec2 a,vec2 b,inout bool inside) {
    if((a.y>p.y)!=(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
}
float backBladeMask(vec2 p) {
    bool inside=false;
    crossEdge(p,vec2(267.0,435.0),vec2(241.0,454.0),inside);
    crossEdge(p,vec2(265.0,459.0),vec2(267.0,435.0),inside);
    crossEdge(p,vec2(284.0,474.0),vec2(265.0,459.0),inside);
    crossEdge(p,vec2(328.0,495.0),vec2(284.0,474.0),inside);
    crossEdge(p,vec2(324.0,527.0),vec2(328.0,495.0),inside);
    crossEdge(p,vec2(268.0,563.0),vec2(324.0,527.0),inside);
    crossEdge(p,vec2(278.0,534.0),vec2(268.0,563.0),inside);
    crossEdge(p,vec2(267.0,518.0),vec2(278.0,534.0),inside);
    crossEdge(p,vec2(242.0,528.0),vec2(267.0,518.0),inside);
    crossEdge(p,vec2(242.0,509.0),vec2(242.0,528.0),inside);
    crossEdge(p,vec2(222.0,520.0),vec2(242.0,509.0),inside);
    crossEdge(p,vec2(223.0,488.0),vec2(222.0,520.0),inside);
    crossEdge(p,vec2(241.0,454.0),vec2(223.0,488.0),inside);
    return inside?1.0:0.0;
}
void narrow(vec2 p, vec4 bone, float radius, float width, inout vec2 delta, inout float total) {
    vec2 axis = bone.zw - bone.xy;
    float len = length(axis);
    vec2 dir = axis / max(len, 1.0), normal = vec2(-dir.y, dir.x);
    float along = dot(p - bone.xy, dir), across = dot(p - bone.xy, normal);
    float w = smoothstep(-12.0, 5.0, along) * (1.0 - smoothstep(len-5.0,len+12.0,along))
        * (1.0 - smoothstep(radius, radius+22.0, abs(across)));
    delta += normal * across * (1.0/width-1.0) * w;
    total += w;
}
float soleX(float x) {
    if (x<339.0) return x+uSoleX.x-339.0;
    if (x<386.0) return mix(uSoleX.x,uSoleX.y,(x-339.0)/47.0);
    if (x<414.0) return mix(uSoleX.y,uSoleX.z,(x-386.0)/28.0);
    if (x<474.0) return mix(uSoleX.z,uSoleX.w,(x-414.0)/60.0);
    return x+uSoleX.w-474.0;
}
void main() {
    vec2 p = vBodyCoord * 768.0;
    // Register both boot outlines and ground contacts to the original stance.
    // Restrict to the legs: a low axe sweep must never inherit the foot warp.
    float feet = smoothstep(425.0,570.0,p.y)
        * (1.0-smoothstep(490.0,545.0,p.x));
    vec2 q = mix(p,vec2(soleX(p.x),p.y+mix(uSoleY.x-597.0,uSoleY.y-588.0,
        smoothstep(386.0,414.0,p.x))),feet);
    vec2 delta=vec2(0.0); float total=0.0;
    narrow(q,uTorso,37.0,uWidths.x,delta,total);
    narrow(q,uUpperArm,24.0,uWidths.y,delta,total);
    narrow(q,uForearm,19.0,mix(0.86,0.96,uCast),delta,total);
    narrow(q,uFarThigh,23.0,uWidths.z,delta,total);
    narrow(q,uFarShin,19.0,uWidths.w,delta,total);
    narrow(q,uNearThigh,26.0,uWidths.z,delta,total);
    narrow(q,uNearShin,20.0,uWidths.w,delta,total);
    vec2 source=q+delta/max(1.0,total);
    vec2 uv=(uInputMatrix*vec3(source/768.0,1.0)).xy;
    vec4 body=texture(uTexture,clamp(uv,uInputClamp.xy,uInputClamp.zw));
    // The redrawn heads change width as the weapon rotates. Use the actual idle
    // blade from tile zero, rotated rigidly around its shaft socket instead.
    vec2 dir=uAxe.zw, normal=vec2(-dir.y,dir.x);
    vec2 local=vec2(dot(p-uAxe.xy,dir),dot(p-uAxe.xy,normal));
    float shaft=step(abs(local.y),6.0)*step(local.x,-5.0);
    float donor=step(-60.0,local.x)*step(local.x,110.0)*step(abs(local.y),70.0)*(1.0-shaft);
    if(uCast>0.5) donor*=step(uBladeBounds.x,p.x)*step(p.x,uBladeBounds.z)
        *step(uBladeBounds.y,p.y)*step(p.y,uBladeBounds.w)*step(-32.0,local.x);
    if(uBackAxe>0.5) donor=max(backBladeMask(source),
        step(500.0,source.y)*step(source.y,570.0)*step(source.x,331.0))*(1.0-shaft);
    body*=1.0-donor;
    vec2 idle=vec2(500.0,277.0)+local.x*vec2(0.6,-0.8)+local.y*vec2(0.8,0.6);
    float mask=step(465.0,idle.x)*step(idle.x,560.0)*step(202.0,idle.y)*step(idle.y,327.0)
        * (1.0-step(idle.x,489.0)*step(290.0,idle.y));
    vec4 blade=texture(uIdleAtlas,idle/uAtlasSize)*mask;
    finalColor=blade+body*(1.0-blade.a);
}`;
class AttackGeometryFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            padding: 80,
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                uIdleAtlas: sprite.texture.source,
                geometry: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    ...Object.fromEntries(
                        [
                            "uUpperArm",
                            "uForearm",
                            "uTorso",
                            "uFarThigh",
                            "uFarShin",
                            "uNearThigh",
                            "uNearShin",
                            "uSoleX",
                            "uAxe",
                        ].map((key) => [key, { value: new Float32Array(4), type: "vec4<f32>" }]),
                    ),
                    uSoleY: { value: new Float32Array(2), type: "vec2<f32>" },
                    uAtlasSize: { value: new Float32Array(2), type: "vec2<f32>" },
                    uBackAxe: { value: 0, type: "f32" },
                    uWidths: { value: new Float32Array(4), type: "vec4<f32>" },
                    uBladeBounds: { value: new Float32Array(4), type: "vec4<f32>" },
                    uCast: { value: 0, type: "f32" },
                },
            },
        });
    }
    public update(pose: NonNullable<ReturnType<typeof valkyrieAttackPose>>, cast: boolean): void {
        const u = this.resources.geometry.uniforms;
        u.uWidths.set(cast ? [0.96, 0.96, 0.93, 0.94] : [0.84, 0.84, 0.8, 0.82]);
        u.uCast = cast ? 1 : 0;
        const castFrame = VALKYRIE_ATTACK_POSES.cast.indexOf(pose as (typeof VALKYRIE_ATTACK_POSES.cast)[number]);
        const bladeBounds = [
            [420, 142, 526, 260],
            [430, 131, 538, 244],
            [470, 116, 579, 233],
            [432, 113, 539, 232],
            [419, 110, 548, 236],
            [452, 115, 561, 233],
        ];
        u.uBladeBounds.set(bladeBounds[castFrame] ?? [0, 0, 768, 768]);
        u.uUpperArm.set(pose.arm.slice(0, 4));
        u.uForearm.set(pose.arm.slice(2, 6));
        u.uTorso.set(pose.torso);
        u.uFarThigh.set(pose.farLeg.slice(0, 4));
        u.uFarShin.set(pose.farLeg.slice(2, 6));
        u.uNearThigh.set(pose.nearLeg.slice(0, 4));
        u.uNearShin.set(pose.nearLeg.slice(2, 6));
        u.uSoleX.set([pose.soles[0], pose.soles[1], pose.soles[3], pose.soles[4]]);
        u.uSoleY.set([pose.soles[2], pose.soles[5]]);
        const angle = (pose.axe[2] * Math.PI) / 180;
        u.uAxe.set([pose.axe[0], pose.axe[1], Math.cos(angle), Math.sin(angle)]);
        u.uBackAxe = pose.axe[2] === 140 ? 1 : 0;
        const source = this.sprite.texture.source;
        this.resources.uIdleAtlas = source;
        u.uAtlasSize.set([source.width, source.height]);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.geometry.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, AttackGeometryFilter>();
export function syncValkyrieAttackGeometry(sprite: Sprite, state: string | undefined, frame: number): void {
    const pose = valkyrieAttackPose(state, frame);
    let filter = filters.get(sprite);
    if (pose && !filter) {
        filter = new AttackGeometryFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (pose) filter.update(pose, state === "cast");
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === !!pose) return;
    const others = installed.filter((entry) => entry !== filter);
    // Run after material correction so the exact idle blade is not recolored.
    sprite.filters = pose ? [...others, filter] : others.length ? others : null;
}
