import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { NOMAD_HAIR_PERIOD_MS, NOMAD_IDLE_WIND_GLSL, NOMAD_TAIL_PERIOD_MS } from "./NomadIdleWind";

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
uniform float uTailPhase;
uniform float uHairPhase;
uniform vec4 uInputClamp;
${NOMAD_IDLE_WIND_GLSL}
void main() {
    vec2 destination = vBodyCoord * 768.0;
    vec2 source = destination;
    for (int i = 0; i < 8; i++) source = destination - nomadIdleWindOffset(source);
    vec2 uv = (uInputMatrix * vec3(source / 768.0, 1.0)).xy;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}`;

class NomadIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                wind: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uTailPhase: { value: 0, type: "f32" },
                    uHairPhase: { value: 0, type: "f32" },
                },
            },
        });
    }
    public update(elapsedMs: number): void {
        const time = Number.isFinite(elapsedMs) ? elapsedMs : 0;
        this.resources.wind.uniforms.uTailPhase = ((time % NOMAD_TAIL_PERIOD_MS) / NOMAD_TAIL_PERIOD_MS) * Math.PI * 2;
        this.resources.wind.uniforms.uHairPhase = ((time % NOMAD_HAIR_PERIOD_MS) / NOMAD_HAIR_PERIOD_MS) * Math.PI * 2;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.wind.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, NomadIdleFilter>();

/** Continuous secondary movement while the authored sword inspection holds or changes pose. */
export function syncNomadIdleVisuals(sprite: Sprite, enabled: boolean, elapsedMs: number): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new NomadIdleFilter(sprite);
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
