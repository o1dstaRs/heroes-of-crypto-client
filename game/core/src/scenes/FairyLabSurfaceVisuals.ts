import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { fairyLabAttackMotion } from "./FairyLabAttackMotion";
import { FAIRY_LAB_PALETTE } from "./FairyLabPaletteData";

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
uniform vec3 uMotion;
uniform float uPaletteOn;
uniform vec4 uBootRect;
uniform vec3 uPinkGain;
uniform vec3 uSkinGain;
uniform vec3 uOliveGain;
${Array.from({ length: 16 }, (_, i) => `uniform vec4 uBootRamp${i};`).join("\n")}
vec3 bootColor(float luminance) {
    if (luminance <= uBootRamp0.x) return uBootRamp0.yzw;
    ${Array.from({ length: 15 }, (_, i) => `if (luminance <= uBootRamp${i + 1}.x) return mix(uBootRamp${i}.yzw, uBootRamp${i + 1}.yzw, clamp((luminance-uBootRamp${i}.x)/max(0.0001,uBootRamp${i + 1}.x-uBootRamp${i}.x),0.0,1.0));`).join("\n")}
    return uBootRamp15.yzw;
}
vec4 sampleBody(vec2 p) {
    vec2 uv = (uInputMatrix * vec3(p / 768.0, 1.0)).xy;
    return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}
void main() {
    vec2 p = vBodyCoord * 768.0;
    float body = 1.0 - smoothstep(455.0, 685.0, p.y);
    float angle = uMotion.z * body;
    vec2 q = p - vec2(410.0, 500.0) - uMotion.xy * body;
    // Inverse rigid upper-body rotation, smoothly released through the knees.
    // No width scaling: head, hands and torso keep their original proportions.
    p = vec2(cos(angle)*q.x + sin(angle)*q.y, -sin(angle)*q.x + cos(angle)*q.y)
        + vec2(410.0, 500.0);
    vec4 c = sampleBody(p);
    vec4 l = sampleBody(p + vec2(-1.35, 0.0));
    vec4 r = sampleBody(p + vec2(1.35, 0.0));
    vec4 t = sampleBody(p + vec2(0.0, -1.35));
    vec4 b = sampleBody(p + vec2(0.0, 1.35));
    float innerAlpha = min(c.a, min(min(l.a, r.a), min(t.a, b.a)));
    float alpha = min(c.a, smoothstep(0.08, 0.94, innerAlpha));
    vec3 rgb = c.rgb / max(c.a, 0.0001);
    float edge = 1.0 - smoothstep(0.85, 1.0, innerAlpha);
    // Interior samples replace contaminated matte RGB, not the painted interior.
    vec4 interior = c*c.a + l*l.a + r*r.a + t*t.a + b*b.a;
    rgb = mix(rgb, interior.rgb / max(interior.a, 0.0001), edge * 0.75);
    rgb.g = mix(rgb.g, min(rgb.g, max(rgb.r, rgb.b)), edge);
    if (uPaletteOn > 0.5) {
        float rg = rgb.r / max(rgb.g, 0.0001);
        float gb = rgb.g / max(rgb.b, 0.0001);
        float region = smoothstep(uBootRect.x, uBootRect.x+7.0, p.x)
            * (1.0-smoothstep(uBootRect.z-7.0,uBootRect.z,p.x))
            * smoothstep(uBootRect.y,uBootRect.y+7.0,p.y)
            * (1.0-smoothstep(uBootRect.w-3.0,uBootRect.w,p.y));
        float leather = smoothstep(1.10,1.25,rg) * (1.0-smoothstep(1.85,2.15,gb));
        float boot = region * leather;
        float pink = smoothstep(1.10,1.25,rg)*(1.0-smoothstep(1.02,1.16,gb));
        float skin = smoothstep(1.1,1.3,rg)*smoothstep(1.06,1.18,gb)
            *(1.0-smoothstep(1.5,1.8,gb))*smoothstep(0.25,0.44,rgb.r);
        float olive = smoothstep(1.55,1.9,gb)*(1.0-smoothstep(1.6,1.9,rg));
        vec3 graded = rgb * mix(vec3(1.0),uPinkGain,pink*(1.0-boot))
            * mix(vec3(1.0),uSkinGain,skin*(1.0-boot))
            * mix(vec3(1.0),uOliveGain,olive*(1.0-boot));
        // Every leather tone comes from the original boots, with per-pose input
        // luminance registration. Preserve the texture detail and source alpha.
        rgb = mix(graded,bootColor(dot(rgb,vec3(0.2126,0.7152,0.0722))),boot);
    }
    finalColor = vec4(clamp(rgb, 0.0, 1.0) * alpha, alpha);
}`;

class FairySurfaceFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                fairySurface: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uMotion: { value: new Float32Array(3), type: "vec3<f32>" },
                    uPaletteOn: { value: 0, type: "f32" },
                    uBootRect: { value: new Float32Array(4), type: "vec4<f32>" },
                    uPinkGain: { value: new Float32Array(3), type: "vec3<f32>" },
                    uSkinGain: { value: new Float32Array(3), type: "vec3<f32>" },
                    uOliveGain: { value: new Float32Array(3), type: "vec3<f32>" },
                    ...Object.fromEntries(
                        Array.from({ length: 16 }, (_, i) => [
                            `uBootRamp${i}`,
                            { value: new Float32Array(4), type: "vec4<f32>" },
                        ]),
                    ),
                },
            },
        });
    }
    public update(state: string | undefined, elapsedMs: number, frame: number): void {
        const uniforms = this.resources.fairySurface.uniforms;
        uniforms.uMotion.set(fairyLabAttackMotion(state, elapsedMs));
        const palette = state ? FAIRY_LAB_PALETTE[state]?.[frame] : undefined;
        uniforms.uPaletteOn = palette ? 1 : 0;
        if (palette) {
            uniforms.uBootRect.set(palette.rect);
            uniforms.uPinkGain.set(palette.gains[0]);
            uniforms.uSkinGain.set(palette.gains[1]);
            uniforms.uOliveGain.set(palette.gains[2]);
            palette.ramp.forEach((stop, i) => uniforms[`uBootRamp${i}`].set(stop));
        }
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.fairySurface.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, FairySurfaceFilter>();
export function syncFairyLabSurface(sprite: Sprite, enabled: boolean, state?: string, elapsedMs = 0, frame = -1): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new FairySurfaceFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(state, elapsedMs, frame);
    const installed = sprite.filters ?? [];
    if (enabled && installed.at(-1) === filter) return;
    if (!enabled && !installed.includes(filter)) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...remaining, filter] : remaining.length ? remaining : null;
}
