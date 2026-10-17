import { Filter, GlProgram, Matrix, Sprite, Texture, Container, Rectangle } from "pixi.js";
import { NIGHTMARE_ATTACK_CALIBRATION, NIGHTMARE_ATTACK_HEADS } from "./NightmareLabAttackCalibration";
import {
    NIGHTMARE_CAST_CALIBRATION,
    NIGHTMARE_CAST_HEADS,
    NIGHTMARE_CAST_NOSES,
    NIGHTMARE_CAST_DURATIONS,
    NIGHTMARE_CAST_PLAYBACK_SPEED,
    NIGHTMARE_CAST_SMOKE_SCALE,
} from "./NightmareLabCastCalibration";
import { NIGHTMARE_WIND_GLSL } from "./NightmareLabIdleWind";

// Measured opaque-hide RGB quartiles from the canonical idle and authored reaction frames.
// The first/last hit frames and first death frame are the original idle image.
const idleHide = [
    [0.035, 0.012, 0.008],
    [0.063, 0.039, 0.039],
    [0.141, 0.106, 0.122],
];
const reactionRegistration = {
    ...NIGHTMARE_ATTACK_CALIBRATION,
    cast: NIGHTMARE_CAST_CALIBRATION,
    hit: [
        [1, ...idleHide],
        [1, [0.0431, 0.0118, 0.0118], [0.0745, 0.0431, 0.0549], [0.1804, 0.1333, 0.149]],
        [1, [0.0471, 0.0118, 0.0118], [0.0784, 0.0431, 0.0549], [0.1765, 0.1333, 0.149]],
        [1, [0.0471, 0.0118, 0.0118], [0.0784, 0.0471, 0.0549], [0.1804, 0.1373, 0.149]],
        [1, [0.0431, 0.0118, 0.0118], [0.0745, 0.0431, 0.0549], [0.1804, 0.1333, 0.149]],
        [1, ...idleHide],
    ],
    death: [
        [1, ...idleHide],
        [1, [0.067, 0.035, 0.035], [0.11, 0.075, 0.09], [0.227, 0.176, 0.204]],
        [1, [0.063, 0.031, 0.031], [0.102, 0.067, 0.078], [0.208, 0.153, 0.176]],
        [1, [0.067, 0.035, 0.035], [0.114, 0.078, 0.094], [0.231, 0.176, 0.204]],
        [1, [0.067, 0.031, 0.031], [0.11, 0.075, 0.086], [0.208, 0.157, 0.173]],
    ],
} as const;

export type NightmareLabAction = keyof typeof reactionRegistration;
export function isNightmareLabAction(state?: string): state is NightmareLabAction {
    return state !== undefined && Object.prototype.hasOwnProperty.call(reactionRegistration, state);
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
uniform sampler2D uPoseTexture;
uniform vec4 uPoseFrame;
uniform float uFireEnabled;
uniform vec4 uHead;
uniform mat3 uInputMatrix;
uniform float uTime;
uniform float uPhase;
uniform float uAlpha;
uniform float uWalking;
uniform float uReaction;
uniform float uPoseScale;
uniform vec3 uHideLow;
uniform vec3 uHideMid;
uniform vec3 uHideHigh;
uniform vec4 uInputClamp;
${NIGHTMARE_WIND_GLSL}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec4 h = fract(sin(vec4(dot(i, vec2(127.1, 311.7)), dot(i + vec2(1,0), vec2(127.1, 311.7)),
        dot(i + vec2(0,1), vec2(127.1, 311.7)), dot(i + vec2(1,1), vec2(127.1, 311.7)))) * 43758.5453);
    return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}
