import { BufferImageSource, Filter, GlProgram, Matrix, type Sprite, type Texture } from "pixi.js";
import {
    WOLF_REFERENCE_QUANTILES,
    WOLF_POSE_QUANTILES,
    WOLF_REFERENCE_BODY,
    WOLF_POSE_BODY,
} from "./WolfIdleCalibration";
import { wolfGeometryRegisteredSourcePoint } from "./WolfIdleGeometry";
import { WOLF_LOCAL_PALETTE_GRID, WOLF_LOCAL_PALETTE_GAINS } from "./WolfIdleLocalPalette";
import { WOLF_HEAD_FRAMES, wolfHeadGeometryGlsl } from "./WolfIdleHeadGeometry";
import { WOLF_HEAD_PALETTE_GLSL } from "./WolfIdleHeadPalette";

export const WOLF_IDLE_PLAYBACK_RATE = 1.3;
export const wolfIdlePlaybackDurations = (durations: readonly number[]): number[] =>
    durations.map((duration) => duration / WOLF_IDLE_PLAYBACK_RATE);

// Both sources already have their front paw at (443, 695) on the same 768px canvas.
// Ear height changes with the pose and must never determine the sprite's scale.
export const WOLF_HOWL_BODY_SCALE = 1;
export const wolfHowlPoseIndex = (frame: number): number =>
    frame >= 1 && frame <= 17 ? (frame <= 9 ? frame - 1 : 17 - frame) : -1;
export const wolfIdleFrameScale = (frame: number): number => (wolfHowlPoseIndex(frame) >= 0 ? WOLF_HOWL_BODY_SCALE : 1);
export const wolfIdleTextureFrame = (_frame: number): number => 0;

// Material quantile matching uses every sampled tone instead of a single mean/contrast fit.
export function wolfPaletteValue(pose: number, material: number, channel: number, value: number): number {
    const source = WOLF_POSE_QUANTILES[pose][material][channel];
    const target = WOLF_REFERENCE_QUANTILES[material][channel];
    if (value <= source[0]) return target[0];
    for (let i = 1; i < source.length; i++)
        if (value <= source[i]) {
            const t = (value - source[i - 1]) / Math.max(0.001, source[i] - source[i - 1]);
            return target[i - 1] + t * (target[i] - target[i - 1]);
        }
    return target[target.length - 1];
}
export function wolfRegisteredY(y: number, pose: number): number {
    const [top, belly] = WOLF_POSE_BODY[pose],
        [baseTop, baseBelly] = WOLF_REFERENCE_BODY;
    if (y <= top) return y + baseTop - top;
    if (y <= belly) return baseTop + ((y - top) * (baseBelly - baseTop)) / (belly - top);
    return baseBelly + ((y - belly) * (697 - baseBelly)) / (697 - belly);
}
let palette: BufferImageSource | undefined;
function wolfPaletteTexture(): BufferImageSource {
    if (palette) return palette;
    const data = new Uint8Array(256 * 45 * 4);
    for (let pose = 0; pose < 9; pose++)
        for (let material = 0; material < 5; material++)
            for (let value = 0; value < 256; value++) {
                const i = ((pose * 5 + material) * 256 + value) * 4;
                for (let c = 0; c < 3; c++) data[i + c] = Math.round(wolfPaletteValue(pose, material, c, value));
                data[i + 3] = 255;
            }
    return (palette = new BufferImageSource({
        resource: data,
        width: 256,
        height: 45,
        scaleMode: "linear",
        alphaMode: "no-premultiply-alpha",
    }));
}

