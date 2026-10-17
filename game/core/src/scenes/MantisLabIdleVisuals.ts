import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

export const MANTIS_EYE_PULSE_MS = 2200;

/** A soft ember pulse, continuous across sprite changes and wing-loop boundaries. */
export function mantisEyeIntensity(elapsedMs: number): number {
    const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    const rise = (1 - Math.cos((time * Math.PI * 2) / MANTIS_EYE_PULSE_MS)) / 2;
    return 0.3 + 0.7 * rise * rise;
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
uniform float uIntensity;
void main() {
    // Sample the current sprite once at its original position. Lighting cannot
    // move geometry or introduce a second silhouette, even on an atlas edge.
    vec2 uv = (uInputMatrix * vec3(vBodyCoord, 1.0)).xy;
    vec4 body = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
    vec2 eye = (vBodyCoord * 512.0 - vec2(376.0, 141.8)) / vec2(8.0, 6.0);
    float core = exp(-dot(eye, eye) * 1.6);
    float halo = exp(-dot(eye, eye) * 0.22);
    vec3 ember = vec3(0.62, 0.045, 0.015) * core + vec3(0.17, 0.008, 0.003) * halo;
    vec3 lit = body.rgb * (1.0 - core * (1.0 - uIntensity) * 0.7);
    finalColor = vec4(min(lit + ember * uIntensity * body.a, vec3(body.a)), body.a);
}`;

export class MantisEyeGlowFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                mantis: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uIntensity: { value: 0.3, type: "f32" },
                },
            },
        });
    }
    public update(nowMs: number): void {
        this.resources.mantis.uniforms.uIntensity = mantisEyeIntensity(nowMs);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.mantis.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, MantisEyeGlowFilter>();

export function syncMantisLabEyeGlow(sprite: Sprite, enabled: boolean, nowMs: number): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new MantisEyeGlowFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(nowMs);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const others = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...others, filter] : others.length ? others : null;
}
