import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

export const SQUIRE_PLUME_PERIOD_MS = 2800 / 1.2;

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
uniform float uPhase;
vec2 plumeOffset(vec2 p) {
    // Authored 768px idle canvas: anchor the metal socket (365, 78),
    // keep the helmet/shoulder fixed, and let only the loose red fibres bend.
    float top = 1.0 - smoothstep(60.0, 78.0, p.y);
    float left = 1.0 - smoothstep(320.0, 338.0, p.x);
    float region = smoothstep(260.0, 280.0, p.x)
        * (1.0 - smoothstep(388.0, 400.0, p.x))
        * (1.0 - smoothstep(164.0, 174.0, p.y));
    float freeEnd = 1.0 - smoothstep(294.0, 356.0, p.x);
    float crown = top * 0.35;
    float loose = left * freeEnd * freeEnd;
    float envelope = region * (crown + loose - crown * loose);
    // A travelling ripple, like cloth in steady wind. Quadrature keeps the
    // tips moving through each lateral reversal instead of pausing at the ends.
    float phase = uPhase - (p.y - 35.0) * 0.045;
    vec2 wave = (vec2(sin(phase), cos(phase))
        + 0.12 * vec2(sin(2.0 * phase + 0.6), cos(2.0 * phase + 0.6))) / 1.12;
    return envelope * vec2(10.0, 3.5) * wave;
}
void main() {
    vec2 destination = vBodyCoord * 768.0;
    vec2 source = destination;
    for (int i = 0; i < 8; i++) source = destination - plumeOffset(source);
    vec2 uv = (uInputMatrix * vec3(source / 768.0, 1.0)).xy;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}`;

class SquireIdlePlumeFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                plume: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uPhase: { value: 0, type: "f32" },
                },
            },
        });
    }
    public update(nowMs: number): void {
        this.resources.plume.uniforms.uPhase =
            ((nowMs % SQUIRE_PLUME_PERIOD_MS) / SQUIRE_PLUME_PERIOD_MS) * Math.PI * 2;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.plume.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, SquireIdlePlumeFilter>();

/** Continuous wind in artwork coordinates, including mirrored units; idle owns it exclusively. */
export function syncSquireIdlePlume(sprite: Sprite, enabled: boolean, nowMs: number): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new SquireIdlePlumeFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(nowMs);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
