import { Filter, GlProgram, Matrix, type Sprite, type Texture } from "pixi.js";
import { ANGEL_ACTION_PALETTES, ANGEL_IDLE_PALETTE } from "./AngelActionPaletteCurves";
import { ANGEL_CAST_MELEE_CALIBRATION, ANGEL_CAST_MELEE_TARGET } from "./AngelCastMeleeCalibration";
import { ANGEL_MELEE_MATERIAL_TARGET, ANGEL_MELEE_MATERIALS } from "./AngelMeleeMaterialCalibration";
import { ANGEL_MELEE_SUPPORT_GLSL, angelMeleeSecondSupportOffset } from "./AngelMeleeSupport";
import { angelActionFrameWidthScale, angelActionFrameOffset, angelActionState } from "./AngelActionRegistration";

export function angelActionPalette(state: string, frame: number) {
    const frames = ANGEL_ACTION_PALETTES[angelActionState(state)];
    return frames?.[frame] ?? ANGEL_IDLE_PALETTE;
}
const materials = ["Neutral", "Gold", "Red", "Feather", "Skin", "Cloth"] as const;
const materialCurve = (name: string) => {
    const knots = Array.from({ length: 7 }, (_, i) => `uTarget${name}${i}`);
    return `vec3 ${name}(vec3 rgb) {
        vec3 result = ${knots[0]} * clamp(rgb / max(u${name}0, vec3(0.0001)), 0.0, 1.0);
        ${knots
            .slice(1)
            .map(
                (knot, i) =>
                    `result += (${knot} - ${knots[i]}) * clamp((rgb - u${name}${i}) / max(u${name}${i + 1} - u${name}${i}, vec3(0.0001)), 0.0, 1.0);`,
            )
            .join("\n")}
        result += (vec3(1.0) - ${knots[6]}) * clamp((rgb - u${name}6) / max(vec3(1.0) - u${name}6, vec3(0.0001)), 0.0, 1.0);
        return result;
    }`;
};
const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vBodyCoord;
uniform mat3 uBodyMatrix;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
    vBodyCoord = (uBodyMatrix * vec3(vTextureCoord, 1.0)).xy;
}`;
/** Per-cel material matching, before the independently emitted sword light. */
export class AngelActionPaletteFilter extends Filter {
    private state = "idle";
    private frames?: readonly Texture[];
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({
                vertex,
                fragment: `
                in vec2 vTextureCoord;
                in vec2 vBodyCoord;
                uniform vec4 uCalibration;
                uniform vec2 uRegistration;
                uniform vec2 uSecondSupport;
                uniform mat3 uTextureMatrix;
                out vec4 finalColor;
                uniform sampler2D uTexture;
                ${materials.flatMap((name) => Array.from({ length: 7 }, (_, i) => `uniform vec3 u${name}${i}; uniform vec3 uTarget${name}${i};`)).join("\n")}
                ${materials.map((name) => materialCurve(name)).join("\n")}
                ${ANGEL_MELEE_SUPPORT_GLSL}
                void main() {
                    vec2 body = vBodyCoord * 768.0;
                    vec2 supportShift = uSecondSupport * secondSupportWeight(body);
                    vec2 sampleUv = vTextureCoord - (uTextureMatrix * vec3(supportShift / 768.0, 0.0)).xy;
                    vec4 color = texture(uTexture, sampleUv);
                    vec3 rgb = color.rgb / max(color.a, 0.0001);
                    float red = smoothstep(1.4, 1.6, rgb.r / max(rgb.g, 0.001)) * smoothstep(0.08, 0.12, rgb.r-rgb.g);
                    float gold = smoothstep(1.35, 1.55, rgb.r / max(rgb.b, 0.001)) * smoothstep(0.04, 0.07, rgb.r-rgb.g) * (1.0-red);
                    vec2 sourceCoord = body - supportShift - uRegistration;
                    float sourceX = (sourceCoord.x - 373.5) / uCalibration.y + 373.5;
                    float feather = (1.0 - smoothstep(uCalibration.x - 115.0, uCalibration.x - 85.0, sourceX)) * uCalibration.z;
                    vec3 neutral = mix(Neutral(rgb), Feather(rgb), feather);
                    vec3 corrected = mix(neutral, Gold(rgb), gold);
                    corrected = mix(corrected, Red(rgb), red);
                    float skin = smoothstep(1.10, 1.16, rgb.r / max(rgb.g, 0.001)) * smoothstep(1.10, 1.16, rgb.g / max(rgb.b, 0.001));
                    skin *= smoothstep(40.0, 55.0, sourceCoord.y) * (1.0 - smoothstep(125.0, 140.0, sourceCoord.y));
                    skin *= smoothstep(uCalibration.x - 65.0, uCalibration.x - 45.0, sourceX) * (1.0 - smoothstep(uCalibration.x + 40.0, uCalibration.x + 55.0, sourceX));
                    corrected = mix(corrected, Skin(rgb), skin * uCalibration.z);
                    if (uCalibration.w > 0.5) {
                        // Same memberships as the measured reference swatches. Red cloth is
                        // separated by hue, including dark folds; no global exposure cap or tint.
                        float cloth = smoothstep(1.5, 1.85, rgb.r / max(rgb.g, 0.001))
                            * (1.0 - smoothstep(1.65, 2.05, rgb.g / max(rgb.b, 0.001)))
                            * smoothstep(285.0, 320.0, sourceCoord.y);
                        float metal = smoothstep(1.35, 1.55, rgb.r / max(rgb.b, 0.001))
                            * smoothstep(0.04, 0.07, rgb.r-rgb.g);
                        corrected = mix(mix(Neutral(rgb), Feather(rgb), feather), Gold(rgb), metal);
                        corrected = mix(corrected, Skin(rgb), skin);
                        corrected = mix(corrected, Cloth(rgb), cloth);
                    }
                    finalColor = vec4(clamp(corrected,0.0,1.0) * color.a, color.a);
                }`,
            }),
            resolution: "inherit",
            resources: {
                palette: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uTextureMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uCalibration: { value: new Float32Array([433, 1, 0, 0]), type: "vec4<f32>" },
                    uRegistration: { value: new Float32Array(2), type: "vec2<f32>" },
                    uSecondSupport: { value: new Float32Array(2), type: "vec2<f32>" },
                    ...Object.fromEntries(
                        materials.flatMap((name) =>
                            Array.from({ length: 7 }, (_, i) =>
                                ["", "Target"].map((prefix) => [
                                    `u${prefix}${name}${i}`,
                                    { value: new Float32Array(3), type: "vec3<f32>" },
                                ]),
                            ).flat(),
                        ),
                    ),
                },
            },
        });
    }
    public bind(state: string, frames: readonly Texture[] | undefined, frame: number): void {
        this.state = state;
        this.frames = frames;
        this.update(frame);
    }
    private update(frame: number): void {
        const calibration = ANGEL_CAST_MELEE_CALIBRATION[angelActionState(this.state)]?.[frame];
        const melee = ANGEL_MELEE_MATERIALS[angelActionState(this.state)]?.[frame];
        const curves = melee ?? calibration?.curves ?? angelActionPalette(this.state, frame);
        const target = melee ? ANGEL_MELEE_MATERIAL_TARGET : calibration ? ANGEL_CAST_MELEE_TARGET : ANGEL_IDLE_PALETTE;
        this.resources.palette.uniforms.uSecondSupport.set(angelMeleeSecondSupportOffset(this.state, frame));
        this.resources.palette.uniforms.uRegistration.set(angelActionFrameOffset(this.state, frame));
        this.resources.palette.uniforms.uCalibration.set([
            calibration?.headX ?? 433,
            angelActionFrameWidthScale(this.state, frame),
            calibration ? 1 : 0,
            melee && frame > 0 && frame < 7 ? 1 : 0,
        ]);
        for (const [m, name] of materials.entries())
            for (let i = 0; i < 7; i++) {
                const value = this.resources.palette.uniforms[`u${name}${i}`] as Float32Array;
                const targetValue = this.resources.palette.uniforms[`uTarget${name}${i}`] as Float32Array;
                for (let c = 0; c < 3; c++) {
                    value[c] = (curves[m] ?? curves[0])[c][i];
                    targetValue[c] = (target[m] ?? target[0])[c][i];
                }
            }
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        if (this.frames) this.update(this.frames.indexOf(this.sprite.texture));
        args[0].calculateSpriteMatrix(this.resources.palette.uniforms.uBodyMatrix, this.sprite);
        this.resources.palette.uniforms.uTextureMatrix.copyFrom(this.resources.palette.uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, AngelActionPaletteFilter>();
export function syncAngelActionPalette(
    sprite: Sprite,
    state: string,
    frame: number,
    enabled: boolean,
    frames?: readonly Texture[],
): void {
    const active =
        enabled &&
        ["cast", "hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"].includes(
            angelActionState(state),
        );
    let filter = filters.get(sprite);
    if (active && !filter) {
        filter = new AngelActionPaletteFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    const installed = sprite.filters ?? [];
    const others = installed.filter((entry) => entry !== filter);
    if (active) {
        filter.bind(state, frames, frame);
        if (installed[0] !== filter) sprite.filters = [filter, ...others];
    } else if (installed.includes(filter)) sprite.filters = others.length ? others : null;
}
