import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { dryadIdleMotion, DRYAD_IDLE_OFFSET_GLSL } from "./DryadLabIdleMotion";

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
uniform vec4 uMotion;
uniform vec4 uInputClamp;
${DRYAD_IDLE_OFFSET_GLSL}
void main() {
    vec2 destination = vBodyCoord * 768.0;
    vec2 source = destination;
    // Invert the small connected deformation; the soles and lower boots stay fixed.
    for (int i = 0; i < 8; i++) source = destination - dryadOffset(source);
    vec2 uv = (uInputMatrix * vec3(source / 768.0, 1.0)).xy;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}`;

class DryadIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                idle: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uMotion: { value: new Float32Array(4), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(elapsedMs: number): void {
        this.resources.idle.uniforms.uMotion.set(dryadIdleMotion(elapsedMs));
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.idle.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, DryadIdleFilter>();

/** Lab-only waiting gesture; remove it before another animation owns the sprite. */
export function syncDryadLabIdle(sprite: Sprite, enabled: boolean, elapsedMs: number): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new DryadIdleFilter(sprite);
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