// These are numeric UV and lighting fields, sampled from the existing artwork.
// The source atlas and the original resting cutout stay unchanged.
let lowerBodyGeometry: BufferImageSource | undefined;
function wolfLowerBodyGeometryTexture(): BufferImageSource {
    if (lowerBodyGeometry) return lowerBodyGeometry;
    const width = 193,
        rows = 65;
    const data = new Uint8Array(width * rows * 9 * 4);
    for (let pose = 0; pose < 9; pose++)
        for (let row = 0; row < rows; row++)
            for (let col = 0; col < width; col++) {
                const x = col * 4,
                    y = 448 + row * 4;
                const source = wolfGeometryRegisteredSourcePoint(x, y, pose);
                const dx = Math.round((source.x - x) * 256) + 32768;
                const dy = Math.round((source.y - y) * 256) + 32768;
                const at = ((pose * rows + row) * width + col) * 4;
                data[at] = dx >> 8;
                data[at + 1] = dx & 255;
                data[at + 2] = dy >> 8;
                data[at + 3] = dy & 255;
            }
    return (lowerBodyGeometry = new BufferImageSource({
        resource: data,
        width,
        height: rows * 9,
        scaleMode: "linear",
        alphaMode: "no-premultiply-alpha",
    }));
}
let bodyTones: BufferImageSource | undefined;
function wolfBodyTonesTexture(): BufferImageSource {
    if (bodyTones) return bodyTones;
    const { columns, rows } = WOLF_LOCAL_PALETTE_GRID;
    const data = new Uint8Array(columns * rows * 9 * 4);
    for (let pose = 0; pose < 9; pose++)
        for (let cell = 0; cell < columns * rows; cell++) {
            const at = (pose * columns * rows + cell) * 4;
            for (let c = 0; c < 3; c++) data[at + c] = Math.round(WOLF_LOCAL_PALETTE_GAINS[pose][cell * 3 + c] * 127.5);
            data[at + 3] = 255;
        }
    return (bodyTones = new BufferImageSource({
        resource: data,
        width: columns,
        height: rows * 9,
        scaleMode: "linear",
        alphaMode: "no-premultiply-alpha",
    }));
}

const smooth = (t: number): number => {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
};

// One continuous pose coordinate keeps the complete lowering movement intact, including
// both near-neutral poses. Easing each pair separately made the body stop at every key.
export function wolfHowlBlend(elapsedMs: number, durations: readonly number[]) {
    const rest = { from: 0, to: 0, mix: 0 };
    const cycle = durations.reduce((sum, value) => sum + value, 0);
    const end = durations.slice(0, 18).reduce((sum, value) => sum + value, 0);
    const start = durations[0];
    if (cycle <= 0 || !Number.isFinite(elapsedMs) || end <= start) return rest;
    const time = ((elapsedMs % cycle) + cycle) % cycle;
    if (time <= start || time >= end) return rest;
    const howlTime = ((time - start) / (end - start)) * 1920;
    const pose =
        howlTime < 840 ? 9 * smooth(howlTime / 840) : howlTime <= 1080 ? 9 : 9 * smooth((1920 - howlTime) / 840);
    const from = Math.floor(pose);
    return { from, to: Math.min(9, from + 1), mix: pose - from };
}
export function wolfTailMotion(elapsedMs: number, durations: readonly number[]): { phase: number; envelope: number } {
    const cycle = durations.reduce((sum, value) => sum + value, 0);
    if (cycle <= 0 || !Number.isFinite(elapsedMs)) return { phase: 0, envelope: 0 };
    const time = ((elapsedMs % cycle) + cycle) % cycle;
    const howlEnd = durations.slice(0, 18).reduce((sum, value) => sum + value, 0);
    const howlStart = durations[0];
    if (time >= howlStart && time < howlEnd) return { phase: 0, envelope: 0 };
    // The pause crosses the atlas loop boundary. Its tail phase must cross with it,
    // instead of stopping on frame 30 and starting a second wag on frame 0.
    const restDuration = cycle - howlEnd + howlStart;
    const local = time >= howlEnd ? time - howlEnd : cycle - howlEnd + time;
    return {
        phase: (local * WOLF_IDLE_PLAYBACK_RATE * Math.PI * 2) / 1500,
        envelope:
            smooth((local * WOLF_IDLE_PLAYBACK_RATE) / 240) *
            smooth(((restDuration - local) * WOLF_IDLE_PLAYBACK_RATE) / 240),
    };
}

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vBodyCoord;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vBodyCoord = aPosition;
}
`;
const fragment = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uInputClamp;
uniform float uPhase;
uniform float uEnvelope;
uniform float uMirror;
void main(void) {
    vec2 body = vBodyCoord;
    body.x = mix(body.x, 1.0 - body.x, uMirror);
    // Follow the original tail silhouette down-left from its fixed root. The sloping
    // right boundary excludes the hind leg; the paw/boot row is completely untouched.
    float edge = (185.0 - 0.34 * (body.y * 768.0 - 300.0)) / 768.0;
    float tail = (1.0 - smoothstep(edge - 0.014, edge + 0.006, body.x))
        * smoothstep(300.0 / 768.0, 410.0 / 768.0, body.y)
        * (1.0 - smoothstep(610.0 / 768.0, 640.0 / 768.0, body.y));
    float alongTail = clamp((body.y * 768.0 - 330.0) / 280.0, 0.0, 1.0);
    float sway = sin(uPhase - alongTail * 0.55) * uEnvelope * tail * alongTail;
    vec2 offset = vec2(sway * 18.0 / 768.0 * mix(1.0, -1.0, uMirror), sway * 4.0 / 768.0);
    vec2 uv = vTextureCoord + offset * uOutputFrame.zw * uInputSize.zw;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}
`;
const tailFilters = new WeakMap<Sprite, Filter>();

