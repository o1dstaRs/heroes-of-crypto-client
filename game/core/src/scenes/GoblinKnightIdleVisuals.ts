import { GOBLIN_ICE_GLOW_GLSL } from "./GoblinKnightIceGlow";
import { Filter, GlProgram, Matrix, Texture, type Sprite } from "pixi.js";
import { GOBLIN_SHARED_PALETTE_GLSL } from "./GoblinKnightPalette";

// Authoring coordinates of the current 768px battlefield figurine.
export const GOBLIN_IDLE_SWAY_PERIOD_MS = 4200;
export const GOBLIN_IDLE_WIND_SPEED = 2.6;

const smoothstep = (a: number, b: number, x: number): number => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/** Wind is rooted at the shoulder; only the free feathered edge catches the full gust. */
export function goblinIdleOffset(x: number, y: number, elapsedMs: number): [number, number] {
    const t = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) / 1000;
    const phase = (t * Math.PI * 2) / (GOBLIN_IDLE_SWAY_PERIOD_MS / 1000);
    const upper = 1 - smoothstep(500, 710, y);
    const edge = 270 + 38 * smoothstep(430, 640, y);
    const cape = (1 - smoothstep(edge - 35, edge, x)) * smoothstep(240, 330, y) * (1 - smoothstep(650, 708, y));
    const free = Math.max(0, Math.min(1, (405 - x) / 235));
    const wave = Math.sin(y * 0.019 - GOBLIN_IDLE_WIND_SPEED * t) + 0.3 * Math.sin(y * 0.038 - 3.7 * t);
    return [
        5 * Math.sin(phase) * upper + 15 * cape * free * wave,
        2 * Math.sin(phase * 2) * upper + 5 * cape * free * wave,
    ];
}

export const GOBLIN_ETCH_FRAME_MS = 100;
export const GOBLIN_ETCH_START_MS = 7000;
export const GOBLIN_ETCH_BLADE_POSES: readonly (readonly [number, number, number, number])[] = [
    [353, 474, 589, 706],
    [459, 426, 687, 647],
    [521, 450, 745, 672],
    [507, 494, 717, 722],
    [491, 512, 709, 731],
    [499, 516, 706, 722],
    [445, 500, 659, 721],
    [403, 536, 555, 717],
    [461, 424, 694, 636],
    [393, 412, 641, 636],
    [353, 478, 587, 706],
    [357, 476, 591, 707],
];

// The trace and the weapon aura consume the same measured tip coordinates.
export const GOBLIN_ETCH_CONTACTS = GOBLIN_ETCH_BLADE_POSES.slice(4, 8).map((pose): readonly [number, number] => [
    pose[2],
    pose[3],
]);

