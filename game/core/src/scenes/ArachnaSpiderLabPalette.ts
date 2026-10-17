import { Filter, GlProgram, type Sprite } from "pixi.js";
import { SPIDER_FRAME_PALETTES, SPIDER_IDLE_PALETTE } from "./ArachnaSpiderPaletteCurves";

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
const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
void main() {
    vec4 color = texture(uTexture, vTextureCoord);
    vec3 rgb = color.rgb / max(color.a, 0.0001);
    // Reference: black legs, saturated crimson carapace, restrained silver seams.
    // Apply the same material treatment to idle, gait, attacks, hit and the corpse.
    float red = smoothstep(0.045, 0.20, rgb.r - max(rgb.g, rgb.b));
    rgb *= mix(vec3(0.70), vec3(1.02, 0.74, 0.78), red);
    finalColor = vec4(clamp(rgb, 0.0, 1.0) * color.a, color.a);
}`;
const filters = new WeakMap<Sprite, Filter>();
const frameFilters = new WeakMap<Sprite, ArachnaSpiderFramePaletteFilter>();
const idleCels = new Set<unknown>([
    SPIDER_IDLE_PALETTE,
    ...Object.values(SPIDER_FRAME_PALETTES)
        .flat()
        .filter((curves) => JSON.stringify(curves) === JSON.stringify(SPIDER_IDLE_PALETTE)),
]);
type PaletteState = keyof typeof SPIDER_FRAME_PALETTES;
export function spiderFramePalette(state: string, frame: number) {
    const frames = SPIDER_FRAME_PALETTES[state as PaletteState];
    return frames?.[Math.max(0, Math.min(frames.length - 1, Math.floor(frame)))] ?? SPIDER_IDLE_PALETTE;
}
const vector = (values: readonly number[]) => `vec3(${values.map((n) => n.toFixed(4)).join(",")})`;
const materialCurve = (material: number, name: string) => {
    const target = SPIDER_IDLE_PALETTE[material];
    const knots = Array.from({ length: 5 }, (_, i) => vector(target.map((channel) => channel[i])));
    return `vec3 ${name}(vec3 rgb) {
        vec3 result = ${knots[0]} * clamp(rgb / max(u${name}0, vec3(0.0001)), 0.0, 1.0);
        ${knots
            .slice(1)
            .map(
                (knot, i) =>
                    `result += (${knot} - ${knots[i]}) * clamp((rgb - u${name}${i}) / max(u${name}${i + 1} - u${name}${i}, vec3(0.0001)), 0.0, 1.0);`,
            )
            .join("\n")}
        result += (vec3(1.0) - ${knots[4]}) * clamp((rgb - u${name}4) / max(vec3(1.0) - u${name}4, vec3(0.0001)), 0.0, 1.0);
        return result;
    }`;
};
/** Normalize painted cels before eye/slime effects and the unchanged idle material grade. */
export class ArachnaSpiderFramePaletteFilter extends Filter {
    public constructor() {
        const uniforms = Object.fromEntries(
            ["Red", "Neutral"].flatMap((name) =>
                Array.from({ length: 5 }, (_, i) => [
                    `u${name}${i}`,
                    { value: new Float32Array(3), type: "vec3<f32>" },
                ]),
            ),
        );
        super({
            glProgram: GlProgram.from({
                vertex,
                fragment: `
                in vec2 vTextureCoord;
                out vec4 finalColor;
                uniform sampler2D uTexture;
                ${["Red", "Neutral"].flatMap((name) => Array.from({ length: 5 }, (_, i) => `uniform vec3 u${name}${i};`)).join("\n")}
                ${materialCurve(0, "Red")}
                ${materialCurve(1, "Neutral")}
                void main() {
                    vec4 color = texture(uTexture, vTextureCoord);
                    vec3 rgb = color.rgb / max(color.a, 0.0001);
                    float red = smoothstep(0.045, 0.11, rgb.r - max(rgb.g, rgb.b)) * smoothstep(1.25, 1.5, rgb.r / max(rgb.g, 0.001));
                    rgb = mix(Neutral(rgb), Red(rgb), red);
                    finalColor = vec4(clamp(rgb, 0.0, 1.0) * color.a, color.a);
                }
            `,
            }),
            resources: { palette: uniforms },
            resolution: "inherit",
        });
    }
    public update(state: string, frame: number): void {
        const curves = spiderFramePalette(state, frame);
        for (const [material, name] of ["Red", "Neutral"].entries()) {
            for (let knot = 0; knot < 5; knot++) {
                const values = this.resources.palette.uniforms[`u${name}${knot}`] as Float32Array;
                for (let channel = 0; channel < 3; channel++) values[channel] = curves[material][channel][knot];
            }
        }
    }
}
export function syncArachnaSpiderLabPalette(sprite: Sprite, enabled: boolean, state = "idle", frame = 0): void {
    const curves = spiderFramePalette(state, frame);
    // Canonical first/last cels must match idle byte-for-byte, without a second grade.
    const needsMatch = enabled && !idleCels.has(curves);
    let frameFilter = frameFilters.get(sprite);
    if (needsMatch && !frameFilter) {
        frameFilter = new ArachnaSpiderFramePaletteFilter();
        frameFilters.set(sprite, frameFilter);
        const owned = frameFilter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (frameFilter) {
        if (needsMatch) frameFilter.update(state, frame);
        const current = sprite.filters ?? [];
        const remaining = current.filter((entry) => entry !== frameFilter);
        if (needsMatch && current[0] !== frameFilter) sprite.filters = [frameFilter, ...remaining];
        else if (!needsMatch && current.includes(frameFilter)) sprite.filters = remaining.length ? remaining : null;
    }
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new Filter({ glProgram: GlProgram.from({ vertex, fragment }), resolution: "inherit" });
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    const installed = sprite.filters ?? [];
    if (enabled ? installed.at(-1) === filter : !installed.includes(filter)) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...remaining, filter] : remaining.length ? remaining : null;
}
