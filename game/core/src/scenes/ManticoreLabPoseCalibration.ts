import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

// Registered by skull/shoulder size, not by changing wing or tail bounds.
export const MANTICORE_WALK_BODY_SCALE = 0.88;
export const MANTICORE_DEATH_BODY_SCALE = 0.9;
const deathBronze = [
    [1, 1, 1],
    [94 / 98, 55 / 61, 26 / 29],
    [94 / 101, 55 / 63, 26 / 29],
    [94 / 102, 55 / 65, 26 / 30],
    [94 / 101, 55 / 63, 26 / 30],
    [94 / 103, 55 / 66, 26 / 31],
    [94 / 103, 55 / 66, 26 / 31],
    [94 / 106, 55 / 67, 26 / 32],
] as const;
const deathRed = [
    [1, 1, 1],
    [86 / 107, 1, 6 / 13],
    [86 / 102, 1, 6 / 13],
    [86 / 103, 1, 0.5],
    [86 / 106, 1, 6 / 14],
    [86 / 102, 1, 6 / 13],
    [86 / 104, 17 / 18, 0.4],
    [86 / 117, 17 / 21, 6 / 17],
] as const;
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
uniform vec4 uRegistration;
uniform vec4 uBronze;
uniform vec4 uRed;
uniform vec4 uInputClamp;
void main() {
    vec2 p = (vBodyCoord * 768.0 - uRegistration.xy) / uRegistration.z + uRegistration.xy;
    vec2 uv = (uInputMatrix * vec3(p / 768.0, 1.0)).xy;
    vec4 color = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
    // Sampling beyond the frame must stay transparent instead of stretching boundary pixels.
    if (min(p.x, p.y) < 0.0 || max(p.x, p.y) > 768.0) color = vec4(0.0);
    vec3 rgb = color.rgb / max(color.a, 0.00001);
    float bronze = smoothstep(0.03, 0.13, rgb.r - rgb.g)
        * smoothstep(0.02, 0.1, rgb.g - rgb.b)
        * (1.0 - smoothstep(0.78, 0.98, rgb.r));
    float red = smoothstep(0.08, 0.22, rgb.r - rgb.g)
        * (1.0 - smoothstep(0.15, 0.30, rgb.g))
        * (1.0 - smoothstep(0.15, 0.25, rgb.b));
    rgb *= mix(vec3(1.0), uBronze.rgb, bronze);
    rgb *= mix(vec3(1.0), uRed.rgb, red);
    finalColor = vec4(rgb * color.a, color.a);
}`;
class PoseFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                pose: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uRegistration: { value: new Float32Array(4), type: "vec4<f32>" },
                    uBronze: { value: new Float32Array(4), type: "vec4<f32>" },
                    uRed: { value: new Float32Array(4), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(walk: boolean, deathFrame: number): void {
        this.resources.pose.uniforms.uRegistration.set(
            walk ? [600, 690, MANTICORE_WALK_BODY_SCALE, 0] : [600, 730, MANTICORE_DEATH_BODY_SCALE, 0],
        );
        this.resources.pose.uniforms.uBronze.set([...(deathBronze[deathFrame] ?? [1, 1, 1]), 0]);
        this.resources.pose.uniforms.uRed.set([...(deathRed[deathFrame] ?? [1, 1, 1]), 0]);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.pose.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, PoseFilter>();

/** Calibrate redrawn poses only; original idle and both flight bookends stay byte-identical. */
export function syncManticoreLabPoseCalibration(sprite: Sprite, walkFrame: number, deathFrame: number): void {
    const walk = walkFrame > 0 && walkFrame < 17;
    const enabled = walk || deathFrame > 0;
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new PoseFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(walk, deathFrame);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...remaining, filter] : remaining.length ? remaining : null;
}
