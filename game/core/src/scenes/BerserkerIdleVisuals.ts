import { BufferImageSource, Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { BERSERKER_IDLE_POSE_ORDER, BERSERKER_POSE_TONES, BERSERKER_REFERENCE_TONES } from "./BerserkerIdleCalibration";

export const BERSERKER_IDLE_PAUSE_MS = 4200 * 0.75;
export const BERSERKER_WAITING_SPEED = 1.3 * 1.2;

// Pose 07 (playback frames 9 and 11) dips the crown by 22px while both boots remain fixed.
// Translate its head intact and taper through the torso; never resize the complete figure.
export const BERSERKER_INSPECTION_HEAD_OFFSET = 22;
export function berserkerPoseSourceY(y: number, pose: number, x = 575): number {
    if (pose !== 9 || y >= 650) return y;
    const t = Math.max(0, Math.min(1, (y - 535) / 115));
    const left = Math.max(0, Math.min(1, (x - 460) / 50));
    const right = Math.max(0, Math.min(1, (x - 640) / 35));
    const body = left * left * (3 - 2 * left) * (1 - right * right * (3 - 2 * right));
    return y + BERSERKER_INSPECTION_HEAD_OFFSET * (1 - t * t * (3 - 2 * t)) * body;
}

export function berserkerPaletteValue(pose: number, channel: number, value: number): number {
    if (pose <= 0 || pose >= BERSERKER_POSE_TONES.length) return value;
    const source = BERSERKER_POSE_TONES[pose][channel];
    const target = BERSERKER_REFERENCE_TONES[channel];
    if (value <= source[0]) return target[0];
    for (let i = 1; i < source.length; i++) {
        if (value <= source[i]) {
            return (
                target[i - 1] +
                ((target[i] - target[i - 1]) * (value - source[i - 1])) / Math.max(1, source[i] - source[i - 1])
            );
        }
    }
    return target[target.length - 1];
}

/** A connected weight shift fades to exact neutral before the sword hand starts moving. */
export function berserkerWaitingMotion(elapsedMs: number, durations: readonly number[]): { x: number; y: number } {
    const cycle = durations.reduce((sum, ms) => sum + ms, 0);
    if (!Number.isFinite(elapsedMs) || cycle <= 0) return { x: 0, y: 0 };
    const time = ((elapsedMs % cycle) + cycle) % cycle;
    const rest = durations[0];
    if (time >= rest || rest <= 0) return { x: 0, y: 0 };
    const envelope = Math.sin((Math.PI * time) / rest) ** 2;
    const phase = (2 * Math.PI * time * BERSERKER_WAITING_SPEED) / rest;
    return { x: 4 * Math.sin(phase) * envelope, y: Math.sin(phase * 2) * envelope };
}

/** Authoring-space displacement; both boots and the lower shins are exactly fixed. */
export function berserkerWaitingOffset(y: number, motion: { x: number; y: number }): { x: number; y: number } {
    if (y >= 820) return { x: 0, y: 0 };
    const t = Math.max(0, Math.min(1, (y - 560) / 260));
    const weight = 1 - t * t * (3 - 2 * t);
    return { x: motion.x * weight, y: motion.y * weight };
}

let palette: BufferImageSource | undefined;
function paletteSource(): BufferImageSource {
    if (palette) return palette;
    const data = new Uint8Array(256 * BERSERKER_POSE_TONES.length * 4);
    for (let pose = 0; pose < BERSERKER_POSE_TONES.length; pose++) {
        for (let value = 0; value < 256; value++) {
            const at = (pose * 256 + value) * 4;
            for (let c = 0; c < 3; c++) data[at + c] = Math.round(berserkerPaletteValue(pose, c, value));
            data[at + 3] = 255;
        }
    }
    return (palette = new BufferImageSource({
        resource: data,
        width: 256,
        height: BERSERKER_POSE_TONES.length,
        scaleMode: "linear",
        alphaMode: "no-premultiply-alpha",
    }));
}

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vBodyCoord;
uniform mat3 uBodyMatrix;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vBodyCoord = (uBodyMatrix * vec3(vTextureCoord, 1.0)).xy;
}
`;
const fragment = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uPalette;
uniform mat3 uInputMatrix;
uniform vec4 uInputClamp;
uniform vec2 uSway;
uniform float uPose;
void main(void) {
    // Constant head translation, gradually decreasing through torso and hips to zero above boots.
    float weight = 1.0 - smoothstep(560.0, 820.0, vBodyCoord.y * 1024.0);
    vec2 body = vBodyCoord + uSway * weight / 1024.0;
    if (abs(uPose - 9.0) < 0.5) {
        body.y += ${BERSERKER_INSPECTION_HEAD_OFFSET.toFixed(1)} / 1024.0 *
            (1.0 - smoothstep(535.0, 650.0, body.y * 1024.0)) *
            smoothstep(460.0, 510.0, body.x * 1024.0) *
            (1.0 - smoothstep(640.0, 675.0, body.x * 1024.0));
    }
    vec2 uv = (uInputMatrix * vec3(body, 1.0)).xy;
    vec4 sampled = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
    if (sampled.a < 0.001 || uPose < 0.5) { finalColor = sampled; return; }
    vec3 raw = sampled.rgb / sampled.a;
    float row = (uPose + 0.5) / ${BERSERKER_POSE_TONES.length.toFixed(1)};
    vec3 corrected = vec3(
        texture(uPalette, vec2((raw.r * 255.0 + 0.5) / 256.0, row)).r,
        texture(uPalette, vec2((raw.g * 255.0 + 0.5) / 256.0, row)).g,
        texture(uPalette, vec2((raw.b * 255.0 + 0.5) / 256.0, row)).b);
    // The exposed blade has no resting-body counterpart; keep its neutral steel highlights.
    float saturation = (max(max(raw.r, raw.g), raw.b) - min(min(raw.r, raw.g), raw.b)) /
        max(max(max(raw.r, raw.g), raw.b), 0.001);
    float steel = (1.0 - smoothstep(0.22, 0.4, saturation)) *
        (1.0 - smoothstep(400.0, 500.0, body.y * 1024.0));
    finalColor = vec4(mix(corrected, raw, steel) * sampled.a, sampled.a);
}
`;

class BerserkerIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 0,
            resources: {
                uPalette: paletteSource(),
                appearance: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uSway: { value: new Float32Array(2), type: "vec2<f32>" },
                    uPose: { value: 0, type: "f32" },
                },
            },
        });
    }
    public update(frame: number, elapsedMs: number, durations: readonly number[]): void {
        const motion = frame === 0 ? berserkerWaitingMotion(elapsedMs, durations) : { x: 0, y: 0 };
        this.resources.appearance.uniforms.uPose = BERSERKER_IDLE_POSE_ORDER[frame] ?? 0;
        this.resources.appearance.uniforms.uSway.set([motion.x, motion.y]);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.appearance.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, BerserkerIdleFilter>();
export function syncBerserkerIdleVisuals(
    sprite: Sprite,
    frame: number,
    elapsedMs: number,
    durations: readonly number[],
): void {
    let filter = filters.get(sprite);
    if (frame >= 0 && !filter) {
        try {
            filter = new BerserkerIdleFilter(sprite);
            filters.set(sprite, filter);
            const owned = filter;
            sprite.once("destroyed", () => {
                owned.destroy();
                filters.delete(sprite);
            });
        } catch {
            // Headless non-WebGL tests retain the source texture and still verify timing and registration.
        }
    }
    if (!filter) return;
    if (frame >= 0) filter.update(frame, elapsedMs, durations);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === frame >= 0) return;
    const rest = installed.filter((entry) => entry !== filter);
    sprite.filters = frame >= 0 ? [filter, ...rest] : rest.length ? rest : null;
}