vec4 sampleFrame(sampler2D atlas, vec4 frame, vec2 p) {
    // Sample the complete authored frame, not the filter's cropped screen-space input.
    // Explicit transparent borders also prevent smearing pixels beyond the atlas cell.
    if (any(lessThan(p, vec2(0.0))) || any(greaterThanEqual(p, vec2(768.0)))) return vec4(0.0);
    return texture(atlas, frame.xy + (p / 768.0) * frame.zw) * uAlpha;
}
vec4 sampleBody(vec2 p) {
    return sampleFrame(uPoseTexture, uPoseFrame, p);
}
float headExclusion(vec2 p) {
    return smoothstep(uHead.x - 12.0, uHead.x, p.x)
        * smoothstep(uHead.y - 12.0, uHead.y, p.y)
        * (1.0 - smoothstep(uHead.z, uHead.z + 12.0, p.x))
        * (1.0 - smoothstep(uHead.w, uHead.w + 12.0, p.y));
}
float firePigment(vec4 c) {
    // Select the existing crimson strands, excluding purple hide and neutral highlights.
    vec3 rgb = c.rgb / max(c.a, 0.001);
    return smoothstep(0.07, 0.24, rgb.r - max(rgb.g, rgb.b)) * c.a;
}
void main() {
    // Full authored frames at native scale: no body-part blends, offsets or deformation in reactions.
    vec2 destination = (vBodyCoord * 768.0 - vec2(384.0, 732.0)) / uPoseScale + vec2(384.0, 732.0);
    vec2 source = destination;
    for (int i = 0; i < 6; i++) source = destination - windOffset(source) * (1.0 - uWalking);
    vec2 weights = windWeights(source);
    float mask = max(weights.x, weights.y) * (1.0 - uWalking);
    vec2 flow = vec2(source.x * 0.065, (source.y + uTime * 68.0) * 0.037);
    float curl = noise(flow) * 0.65 + noise(flow * 2.03 + vec2(4.1, uTime * 0.7)) * 0.35;
    // Small upward travelling curls ride the larger, root-anchored wind wave.
    vec2 flameSource = source + mask * vec2((curl - 0.5) * 6.0, sin(source.x * 0.07 + uTime * 4.3) * 2.0);
    vec4 body = sampleBody(flameSource);
    // Combustion covers the attached strands too; only the loose ends receive wind deformation.
    float maneFire = (1.0 - smoothstep(490.0 + 410.0 - source.y, 518.0 + 410.0 - source.y, source.x))
        * (1.0 - smoothstep(399.0, 416.0, source.y)) * smoothstep(195.0, 220.0, source.y);
    float tailFire = (1.0 - smoothstep(251.0 - max(0.0, source.y - 430.0) * 0.44,
        274.0 - max(0.0, source.y - 430.0) * 0.44, source.x)) * smoothstep(388.0, 416.0, source.y);
    // Reuse the same combustion on red leg strands, without displacing the planted legs or hooves.
    float legFire = smoothstep(523.0, 557.0, source.y) * (1.0 - smoothstep(704.0, 726.0, source.y))
        * smoothstep(166.0, 190.0, source.x) * (1.0 - smoothstep(600.0, 623.0, source.x));
    // Walking silhouettes change every frame: follow their crimson pigment instead of idle geometry.
    // Exclude the eye/face while letting all moving leg and tail tips retain their fire.
    float walkHead = smoothstep(630.0, 650.0, source.x) * smoothstep(285.0, 310.0, source.y)
        * (1.0 - smoothstep(435.0, 465.0, source.y));
    float fireMask = mix(max(max(maneFire, tailFire), legFire), 1.0 - walkHead * (1.0 - uReaction), uWalking);
    fireMask *= (1.0 - headExclusion(source)) * uFireEnabled;
    float pulse = smoothstep(0.18, 0.8, curl);
    float pigment = firePigment(body) / max(body.a, 0.001);
    float heat = clamp(pulse * 0.65 + body.r / max(body.a, 0.001) * 0.55, 0.0, 1.0);
    vec3 core = mix(vec3(1.0, 0.19, 0.008), vec3(1.0, 0.91, 0.42), heat * heat);
    vec3 hide = body.rgb / max(body.a, 0.001);
    vec3 targetLow = vec3(0.035, 0.012, 0.008);
    vec3 targetMid = vec3(0.063, 0.039, 0.039);
    vec3 targetHigh = vec3(0.141, 0.106, 0.122);
    vec3 low = hide * targetLow / uHideLow;
    vec3 mid = targetLow + (hide - uHideLow) * (targetMid - targetLow) / (uHideMid - uHideLow);
    vec3 high = targetMid + (hide - uHideMid) * (targetHigh - targetMid) / (uHideHigh - uHideMid);
    vec3 matchedHide = mix(mix(low, mid, step(uHideLow, hide)), high, step(uHideMid, hide));
    // Grade the hide only: keep the original crimson emission driving identical fire in all states.
    body.rgb = mix(body.rgb, matchedHide * body.a, uReaction * (1.0 - pigment));
    body.rgb = mix(body.rgb, core * body.a, fireMask * pigment * 0.96);
    // Taller rising tongues and a soft orange envelope make the fire readable on the battlefield.
    vec4 rise = sampleBody(flameSource + vec2((curl - 0.5) * 15.0, 8.0 + pulse * 24.0));
    float lick = fireMask * firePigment(rise) * (1.0 - headExclusion(flameSource + vec2((curl - 0.5) * 15.0, 8.0 + pulse * 24.0))) * (0.45 + pulse * 0.5);
    float glow = fireMask * (firePigment(sampleBody(source + vec2(9.0, 7.0)))
        + firePigment(sampleBody(source + vec2(-9.0, 7.0)))
        + firePigment(sampleBody(source + vec2(0.0, 15.0)))) * 0.13;
    float flameAlpha = clamp(lick + glow, 0.0, uAlpha) * (1.0 - body.a);
    vec3 flameColor = mix(vec3(1.0, 0.16, 0.006), vec3(1.0, 0.65, 0.075), pulse);
    vec3 emission = flameColor * flameAlpha;
    float alpha = min(body.a + flameAlpha, uAlpha);
    finalColor = vec4(min(body.rgb + emission, vec3(alpha)), alpha);

}`;

class NightmareIdleWindFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 32,
            resources: {
                uPoseTexture: sprite.texture.source,
                idle: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uTime: { value: 0, type: "f32" },
                    uPhase: { value: 0, type: "f32" },
                    uAlpha: { value: 1, type: "f32" },
                    uWalking: { value: 0, type: "f32" },
                    uReaction: { value: 0, type: "f32" },
                    uPoseFrame: { value: [0, 0, 1, 1], type: "vec4<f32>" },
                    uSmokeRect: { value: [0, 0, 1, 1], type: "vec4<f32>" },
                    uSmokeStage: { value: 0, type: "f32" },
                    uSmokeAlpha: { value: 0, type: "f32" },
                    uFireEnabled: { value: 1, type: "f32" },
                    uHead: { value: [768, 768, 768, 768], type: "vec4<f32>" },
                    uPoseScale: { value: 1, type: "f32" },
                    uHideLow: { value: idleHide[0], type: "vec3<f32>" },
                    uHideMid: { value: idleHide[1], type: "vec3<f32>" },
                    uHideHigh: { value: idleHide[2], type: "vec3<f32>" },
                },
            },
        });
    }
    public update(
        nowMs: number,
        phase: number,
        walking: boolean,
        reacting: boolean,
        reaction?: NightmareLabAction,
        frameIndex = 0,
        smokeTexture?: Texture,
        frameElapsedMs = 0,
    ): void {
        const registration = reaction ? reactionRegistration[reaction][frameIndex] : undefined;
        const uniforms = this.resources.idle.uniforms;
        uniforms.uPoseScale = registration?.[0] ?? 1;
        uniforms.uFireEnabled = reaction === "death" ? 0 : 1;
        const casting = reaction === "cast" && !!smokeTexture;
        this.padding = 32;
        const elapsed =
            NIGHTMARE_CAST_DURATIONS.slice(0, frameIndex).reduce<number>((sum, ms) => sum + ms, 0) +
            frameElapsedMs * NIGHTMARE_CAST_PLAYBACK_SPEED;
        const breath = Math.max(0, elapsed - 280);
        const nose = NIGHTMARE_CAST_NOSES[Math.min(frameIndex, NIGHTMARE_CAST_NOSES.length - 1)];
        // Once the exhale ends, leave the cloud in the air rather than pulling it down with the head.
        const origin = frameIndex >= 6 ? NIGHTMARE_CAST_NOSES[5] : nose;
        const scale = NIGHTMARE_CAST_SMOKE_SCALE;
        const drift = Math.max(0, breath - 1040) * 0.055 * scale;
        uniforms.uSmokeRect = [
            origin[0] - 51 * scale + drift,
            origin[1] - 350 * scale - drift * 0.65,
            540 * scale,
            430 * scale,
        ];
        uniforms.uSmokeStage = Math.min(3, breath / 350);
        uniforms.uSmokeAlpha = casting
            ? Math.min(1, breath / 120) * Math.max(0, Math.min(1, (1720 - breath) / 580))
            : 0;
        // Masks follow the authored face/forelock, never the mane behind the ears.
        const head =
            reaction === "cast"
                ? NIGHTMARE_CAST_HEADS[frameIndex]
                : reaction === "hit"
                  ? [
                        [630, 235, 768, 435],
                        [580, 235, 740, 415],
                        [520, 200, 745, 390],
                        [625, 315, 755, 540],
                        [580, 235, 740, 415],
                        [630, 235, 768, 435],
                    ][frameIndex]
                  : reaction === "death"
                    ? [
                          [630, 235, 768, 435],
                          [642, 415, 768, 645],
                          [638, 470, 768, 720],
                          [640, 490, 768, 730],
                          [645, 600, 768, 768],
                      ][frameIndex]
                    : reaction && reaction in NIGHTMARE_ATTACK_HEADS
                      ? NIGHTMARE_ATTACK_HEADS[reaction as keyof typeof NIGHTMARE_ATTACK_HEADS][frameIndex]
                      : undefined;
        uniforms.uHead = head ?? [768, 768, 768, 768];
        uniforms.uHideLow = registration?.[1] ?? idleHide[0];
        uniforms.uHideMid = registration?.[2] ?? idleHide[1];
        uniforms.uHideHigh = registration?.[3] ?? idleHide[2];
        this.resources.idle.uniforms.uReaction = reacting ? 1 : 0;
        this.resources.idle.uniforms.uWalking = walking ? 1 : 0;
        this.resources.idle.uniforms.uTime = nowMs / 1000;
        this.resources.idle.uniforms.uPhase = phase;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.idle.uniforms;
        const frameRect = (texture: Texture) => [
            texture.frame.x / texture.source.width,
            texture.frame.y / texture.source.height,
            texture.frame.width / texture.source.width,
            texture.frame.height / texture.source.height,
        ];
        this.resources.uPoseTexture = this.sprite.texture.source;
        uniforms.uPoseFrame = frameRect(this.sprite.texture);
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        uniforms.uAlpha = this.sprite.getGlobalAlpha();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, NightmareIdleWindFilter>();

/** Lab-only continuous fire across idle/walk; authored walk poses own their geometry. */
export function syncNightmareLabIdleWind(
    sprite: Sprite,
    enabled: boolean,
    nowMs: number,
    phase: number,
    walking = false,
    reacting = false,
    reaction?: NightmareLabAction,
    frameIndex = 0,
    smokeTexture?: Texture,
    frameElapsedMs = 0,
): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new NightmareIdleWindFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(nowMs, phase, walking, reacting, reaction, frameIndex, smokeTexture, frameElapsedMs);
    syncCastSmokeSprites(sprite, enabled ? smokeTexture : undefined, filter.resources.idle.uniforms);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...remaining, filter] : remaining.length ? remaining : null;
}

// Real sprite bounds must include the cloud: the camera's outer cinematic filter otherwise clips
// a child filter's padding back to the horse's rectangle, especially on an otherwise empty lab board.
const smokeLayers = new WeakMap<
    Sprite,
    { container: Container; sprites: Sprite[]; frames: Texture[]; source: Texture["source"] }
>();
function syncCastSmokeSprites(
    body: Sprite,
    atlas: Texture | undefined,
    uniforms: { uSmokeAlpha: number; uSmokeStage: number; uSmokeRect: number[] },
): void {
    let layer = smokeLayers.get(body);
    if (!atlas || uniforms.uSmokeAlpha <= 0 || !body.parent) {
        if (layer) layer.container.visible = false;
        return;
    }
    if (layer && layer.source !== atlas.source) {
        layer.container.destroy({ children: true });
        layer.frames.forEach((frame) => frame.destroy());
        smokeLayers.delete(body);
        layer = undefined;
    }
    if (!layer) {
        const frames = Array.from(
            { length: 4 },
            (_, index) =>
                new Texture({
                    source: atlas.source,
                    frame: new Rectangle(
                        ((index % 2) * atlas.source.width) / 2,
                        (Math.floor(index / 2) * atlas.source.height) / 2,
                        atlas.source.width / 2,
                        atlas.source.height / 2,
                    ),
                }),
        );
        const container = new Container({ eventMode: "none" });
        const sprites = [new Sprite(frames[0]), new Sprite(frames[0])];
        container.addChild(...sprites);
        layer = { container, sprites, frames, source: atlas.source };
        smokeLayers.set(body, layer);
        body.once("destroyed", () => {
            const current = smokeLayers.get(body);
            current?.container.destroy({ children: true });
            current?.frames.forEach((frame) => frame.destroy());
            smokeLayers.delete(body);
        });
    }
    const { container, sprites, frames } = layer;
    if (container.parent !== body.parent) body.parent.addChild(container);
    container.visible = true;
    container.position.copyFrom(body.position);
    container.scale.copyFrom(body.scale);
    container.pivot.copyFrom(body.pivot);
    container.skew.copyFrom(body.skew);
    container.rotation = body.rotation;
    container.zIndex = body.zIndex + 0.01;
    container.alpha = body.alpha * uniforms.uSmokeAlpha;
    const stage = uniforms.uSmokeStage;
    const first = Math.floor(stage);
    const mix = stage - first;
    const rect = uniforms.uSmokeRect;
    sprites.forEach((sprite, index) => {
        sprite.texture = frames[Math.min(3, first + index)];
        sprite.position.set(rect[0] - body.anchor.x * 768, rect[1] - body.anchor.y * 768);
        sprite.scale.set(rect[2] / sprite.texture.width, rect[3] / sprite.texture.height);
        sprite.alpha = index === 0 ? 1 - mix : mix;
    });
}
