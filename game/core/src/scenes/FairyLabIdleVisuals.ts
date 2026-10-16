import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { fairyLabIdleFrame, fairyLabIdleRestPhase } from "./FairyLabIdle";

const gestureHairGains = [
    [1, 1, 1],
    [1.025, 1.025, 1.035],
    [1.025, 1.025, 1.035],
    [0.985, 0.96, 0.98],
    [0.935, 0.86, 0.877],
] as const;
// One inhale/exhale during the joined neutral holds. Settle fully before the hand
// gesture, then resume smoothly on return; keep the loop seam inside the breath.
export function fairyIdleMotion(elapsedMs: number): [number, number, number] {
    const time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
    const rest = fairyLabIdleRestPhase(time);
    if (rest === null) return [0, 0, 0];
    const ramp = Math.min(1, time / 400);
    const fade = ramp * ramp * (3 - 2 * ramp);
    const breath = Math.sin(rest * Math.PI) ** 2 * fade;
    return [4 * Math.sin(rest * Math.PI * 2) * breath, -14 * breath, 0.055 * breath];
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
uniform vec3 uMotion;
uniform vec3 uPoseCorrection;
uniform vec3 uHairGain;
uniform vec4 uInputClamp;
void main() {
    vec2 p = vBodyCoord * 768.0;
    // Motion fades out before the boots. Sprite scale and the planted soles stay fixed.
    p.x -= uMotion.x * (1.0 - smoothstep(440.0, 650.0, p.y));
    float shoulderLift = 0.45 + 0.55 * smoothstep(110.0, 200.0, p.y);
    p.y -= uMotion.y * shoulderLift * (1.0 - smoothstep(340.0, 620.0, p.y));
    // Breathing expansion is confined to the ribcage; neither the head nor
    // the folded wing outline is independently enlarged or animated.
    float chest = smoothstep(325.0, 365.0, p.x)
        * (1.0 - smoothstep(455.0, 495.0, p.x))
        * smoothstep(165.0, 205.0, p.y)
        * (1.0 - smoothstep(295.0, 360.0, p.y));
    p.x = 406.0 + (p.x - 406.0) / (1.0 + uMotion.z * chest);
    // The neutral frame is the original artwork. Only the four generated gesture
    // poses need correction: their ears/hair and boots were slightly too wide.
    float head = (1.0 - smoothstep(145.0, 185.0, p.y))
        * smoothstep(325.0, 350.0, p.x)
        * (1.0 - smoothstep(480.0, 510.0, p.x));
    p.x = mix(p.x, 455.0 + (p.x - 455.0) / uPoseCorrection.y, head * uPoseCorrection.x);
    float boots = smoothstep(560.0, 645.0, p.y)
        * smoothstep(320.0, 350.0, p.x)
        * (1.0 - smoothstep(500.0, 530.0, p.x));
    p.x = mix(p.x, 420.0 + (p.x - 420.0) / uPoseCorrection.z, boots * uPoseCorrection.x);
    vec2 uv = (uInputMatrix * vec3(p / 768.0, 1.0)).xy;
    vec4 color = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
    // Fit to opaque samples of the canonical hair, skin, wing, petals and leather.
    // This linear grade also works on premultiplied edge pixels without a matte.
    vec3 graded = vec3(
        dot(color.rgb, vec3(0.7241, 0.0865, 0.2278)),
        dot(color.rgb, vec3(-0.0489, 0.8999, 0.1832)),
        dot(color.rgb, vec3(-0.0925, 0.0278, 1.0881))
    );
    float hair = 1.0 - smoothstep(100.0, 120.0, p.y);
    graded *= mix(vec3(1.0), uHairGain, hair);
    graded *= mix(vec3(1.0), vec3(0.88, 1.0, 1.1), boots);
    // Match the base figure's materials separately: less golden olive fabric,
    // lighter skin and quieter pink petals. Ratios keep edge alpha out of the grade.
    vec3 surface = max(graded / max(color.a, 0.0001), vec3(0.0001));
    float redGreen = surface.r / surface.g;
    float greenBlue = surface.g / surface.b;
    float olive = smoothstep(1.55, 1.85, greenBlue)
        * (1.0 - smoothstep(1.65, 1.85, redGreen))
        * smoothstep(145.0, 185.0, p.y);
    float skin = smoothstep(1.10, 1.20, redGreen)
        * smoothstep(1.07, 1.13, greenBlue)
        * (1.0 - smoothstep(1.45, 1.70, greenBlue))
        * smoothstep(0.25, 0.45, surface.r);
    float pink = smoothstep(1.10, 1.25, redGreen)
        * (1.0 - smoothstep(1.04, 1.12, greenBlue))
        * smoothstep(145.0, 185.0, p.y);
    graded *= mix(vec3(1.0), vec3(1.0, 1.04, 1.22), olive);
    graded *= mix(vec3(1.0), vec3(1.04, 1.025, 1.05), skin);
    graded *= mix(vec3(1.0), vec3(1.0 - 0.018 * smoothstep(0.65, 0.85, surface.r), 1.025, 1.025), pink);
    finalColor = vec4(mix(color.rgb, clamp(graded, vec3(0.0), vec3(color.a)), uPoseCorrection.x), color.a);
}`;
class FairyIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                idle: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uMotion: { value: new Float32Array(3), type: "vec3<f32>" },
                    uPoseCorrection: { value: new Float32Array([0, 0.95, 0.94]), type: "vec3<f32>" },
                    uHairGain: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" },
                },
            },
        });
    }
    public update(elapsedMs: number): void {
        this.resources.idle.uniforms.uMotion.set(fairyIdleMotion(elapsedMs));
        const frame = fairyLabIdleFrame(elapsedMs);
        this.resources.idle.uniforms.uPoseCorrection[0] = frame > 0 ? 1 : 0;
        this.resources.idle.uniforms.uHairGain.set(gestureHairGains[frame]);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.idle.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, FairyIdleFilter>();
export function syncFairyLabIdle(sprite: Sprite, enabled: boolean, elapsedMs: number): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new FairyIdleFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(elapsedMs);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...remaining, filter] : remaining.length ? remaining : null;
}
