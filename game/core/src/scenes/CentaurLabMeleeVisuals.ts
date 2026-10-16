import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { CENTAUR_MELEE_IDLE_PALETTE, CENTAUR_MELEE_SOURCE_PALETTES } from "./CentaurLabMeleePalette";
import { CENTAUR_RANGED_SOURCE_PALETTES } from "./CentaurLabRangedPalette";

const materials = ["horse", "skin", "cloth"] as const;
type Material = (typeof materials)[number];
const attackPalettes = { ...CENTAUR_MELEE_SOURCE_PALETTES, ...CENTAUR_RANGED_SOURCE_PALETTES };
type State = keyof typeof attackPalettes;
function paletteFor(state: string | undefined, frame: number) {
    if (!state || !Object.hasOwn(attackPalettes, state)) return undefined;
    return attackPalettes[state as State][frame - 1];
}
function smooth(a: number, b: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
}
/** Same material weights as the shader, in unpremultiplied 0..255 RGB and source pixels. */
export function centaurMeleeMaterialWeights(y: number, rgb: readonly number[]): number[] {
    const warm = smooth(8, 18, rgb[0] - rgb[1]) * smooth(5, 13, rgb[1] - rgb[2]);
    return [(1 - warm) * smooth(590, 625, y), warm * (1 - smooth(600, 640, y)), warm * smooth(620, 660, y)];
}
/** CPU equivalent used to verify the measured palette against each original frame. */
export function centaurMeleePaletteRgb(
    state: string | undefined,
    frame: number,
    y: number,
    rgb: readonly number[],
): number[] {
    const source = paletteFor(state, frame);
    if (!source) return [...rgb];
    const weights = centaurMeleeMaterialWeights(y, rgb);
    return rgb.map((value, channel) => {
        let result = value;
        for (let m = 0; m < materials.length; m++) {
            const material = materials[m];
            const xs = [0, ...source[material][channel], 255];
            const ys = [0, ...CENTAUR_MELEE_IDLE_PALETTE[material][channel], 255];
            let mapped = 0;
            for (let i = 0; i < 8; i++)
                mapped += (ys[i + 1] - ys[i]) * Math.max(0, Math.min(1, (value - xs[i]) / (xs[i + 1] - xs[i])));
            result += (mapped - value) * weights[m];
        }
        return Math.max(0, Math.min(255, result));
    });
}

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
const indices = Array.from({ length: 7 }, (_, i) => i);
function curveGlsl(material: Material): string {
    const ys = [0, ...indices.map((i) => i + 1), 8].map((i) =>
        i === 0 ? [0, 0, 0] : i === 8 ? [255, 255, 255] : CENTAUR_MELEE_IDLE_PALETTE[material].map((c) => c[i - 1]),
    );
    const source = (i: number) => (i === 0 ? "vec3(0.0)" : i === 8 ? "vec3(255.0)" : `u${material}${i - 1}`);
    return `${indices.map((i) => `uniform vec3 u${material}${i};`).join("\n")}\nvec3 grade_${material}(vec3 rgb) {\n return ${Array.from({ length: 8 }, (_, i) => `vec3(${ys[i + 1].map((v, c) => (v - ys[i][c]).toFixed(1)).join(",")}) * clamp((rgb - ${source(i)}) / (${source(i + 1)} - ${source(i)}), 0.0, 1.0)`).join(" +\n ")};\n}`;
}
const fragment = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
${materials.map(curveGlsl).join("\n")}
void main() {
    vec4 pixel = texture(uTexture, vTextureCoord);
    vec3 rgb = pixel.rgb * 255.0 / max(pixel.a, 0.00001);
    float y = vBodyCoord.y * 1024.0;
    float warm = smoothstep(8.0, 18.0, rgb.r - rgb.g) * smoothstep(5.0, 13.0, rgb.g - rgb.b);
    vec3 corrected = rgb
      + (grade_horse(rgb) - rgb) * (1.0 - warm) * smoothstep(590.0, 625.0, y)
      + (grade_skin(rgb) - rgb) * warm * (1.0 - smoothstep(600.0, 640.0, y))
      + (grade_cloth(rgb) - rgb) * warm * smoothstep(620.0, 660.0, y);
    finalColor = vec4(clamp(corrected / 255.0, 0.0, 1.0) * pixel.a, pixel.a);
}`;

class CentaurMeleePaletteFilter extends Filter {
    private poseKey = "";
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 0,
            resources: {
                palette: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    ...Object.fromEntries(
                        materials.flatMap((material) =>
                            indices.map((i) => [`u${material}${i}`, { value: new Float32Array(3), type: "vec3<f32>" }]),
                        ),
                    ),
                },
            },
        });
    }
    public update(state: string, frame: number): void {
        const key = `${state}:${frame}`;
        if (this.poseKey === key) return;
        this.poseKey = key;
        const source = paletteFor(state, frame)!;
        for (const material of materials)
            for (const i of indices)
                this.resources.palette.uniforms[`u${material}${i}`].set(source[material].map((c) => c[i]));
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        args[0].calculateSpriteMatrix(this.resources.palette.uniforms.uBodyMatrix, this.sprite);
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, CentaurMeleePaletteFilter>();
/** Update with the texture swap; original idle endpoints and other actions keep their own palette. */
export function syncCentaurLabMeleePalette(sprite: Sprite, state: string | undefined, frame: number): void {
    const enabled = !!paletteFor(state, frame);
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new CentaurMeleePaletteFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(state!, frame);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