/** Only completed, actually drawn contact frames can extend the ground trace. */
export function goblinIdleEtch(elapsedMs: number): { frame: number; active: boolean; segments: number; frost: number } {
    const t = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) % 12000;
    const action = t - GOBLIN_ETCH_START_MS;
    const active = action >= 0 && action < 1200;
    const frame = active ? Math.min(11, Math.floor(action / GOBLIN_ETCH_FRAME_MS)) : 0;
    const contacted = action >= 400;
    return {
        frame,
        active,
        segments: contacted ? Math.min(3, Math.max(0, Math.floor(action / GOBLIN_ETCH_FRAME_MS) - 4)) : 0,
        frost: contacted ? 1 - smoothstep(8250, 9400, t) : 0,
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
uniform sampler2D uAtlas;
uniform float uFrame;
uniform float uReady;
uniform float uGesture;
uniform float uSegments;
uniform vec4 uBlade;
uniform vec4 uTintAlpha;
uniform float uFrost;
uniform sampler2D uFissure;
uniform float uFissureReady;
uniform vec4 uContacts01;
uniform vec4 uContacts23;

${GOBLIN_SHARED_PALETTE_GLSL}

vec2 motion(vec2 p) {
    float phase = uTime * 6.28318530718 / 4.2;
    float upper = 1.0 - smoothstep(500.0, 710.0, p.y);
    float edge = 270.0 + 38.0 * smoothstep(430.0, 640.0, p.y);
    float cape = (1.0 - smoothstep(edge - 35.0, edge, p.x))
        * smoothstep(240.0, 330.0, p.y) * (1.0 - smoothstep(650.0, 708.0, p.y));
    float freeEdge = clamp((405.0 - p.x) / 235.0, 0.0, 1.0);
    float wave = sin(p.y * 0.019 - 2.6 * uTime) + 0.3 * sin(p.y * 0.038 - 3.7 * uTime);
    return vec2(5.0 * sin(phase) * upper + 15.0 * cape * freeEdge * wave,
                2.0 * sin(phase * 2.0) * upper + 5.0 * cape * freeEdge * wave);
}
vec4 sampleArt(vec2 p) {
    if (uReady > 0.5) {
        if (any(lessThan(p, vec2(0.0))) || any(greaterThan(p, vec2(768.0)))) return vec4(0.0);
        vec2 cell = vec2(mod(uFrame, 4.0), floor(uFrame / 4.0));
        vec2 uv = (cell + clamp(p / 768.0, vec2(0.5 / 768.0), vec2(767.5 / 768.0))) / vec2(4.0, 3.0);
        return texture(uAtlas, uv) * uTintAlpha;
    }
    vec2 uv = (uInputMatrix * vec3(p / 768.0, 1.0)).xy;
    return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}
${GOBLIN_ICE_GLOW_GLSL}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
}
void main() {
    vec2 destination = vBodyCoord * 768.0;
    vec2 source = destination;
    for (int i = 0; i < 4; i++) source = destination - motion(source) * (1.0 - uGesture);
    vec4 body = goblinPalette(sampleArt(source), uReady);
    vec4 figure = goblinIceFigure(body, source);

    // Map a separately painted ice crevice onto the measured tip polyline.
    // User-requested enlargement is symmetric around the original midpoint; caps bound that enlarged footprint.
    vec2 contact[4];
    contact[0] = uContacts01.xy;
    contact[1] = uContacts01.zw;
    contact[2] = uContacts23.xy;
    contact[3] = uContacts23.zw;
    vec2 center = (contact[0] + contact[3]) * 0.5;
    vec2 lengthAxis = normalize(contact[3] - contact[0]);
    vec2 widthAxis = vec2(-lengthAxis.y, lengthAxis.x);
    vec2 relative = destination - center;
    vec2 tracePosition = center + lengthAxis * (dot(relative, lengthAxis) / 1.56)
        + widthAxis * (dot(relative, widthAxis) / 1.32);
    float total = length(contact[1] - contact[0]) + length(contact[2] - contact[1]) + length(contact[3] - contact[2]);
    float prefix = 0.0;
    float revealed = 0.0;
    float best = 1e6;
    vec2 decalUV = vec2(0.0);
    for (int k = 0; k < 3; k++) {
        vec2 delta = contact[k + 1] - contact[k];
        float len = length(delta);
        vec2 tangent = delta / len;
        float raw = dot(tracePosition - contact[k], tangent);
        float along = clamp(raw, 0.0, len);
        float distanceToLine = length(tracePosition - contact[k] - tangent * along);
        if (distanceToLine < best) {
            best = distanceToLine;
            float side = dot(tracePosition - contact[k], vec2(-tangent.y, tangent.x));
            decalUV = vec2((prefix + along) / total, 0.5 + side / 30.0);
        }
        if (float(k) < uSegments) revealed += len;
        prefix += len;
    }
    vec2 startDirection = normalize(contact[1] - contact[0]);
    vec2 endPoint = uSegments > 2.5 ? contact[3] : (uSegments > 1.5 ? contact[2] : contact[1]);
    vec2 previousPoint = uSegments > 2.5 ? contact[2] : (uSegments > 1.5 ? contact[1] : contact[0]);
    vec2 endDirection = normalize(endPoint - previousPoint);
    bool within = dot(tracePosition - contact[0], startDirection) >= 0.0
        && dot(tracePosition - endPoint, endDirection) <= 0.0
        && decalUV.x * total <= revealed && decalUV.y >= 0.0 && decalUV.y <= 1.0;
    vec4 floorIce = vec4(0.0);
    if (uSegments > 0.5 && within && uFissureReady > 0.5) {
        floorIce = texture(uFissure, decalUV) * uFrost * uTintAlpha;
    }
    finalColor = figure + floorIce * (1.0 - figure.a);
}`;

export class GoblinKnightIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            padding: 12,
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                uAtlas: Texture.WHITE.source,
                uFissure: Texture.WHITE.source,
                goblin: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uTime: { value: 0, type: "f32" },
                    uFrame: { value: 0, type: "f32" },
                    uReady: { value: 0, type: "f32" },
                    uGesture: { value: 0, type: "f32" },
                    uSegments: { value: 0, type: "f32" },
                    uBlade: { value: new Float32Array([414, 481, 598, 709]), type: "vec4<f32>" },
                    uTintAlpha: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" },
                    uFrost: { value: 0, type: "f32" },
                    uFissureReady: { value: 0, type: "f32" },
                    uContacts01: {
                        value: new Float32Array(GOBLIN_ETCH_CONTACTS.slice(0, 2).flat()),
                        type: "vec4<f32>",
                    },
                    uContacts23: {
                        value: new Float32Array(GOBLIN_ETCH_CONTACTS.slice(2, 4).flat()),
                        type: "vec4<f32>",
                    },
                },
            },
        });
    }
    public update(elapsedMs: number, atlas?: Texture, fissure?: Texture): void {
        const uniforms = this.resources.goblin.uniforms;
        const fissureReady = !!fissure && fissure.width > 16 && fissure.height > 4;
        if (fissureReady) this.resources.uFissure = fissure.source;
        uniforms.uFissureReady = fissureReady ? 1 : 0;
        uniforms.uTime = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) / 1000;
        const etch = goblinIdleEtch(elapsedMs);
        const ready = atlas?.width === 3072 && atlas.height === 2304;
        if (ready) this.resources.uAtlas = atlas.source;
        uniforms.uReady = ready ? 1 : 0;
        uniforms.uFrame = etch.frame;
        uniforms.uGesture = ready && etch.active ? 1 : 0;
        uniforms.uSegments = etch.segments;
        uniforms.uFrost = ready ? etch.frost : 0;
        uniforms.uBlade.set(ready ? GOBLIN_ETCH_BLADE_POSES[etch.frame] : [414, 481, 598, 709]);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.goblin.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
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

const filters = new WeakMap<Sprite, GoblinKnightIdleFilter>();
const idleStarts = new WeakMap<Sprite, number>();

export function syncGoblinKnightIdle(
    sprite: Sprite,
    enabled: boolean,
    elapsedMs: number,
    atlas?: Texture,
    fissure?: Texture,
): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new GoblinKnightIdleFilter(sprite);
        filters.set(sprite, filter);
    }
    if (!filter) return;
    const installed = sprite.filters ?? [];
    if (enabled) {
        if (!installed.includes(filter) || elapsedMs < (idleStarts.get(sprite) ?? 0)) idleStarts.set(sprite, elapsedMs);
        filter.update(elapsedMs - (idleStarts.get(sprite) ?? elapsedMs), atlas, fissure);
    }
    if (installed.includes(filter) === enabled) return;
    const others = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...others, filter] : others.length ? others : null;
}
