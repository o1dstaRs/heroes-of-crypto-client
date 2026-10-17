import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

/** Hit is an authored sprite sequence and must never receive this deformation filter. */
export function crusaderReactionFilterEnabled(state: string | undefined, frame: number): boolean {
    return state === "death" && frame > 0 && frame < 6;
}
// Rear sole, kneeling support, bracing palm, then the underside of the fallen body.
export const CRUSADER_DEATH_OFFSETS = [
    [0, 0],
    [19.64, 1],
    [-70, 10],
    [-20, 30],
    [-20, 44],
    [-20, 44],
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
    vec2 uv = aPosition * uOutputFrame.zw * uInputSize.zw;
    vBodyCoord = (uBodyMatrix * vec3(uv, 1.0)).xy;
}`;

const fragment = /* glsl */ `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform mat3 uInputMatrix;
uniform vec4 uInputClamp;
uniform vec2 uOffset;
uniform vec3 uGrade;

void main() {
    vec2 p = vBodyCoord*896.0-uOffset;
    vec2 uv = (uInputMatrix*vec3(p/896.0,1.0)).xy;
    vec4 color = texture(uTexture,clamp(uv,uInputClamp.xy,uInputClamp.zw));
    color *= step(0.0,p.x)*step(p.x,896.0)*step(0.0,p.y)*step(p.y,896.0);
    vec3 rgb = color.rgb/max(color.a,0.0001);
    float luminance = dot(rgb,vec3(0.2126,0.7152,0.0722));
    // Match dark steel, black cloth and aged gold, preserving metallic highlights.
    vec3 grade = mix(uGrade,vec3(1.0),smoothstep(0.32,0.82,luminance));
    finalColor = vec4(clamp(rgb*grade,0.0,1.0)*color.a,color.a);
}`;
class CrusaderReactionFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 8,
            resources: {
                crusaderReaction: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uOffset: { value: new Float32Array(2), type: "vec2<f32>" },
                    uGrade: { value: new Float32Array(3), type: "vec3<f32>" },
                },
            },
        });
    }
    public update(frame: number): void {
        const u = this.resources.crusaderReaction.uniforms;
        u.uOffset.set(CRUSADER_DEATH_OFFSETS[frame]);
        u.uGrade.set([0.75, 0.825, 0.8]);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.crusaderReaction.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, CrusaderReactionFilter>();
export function syncCrusaderLabReaction(sprite: Sprite, state: string | undefined, frame: number, _progress = 0): void {
    const enabled = crusaderReactionFilterEnabled(state, frame);
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new CrusaderReactionFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => {
            owned.destroy();
            filters.delete(sprite);
        });
    }
    if (!filter) return;
    if (enabled) filter.update(frame);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