const howlVertex = vertex
    .replace("uniform highp vec4 uInputSize;", "uniform mat3 uBodyMatrix;\nuniform highp vec4 uInputSize;")
    .replace("vBodyCoord = aPosition;", "vBodyCoord = (uBodyMatrix * vec3(vTextureCoord, 1.0)).xy;");

// Source -> first moving pose, in authoring pixels before vertical body registration.
// Ears, muzzle, throat, shoulder, torso, tail and all four planted paws travel together.
// A plain dissolve gives two silhouettes even when its endpoint pixels are identical.
const ENTRY_LANDMARKS = [
    [611, 142, 577, 160],
    [675, 152, 645, 164],
    [638, 194, 615, 208],
    [654, 255, 623, 266],
    [721, 322, 709, 319],
    [658, 368, 654, 365],
    [593, 432, 585, 435],
    [503, 188, 494, 200],
    [447, 206, 447, 214],
    [410, 330, 404, 328],
    [430, 382, 426, 378],
    [434, 465, 432, 465],
    [260, 271, 260, 273],
    [171, 320, 177, 316],
    [324, 478, 325, 473],
    [166, 355, 163, 350],
    [29, 602, 47, 572],
    [139, 559, 142, 556],
    [146, 672, 152, 676],
    [281, 650, 287, 654],
    [546, 671, 548, 678],
    [443, 691, 443, 691],
] as const;
const entryLandmarksGlsl = ENTRY_LANDMARKS.map(
    ([ax, ay, bx, by]) =>
        `accumulateWarp(point, amount, vec2(${ax.toFixed(1)}, ${ay.toFixed(1)}), vec2(${((ax >= 90 && ay >= 550) || (ax >= 503 && ay <= 390) ? ax : bx).toFixed(1)}, ${((ax >= 90 && ay >= 550) || (ax >= 503 && ay <= 390) ? ay : wolfRegisteredY(by, 0)).toFixed(5)}), displacement, total);`,
).join("\n");
const howlFragment = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uAtlas;
uniform sampler2D uPalette;
uniform sampler2D uLowerBodyGeometry;
uniform sampler2D uBodyTones;
uniform vec2 uFromBody;
uniform vec2 uToBody;
uniform vec4 uFromHead;
uniform vec4 uToHead;
uniform float uFromPose;
uniform float uToPose;
uniform mat3 uInputMatrix;
uniform vec4 uFromRect;
uniform vec4 uToRect;
uniform float uFromPainted;
uniform float uToPainted;
uniform float uMix;
uniform vec4 uTintAlpha;
uniform float uTailPhase;
uniform float uTailEnvelope;
vec2 restTailOffset(vec2 body) {
    float edge=(185.0-0.34*(body.y*768.0-300.0))/768.0;
    float tail=(1.0-smoothstep(edge-0.014,edge+0.006,body.x))
        *smoothstep(300.0/768.0,410.0/768.0,body.y)
        *(1.0-smoothstep(610.0/768.0,640.0/768.0,body.y));
    float alongTail=clamp((body.y*768.0-330.0)/280.0,0.0,1.0);
    float sway=sin(uTailPhase-alongTail*0.55)*uTailEnvelope*tail*alongTail;
    return vec2(sway*18.0/768.0,sway*4.0/768.0);
}
void accumulateWarp(vec2 point, float amount, vec2 source, vec2 target, inout vec2 displacement, inout float total) {
    vec2 distance = point - mix(source, target, amount);
    float weight = 1.0 / pow(max(dot(distance, distance), 1.0), 2.0);
    displacement += (target - source) * weight;
    total += weight;
}
vec2 entryDisplacement(vec2 body, float amount) {
    vec2 point = body * 768.0;
    vec2 displacement = vec2(0.0);
    float total = 0.0;
    ${entryLandmarksGlsl}
    return displacement / max(total, 0.00000001) / 768.0;
}
vec3 materialColor(vec3 raw, float poseIndex, float material) {
    float row=(poseIndex*5.0+material+0.5)/45.0;
    vec3 color=vec3(texture(uPalette,vec2((raw.r*255.0+0.5)/256.0,row)).r,
        texture(uPalette,vec2((raw.g*255.0+0.5)/256.0,row)).g,
        texture(uPalette,vec2((raw.b*255.0+0.5)/256.0,row)).b);
    return color;
}
vec2 registeredLowerBody(vec2 point, float poseIndex) {
    if(point.y<=448.0 || point.y>=704.0) return point;
    vec2 cell=clamp((point-vec2(0.0,448.0))/4.0,vec2(0.0),vec2(192.0,64.0));
    vec2 uv=(cell+vec2(0.5,poseIndex*65.0+0.5))/vec2(193.0,585.0);
    vec4 encoded=texture(uLowerBodyGeometry,uv)*255.0;
    vec2 displacement=(vec2(dot(encoded.rg,vec2(256.0,1.0)),dot(encoded.ba,vec2(256.0,1.0)))-32768.0)/256.0;
    return point+displacement;
}
vec3 bodyTone(vec3 color, vec2 point, float poseIndex) {
    const vec2 origin=vec2(${WOLF_LOCAL_PALETTE_GRID.x.toFixed(1)},${WOLF_LOCAL_PALETTE_GRID.y.toFixed(1)});
    const vec2 size=vec2(${WOLF_LOCAL_PALETTE_GRID.columns.toFixed(1)},${WOLF_LOCAL_PALETTE_GRID.rows.toFixed(1)});
    vec2 cell=clamp((point-origin)/${WOLF_LOCAL_PALETTE_GRID.step.toFixed(1)},vec2(0.0),size-1.0);
    vec2 uv=(cell+vec2(0.5,poseIndex*size.y+0.5))/vec2(size.x,size.y*9.0);
    vec3 gain=texture(uBodyTones,uv).rgb*2.0;
    float weight=max(1.0-smoothstep(410.0,490.0,point.x),smoothstep(450.0,525.0,point.y))
        *smoothstep(230.0,270.0,point.y)*(1.0-smoothstep(700.0,728.0,point.y));
    return color*mix(vec3(1.0),gain,weight);
}
${wolfHeadGeometryGlsl}
${WOLF_HEAD_PALETTE_GLSL}
vec4 pose(vec4 rect, vec2 ribs, vec4 headFrame, float poseIndex, float painted, vec2 body) {
    if (painted < 0.5) return texture(uTexture, (uInputMatrix * vec3(body + restTailOffset(body), 1.0)).xy);
    vec2 outputPoint=body*768.0;
    body=registeredLowerBody(registeredHead(outputPoint,headFrame),poseIndex)/768.0;
    float y=body.y*768.0;
    if(y<=265.0) y+=ribs.x-265.0;
    else if(y<=485.0) y=ribs.x+(y-265.0)*(ribs.y-ribs.x)/220.0;
    else y=ribs.y+(y-485.0)*(697.0-ribs.y)/212.0;
    body.y=y/768.0;
    if (any(lessThan(body,vec2(0.0))) || any(greaterThan(body,vec2(1.0)))) return vec4(0.0);
    vec4 sampled=texture(uAtlas,rect.xy+body*rect.zw);
    if(sampled.a<=0.001) return vec4(0.0);
    vec3 raw=sampled.rgb/sampled.a;
    float head=smoothstep(460.0,540.0,body.x*768.0)*(1.0-smoothstep(390.0,475.0,y));
    float leather=smoothstep(1.55,1.85,raw.r/max(raw.g,0.001))*smoothstep(200.0,240.0,y);
    vec2 plate=(body*768.0-vec2(407.0,327.0))/vec2(43.0,54.0);
    float chroma=(max(max(raw.r,raw.g),raw.b)-min(min(raw.r,raw.g),raw.b))/max(max(max(raw.r,raw.g),raw.b),0.001);
    float steel=(1.0-smoothstep(0.82,1.12,length(plate)))*(1.0-smoothstep(0.22,0.35,chroma));
    vec3 color=mix(materialColor(raw,poseIndex,0.0),materialColor(raw,poseIndex,1.0),head);
    color=mix(color,materialColor(raw,poseIndex,2.0),leather);
    color=mix(color,materialColor(raw,poseIndex,3.0),steel);
    color=mix(color,materialColor(raw,poseIndex,4.0),smoothstep(629.0,647.0,y));
    color=bodyTone(color,outputPoint,poseIndex);
    vec4 headColor=headPalette(raw,body*768.0,poseIndex);
    color=mix(color,headColor.rgb,headColor.a);
    return vec4(color*sampled.a,sampled.a)*uTintAlpha;
}
void main(void) {
    vec2 fromBody = vBodyCoord;
    vec2 toBody = vBodyCoord;
    if (uFromPainted != uToPainted) {
        float shape = mix(uFromPainted, uToPainted, uMix);
        vec2 displacement = entryDisplacement(vBodyCoord, shape);
        fromBody += (uFromPainted - shape) * displacement;
        toBody += (uToPainted - shape) * displacement;
    }
    finalColor = mix(pose(uFromRect, uFromBody, uFromHead, uFromPose, uFromPainted, fromBody),
        pose(uToRect, uToBody, uToHead, uToPose, uToPainted, toBody), uMix);
}
`;
class WolfHowlFilter extends Filter {
    public constructor(
        private readonly sprite: Sprite,
        frames: readonly Texture[],
    ) {
        super({
            glProgram: GlProgram.from({ vertex: howlVertex, fragment: howlFragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 0,
            resources: {
                uAtlas: frames[0].source,
                uPalette: wolfPaletteTexture(),
                uLowerBodyGeometry: wolfLowerBodyGeometryTexture(),
                uBodyTones: wolfBodyTonesTexture(),
                howl: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uFromRect: { value: new Float32Array(4), type: "vec4<f32>" },
                    uToRect: { value: new Float32Array(4), type: "vec4<f32>" },
                    uFromBody: { value: new Float32Array(2), type: "vec2<f32>" },
                    uToBody: { value: new Float32Array(2), type: "vec2<f32>" },
                    uFromHead: { value: new Float32Array(4), type: "vec4<f32>" },
                    uToHead: { value: new Float32Array(4), type: "vec4<f32>" },
                    uFromPose: { value: 0, type: "f32" },
                    uToPose: { value: 0, type: "f32" },
                    uFromPainted: { value: 0, type: "f32" },
                    uToPainted: { value: 0, type: "f32" },
                    uMix: { value: 0, type: "f32" },
                    uTailPhase: { value: 0, type: "f32" },
                    uTailEnvelope: { value: 0, type: "f32" },
                    uTintAlpha: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(elapsedMs: number, durations: readonly number[], frames: readonly Texture[]): void {
        const blend = wolfHowlBlend(elapsedMs, durations);
        const uniforms = this.resources.howl.uniforms;
        for (const [side, index] of [
            ["From", blend.from],
            ["To", blend.to],
        ] as const) {
            const texture = frames[index];
            const { x, y, width, height } = texture.frame;
            uniforms[`u${side}Rect`].set([
                x / texture.source.width,
                y / texture.source.height,
                width / texture.source.width,
                height / texture.source.height,
            ]);
            const pose = Math.max(0, wolfHowlPoseIndex(index));
            uniforms[`u${side}Body`].set(WOLF_POSE_BODY[pose]);
            uniforms[`u${side}Head`].set(WOLF_HEAD_FRAMES[pose]);
            uniforms[`u${side}Pose`] = pose;
            uniforms[`u${side}Painted`] = index === 0 ? 0 : 1;
        }
        this.resources.uAtlas = frames[0].source;
        uniforms.uMix = blend.mix;
        const tail = wolfTailMotion(elapsedMs, durations);
        uniforms.uTailPhase = tail.phase;
        uniforms.uTailEnvelope = tail.envelope;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const [manager] = args;
        const uniforms = this.resources.howl.uniforms;
        manager.calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        const tint = this.sprite.getGlobalTint();
        const alpha = this.sprite.getGlobalAlpha();
        uniforms.uTintAlpha.set([
            (((tint >> 16) & 255) / 255) * alpha,
            (((tint >> 8) & 255) / 255) * alpha,
            ((tint & 255) / 255) * alpha,
            alpha,
        ]);
        super.apply(...args);
    }
}
const howlFilters = new WeakMap<Sprite, WolfHowlFilter>();
export function syncWolfIdleVisuals(
    sprite: Sprite,
    frame: number,
    elapsedMs: number,
    durations: readonly number[],
    frames: readonly Texture[] = [],
): void {
    // Keep one sampling/filter path for howl, return and tail idle. Switching filters at
    // the last howl frame changed the sampling bounds of the otherwise identical figure.
    const fullIdle = frame >= 0 && frames.length >= 18;
    const tailEnabled = frame >= 0 && wolfHowlPoseIndex(frame) < 0;
    let howl = howlFilters.get(sprite);
    if (fullIdle) {
        if (!howl) {
            try {
                howl = new WolfHowlFilter(sprite, frames);
                howlFilters.set(sprite, howl);
                const owned = howl;
                sprite.once("destroyed", () => {
                    owned.destroy();
                    howlFilters.delete(sprite);
                });
            } catch {
                // The non-WebGL test renderer keeps the source cutout.
            }
        }
        howl?.update(elapsedMs, durations, frames);
    }
    let tail = tailFilters.get(sprite);
    if (!fullIdle && tailEnabled && !tail) {
        try {
            tail = Filter.from({
                gl: { vertex, fragment },
                resources: {
                    tail: {
                        uPhase: { value: 0, type: "f32" },
                        uEnvelope: { value: 0, type: "f32" },
                        uMirror: { value: 0, type: "f32" },
                    },
                },
            });
            tail.resolution = "inherit";
            tail.padding = 0;
            tailFilters.set(sprite, tail);
            const owned = tail;
            sprite.once("destroyed", () => {
                owned.destroy();
                tailFilters.delete(sprite);
            });
        } catch {
            // Headless tests retain the exact source cutout.
        }
    }
    if (tail && tailEnabled) {
        const motion = wolfTailMotion(elapsedMs, durations);
        tail.resources.tail.uniforms.uPhase = motion.phase;
        tail.resources.tail.uniforms.uEnvelope = motion.envelope;
        tail.resources.tail.uniforms.uMirror = sprite.scale.x < 0 ? 1 : 0;
    }
    const installed = sprite.filters ?? [];
    const desired = fullIdle ? howl : tailEnabled ? tail : undefined;
    const current = installed.find((entry) => entry === tail || entry === howl);
    if (current === desired) return;
    const rest = installed.filter((entry) => entry !== tail && entry !== howl);
    sprite.filters = desired ? [desired, ...rest] : rest.length ? rest : null;
}
