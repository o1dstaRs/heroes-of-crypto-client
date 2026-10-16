import { Filter, GlProgram, Rectangle, Texture, type Sprite } from "pixi.js";
import { TROLL_ATTACK_IDLE_PALETTE, TROLL_ATTACK_SOURCE_PALETTES } from "./TrollLabAttackPaletteData";

const materials = ["skin", "leather"] as const;
type Material = (typeof materials)[number];
type State = keyof typeof TROLL_ATTACK_SOURCE_PALETTES;
// Measured crown height above the 922px ground anchor; idle crown is at y=238.
// Exclude the weapon arc when fitting the body. Recovery is already full-size.
const crownY = {
    melee_attack: [264, 278, 245, 229],
    melee_attack_up: [264, 264, 256, 247],
    melee_attack_down: [264, 271, 267, 252],
} as const;
export function trollAttackBodyScale(state: string | undefined, frame: number): number {
    const y = isTrollLabAttack(state) ? crownY[state as State][frame - 1] : undefined;
    return y === undefined ? 1 : (922 - 238) / (922 - y);
}
export const isTrollLabAttack = (state?: string): boolean =>
    !!state && Object.hasOwn(TROLL_ATTACK_SOURCE_PALETTES, state);
export const isTrollLabAttackGuard = (state: string | undefined, frame: number): boolean =>
    isTrollLabAttack(state) && (frame === 0 || frame === 5);
function paletteFor(state: string | undefined, frame: number) {
    return isTrollLabAttack(state) ? TROLL_ATTACK_SOURCE_PALETTES[state as State][frame - 1] : undefined;
}

const guards = new WeakMap<Texture, Texture>();
/** Reuse the actual idle pixels with atlas padding, so both seams have identical art and physical size. */
export function trollLabAttackFrames(frames: Texture[], idle: Texture): Texture[] {
    let guard = guards.get(idle);
    if (!guard) {
        guard = new Texture({
            source: idle.source,
            frame: idle.frame.clone(),
            orig: new Rectangle(0, 0, 1152, 1152),
            trim: new Rectangle(192, 192, 768, 768),
        });
        guards.set(idle, guard);
    }
    return [guard, ...frames.slice(1, -1), guard];
}
function smooth(a: number, b: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
}
export function trollAttackMaterialWeight(rgb: readonly number[]): number {
    return smooth(8, 22, rgb[0] - rgb[1]) * smooth(1.12, 1.28, rgb[0] / (rgb[1] + 1));
}
/** CPU equivalent of the shader, used by calibration tests. Alpha is never recolored. */
export function trollAttackPaletteRgb(state: string | undefined, frame: number, rgb: readonly number[]): number[] {
    const source = paletteFor(state, frame);
    if (!source) return [...rgb];
    const warm = trollAttackMaterialWeight(rgb);
    return rgb.map((value, channel) => {
        let result = 0;
        for (const material of materials) {
            const xs = [0, ...source[material][channel], 255];
            const ys = [0, ...TROLL_ATTACK_IDLE_PALETTE[material][channel], 255];
            let mapped = 0;
            for (let i = 0; i < 8; i++)
                mapped +=
                    (ys[i + 1] - ys[i]) *
                    Math.max(0, Math.min(1, (value - xs[i]) / Math.max(0.001, xs[i + 1] - xs[i])));
            result += mapped * (material === "leather" ? warm : 1 - warm);
        }
        return Math.max(0, Math.min(255, result));
    });
}
const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
}`;
const indices = Array.from({ length: 7 }, (_, i) => i);
function curveGlsl(material: Material): string {
    const ys = [0, ...indices.map((i) => i + 1), 8].map((i) =>
        i === 0 ? [0, 0, 0] : i === 8 ? [255, 255, 255] : TROLL_ATTACK_IDLE_PALETTE[material].map((c) => c[i - 1]),
    );
    const source = (i: number) => (i === 0 ? "vec3(0.0)" : i === 8 ? "vec3(255.0)" : `u${material}${i - 1}`);
    return `${indices.map((i) => `uniform vec3 u${material}${i};`).join("\n")}\nvec3 grade_${material}(vec3 rgb) {\n return ${Array.from({ length: 8 }, (_, i) => `vec3(${ys[i + 1].map((v, c) => (v - ys[i][c]).toFixed(3)).join(",")}) * clamp((rgb - ${source(i)}) / max(vec3(0.001), ${source(i + 1)} - ${source(i)}), 0.0, 1.0)`).join(" +\n ")};\n}`;
}
const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
${materials.map(curveGlsl).join("\n")}
void main() {
    vec4 pixel = texture(uTexture, vTextureCoord);
    vec3 rgb = pixel.rgb * 255.0 / max(pixel.a, 0.00001);
    float warm = smoothstep(8.0, 22.0, rgb.r - rgb.g) * smoothstep(1.12, 1.28, rgb.r / (rgb.g + 1.0));
    vec3 corrected = mix(grade_skin(rgb), grade_leather(rgb), warm);
    finalColor = vec4(clamp(corrected / 255.0, 0.0, 1.0) * pixel.a, pixel.a);
}`;
class TrollAttackPaletteFilter extends Filter {
    private poseKey = "";
    public constructor() {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 0,
            resources: {
                palette: Object.fromEntries(
                    materials.flatMap((material) =>
                        indices.map((i) => [`u${material}${i}`, { value: new Float32Array(3), type: "vec3<f32>" }]),
                    ),
                ),
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
}
const filters = new WeakMap<Sprite, TrollAttackPaletteFilter>();
const scales = new WeakMap<Sprite, number>();
/** Fit the complete body in each middle pose, preserving facing and the ground anchor. */
export function syncTrollLabAttack(
    sprite: Sprite,
    state: string | undefined,
    frame: number,
    scaleWasReset = false,
): void {
    const enabled = !!paletteFor(state, frame);
    const scale = trollAttackBodyScale(state, frame);
    const previous = scaleWasReset ? 1 : (scales.get(sprite) ?? 1);
    if (scale !== previous) sprite.scale.set((sprite.scale.x * scale) / previous, (sprite.scale.y * scale) / previous);
    if (scale === 1) scales.delete(sprite);
    else scales.set(sprite, scale);
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new TrollAttackPaletteFilter();
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
