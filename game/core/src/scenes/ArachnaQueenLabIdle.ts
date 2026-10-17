import {
    queenReactionPose,
    QUEEN_WALK_EYES,
    QUEEN_WALK_FAR_EYES,
    type QueenReaction,
} from "./ArachnaQueenLabReactions";
import { Filter, GlProgram, Matrix, Texture, type Sprite } from "pixi.js";
import { QUEEN_BILE_GLSL, queenBiteBilePose, type QueenBite } from "./ArachnaQueenLabBile";

export const QUEEN_IDLE_PERIOD_MS = 3200;
type Point = readonly [number, number];
// Root, knee and planted tip on the approved 768px battle figure, back limbs first.
export const QUEEN_IDLE_LEGS: readonly (readonly [Point, Point, Point])[] = [
    [
        [423, 399],
        [447, 306],
        [485, 433],
    ],
    [
        [452, 411],
        [550, 331],
        [606, 518],
    ],
    [
        [480, 432],
        [618, 360],
        [665, 568],
    ],
    [
        [492, 451],
        [650, 408],
        [743, 579],
    ],
    [
        [362, 440],
        [174, 384],
        [29, 563],
    ],
    [
        [371, 461],
        [261, 404],
        [155, 653],
    ],
    [
        [396, 476],
        [349, 450],
        [281, 688],
    ],
    [
        [405, 465],
        [450, 456],
        [523, 687],
    ],
];
export function queenIdleCrouch(timeMs: number): number {
    const t = Math.max(0, Number.isFinite(timeMs) ? timeMs : 0);
    return 15 * (0.5 - 0.5 * Math.cos((t / QUEEN_IDLE_PERIOD_MS) * Math.PI * 2));
}
/** Two-bone IK keeps both rigid limb lengths and each ground contact fixed. */
export function queenIdleKnee(leg: readonly [Point, Point, Point], crouch: number): Point {
    const [root, knee, foot] = leg;
    const a = Math.hypot(knee[0] - root[0], knee[1] - root[1]);
    const b = Math.hypot(foot[0] - knee[0], foot[1] - knee[1]);
    const rx = root[0],
        ry = root[1] + crouch;
    const dx = foot[0] - rx,
        dy = foot[1] - ry;
    const distance = Math.hypot(dx, dy);
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const side = Math.sign((foot[0] - root[0]) * (knee[1] - root[1]) - (foot[1] - root[1]) * (knee[0] - root[0]));
    const across = Math.sqrt(Math.max(0, a * a - along * along)) * side;
    return [rx + (dx * along - dy * across) / distance, ry + (dy * along + dx * across) / distance];
}
const vec = (p: Point) => `vec2(${p[0]}.0, ${p[1]}.0)`;
const legCode = QUEEN_IDLE_LEGS.map(
    ([r, k, f], i) => `
    limb(p, ${vec(r)}, ${vec(k)}, vec2(0.0, uCrouch), uKnee${i}, delta, weight);
    limb(p, ${vec(k)}, ${vec(f)}, uKnee${i}, vec2(0.0), delta, weight);
`,
).join("");
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
    vBodyCoord = (uBodyMatrix * vec3(aPosition * uOutputFrame.zw * uInputSize.zw, 1.0)).xy;
}`;
const fragment = /* glsl */ `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform mat3 uInputMatrix;
uniform vec4 uInputClamp;
uniform float uTime;
uniform float uCrouch;
uniform float uWalking;
uniform float uCollapse;
uniform float uRecoil;
uniform float uLife;
uniform vec2 uEye;
uniform vec2 uFarEye;
uniform vec2 uMouth;
${QUEEN_IDLE_LEGS.map((_, i) => `uniform vec2 uKnee${i};`).join("\n")}
float capsule(vec2 p, vec2 a, vec2 b) {
    vec2 d = b - a;
    return length(p - a - d * clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
void limb(vec2 p, vec2 a, vec2 b, vec2 da, vec2 db, inout vec2 delta, inout float weight) {
    float t = clamp(dot(p-a,b-a)/dot(b-a,b-a),0.0,1.0);
    float w = exp(-pow(length(p-mix(a,b,t))/18.0,2.0));
    delta += mix(da,db,t) * w;
    weight += w;
}
vec2 offset(vec2 p) {
    if (uWalking > 0.5) return vec2(0.0);
    // The body settles while distal legs fold inward/up underneath it. Smooth spatial
    // weights preserve continuous silhouettes at all joints and leave an opaque corpse.
    if (uCollapse > 0.0) {
        float lower = smoothstep(450.0, 690.0, p.y);
        float fold = smoothstep(440.0, 640.0, p.y);
        return vec2((420.0-p.x)*0.36*uCollapse*fold + uRecoil*(1.0-lower),
                    148.0*(1.0-lower)*uCollapse);
    }
    // Rigid abdomen/thorax translate; the skin around knees follows the IK bones.
    float body = max(1.0-smoothstep(0.80,1.03,length((p-vec2(278,365))/vec2(178,160))),
                     1.0-smoothstep(0.70,1.02,length((p-vec2(470,410))/vec2(102,81))));
    float weight = max(body * 8.0,0.005);
    vec2 delta = vec2(0.0,uCrouch) * weight;
    ${legCode}
    vec2 move = delta / max(weight,0.00001);
    // Two chelicerae close toward one another from their fixed sockets.
    float close = (0.5 - 0.5*cos(uTime*6.2831853*2.2))*uLife;
    float jawA = 1.0-smoothstep(8.0,18.0,capsule(p,vec2(522,462),vec2(559,549)));
    float jawB = 1.0-smoothstep(6.0,14.0,capsule(p,vec2(552,454),vec2(599,515)));
    float jaw = max(jawA,jawB);
    move = mix(move,vec2(0.0,uCrouch),jaw);
    move.x += close * (jawA*6.0 - jawB*5.0) * smoothstep(456.0,520.0,p.y);
    move.x += uRecoil*(1.0-smoothstep(470.0,690.0,p.y));
    return move;
}
float eye(vec2 p, vec2 center, vec2 radius) { return exp(-dot((p-center)/radius,(p-center)/radius)*2.0); }
${QUEEN_BILE_GLSL}
void main() {
    vec2 p = vBodyCoord*768.0;
    vec2 source = p;
    if (uCollapse > 0.0) {
        // Invert the monotonic settling curve directly: a deep crouch must not
        // tear the thin leg tips through a poorly converged displacement iteration.
        float lo = -160.0, hi = 928.0;
        for (int i=0;i<18;i++) {
            float mid = (lo+hi)*0.5;
            float y = mid+148.0*(1.0-smoothstep(450.0,690.0,mid))*uCollapse;
            if (y < p.y) lo=mid; else hi=mid;
        }
        source.y=(lo+hi)*0.5;
        float lower=smoothstep(450.0,690.0,source.y);
        float fold=smoothstep(440.0,640.0,source.y)*0.36*uCollapse;
        source.x=(p.x-420.0*fold-uRecoil*(1.0-lower))/(1.0-fold);
    } else {
        for (int i=0;i<10;i++) source = p-offset(source);
    }
    vec2 uv = (uInputMatrix*vec3(source/768.0,1.0)).xy;
    vec4 color = texture(uTexture,clamp(uv,uInputClamp.xy,uInputClamp.zw));
    // Never repeat the edge texel into the filter's padding when the inverse warp
    // leaves its input. That can leave detached dark fragments around thin legs.
    float inside = step(uInputClamp.x,uv.x)*step(uInputClamp.y,uv.y)*step(uv.x,uInputClamp.z)*step(uv.y,uInputClamp.w);
    color *= inside;
    float eyes = eye(source,uEye,vec2(12,9)) + eye(source,uFarEye,vec2(6,5));
    float halo = eye(source,uEye,vec2(24,18)) + eye(source,uFarEye,vec2(12,10));
    float pulse = (uWalking > 0.5 ? 1.0 : 0.90+0.10*sin(uTime*2.6))*uLife;
    // Also extinguish the green already painted into the canonical eye on death.
    color.rgb = mix(color.rgb,vec3(0.07,0.085,0.018)*color.a,clamp(eyes*1.6,0.0,1.0)*(1.0-uLife));
    color.rgb = mix(color.rgb,vec3(0.58,1.0,0.08)*color.a,clamp(eyes*1.8,0.0,1.0)*pulse);
    color.rgb += vec3(0.04,0.28,0.008)*halo*color.a*pulse;
    color.rgb *= 1.0-0.25*uCollapse;
    finalColor=paintedBile(color,p,uMouth+offset(uMouth));
}`;
export class ArachnaQueenIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        const uniforms = Object.fromEntries(
            QUEEN_IDLE_LEGS.map((_, i) => [`uKnee${i}`, { value: new Float32Array(2), type: "vec2<f32>" }]),
        );
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 48,
            resources: {
                uBileSprites: Texture.EMPTY.source,
                queen: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uTime: { value: 0, type: "f32" },
                    uBileReady: { value: 0, type: "f32" },
                    uBurstSeconds: { value: -1, type: "f32" },
                    uBurstOrigin: { value: new Float32Array(2), type: "vec2<f32>" },
                    uBurstDirection: { value: new Float32Array([1, 0]), type: "vec2<f32>" },
                    uCrouch: { value: 0, type: "f32" },
                    uWalking: { value: 0, type: "f32" },
                    uCollapse: { value: 0, type: "f32" },
                    uRecoil: { value: 0, type: "f32" },
                    uLife: { value: 1, type: "f32" },
                    uEye: { value: new Float32Array([515, 430]), type: "vec2<f32>" },
                    uFarEye: { value: new Float32Array([482, 422]), type: "vec2<f32>" },
                    uMouth: { value: new Float32Array([565, 509]), type: "vec2<f32>" },
                    ...uniforms,
                },
            },
        });
    }
    public update(
        elapsedMs: number,
        walkFrame = -1,
        reaction?: QueenReaction,
        reactionMs = 0,
        bileTexture?: Texture,
        bite?: { state: QueenBite; frame: number; elapsed: number },
    ): void {
        const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
        const u = this.resources.queen.uniforms;
        u.uTime = time / 1000;
        const pose = reaction ? queenReactionPose(reaction, reactionMs) : undefined;
        u.uCrouch = pose?.crouch ?? (walkFrame < 0 ? queenIdleCrouch(time) : 0);
        u.uWalking = walkFrame >= 0 ? 1 : 0;
        u.uCollapse = pose?.collapse ?? 0;
        u.uRecoil = pose?.recoil ?? 0;
        u.uLife = pose?.life ?? 1;
        const eye = QUEEN_WALK_EYES[walkFrame] ?? [515, 430];
        u.uEye.set(eye);
        u.uFarEye.set(QUEEN_WALK_FAR_EYES[walkFrame] ?? [482, 422]);
        u.uMouth.set([eye[0] + 50, eye[1] + 79]);
        u.uBileReady = bileTexture?.width === 512 && bileTexture.height === 512 ? 1 : 0;
        if (u.uBileReady) this.resources.uBileSprites = bileTexture!.source;
        u.uBurstSeconds = -1;
        if (bite) {
            const attack = queenBiteBilePose(bite.state, bite.frame, bite.elapsed);
            u.uWalking = 1; // Painted attack anatomy is never displaced by the idle warp.
            u.uCrouch = 0;
            u.uEye.set(attack.eye);
            u.uFarEye.set([attack.eye[0] - 20, attack.eye[1] - 8]);
            u.uMouth.set(attack.mouth);
            u.uBurstOrigin.set(attack.origin);
            u.uBurstDirection.set(attack.direction);
            u.uBurstSeconds = attack.burstSeconds;
        }
        if (reaction === "death") u.uTime = pose!.time / 1000;
        QUEEN_IDLE_LEGS.forEach((leg, i) => {
            const knee = queenIdleKnee(leg, u.uCrouch);
            u[`uKnee${i}`].set([knee[0] - leg[1][0], knee[1] - leg[1][1]]);
        });
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.queen.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, ArachnaQueenIdleFilter>();
export function syncArachnaQueenLabIdle(
    sprite: Sprite,
    enabled: boolean,
    elapsedMs: number,
    walkFrame = -1,
    reaction?: QueenReaction,
    reactionMs = 0,
    bileTexture?: Texture,
    bite?: { state: QueenBite; frame: number; elapsed: number },
): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new ArachnaQueenIdleFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(elapsedMs, walkFrame, reaction, reactionMs, bileTexture, bite);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...remaining, filter] : remaining.length ? remaining : null;
}
