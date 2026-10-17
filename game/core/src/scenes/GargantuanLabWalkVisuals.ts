import { Filter, GlProgram, type Sprite } from "pixi.js";
import { GARGANTUAN_IDLE_MATERIALS, GARGANTUAN_WALK_MATERIALS } from "./GargantuanWalkPaletteCurves";

// Both atlases use a 768px canvas; palette correction must never alter registration.
export const GARGANTUAN_LAB_WALK_SCALE_X = 1;
export const GARGANTUAN_LAB_WALK_SCALE_Y = 1;
const materials = ["Neutral", "Stone", "Cloth"] as const;
const vector = (values: readonly (readonly number[])[], i: number) =>
    `vec3(${values.map((channel) => channel[i].toFixed(7)).join(",")})`;
const curves = materials
    .map((name) => {
        const source = GARGANTUAN_WALK_MATERIALS[name];
        const target = GARGANTUAN_IDLE_MATERIALS[name];
        const s = (i: number) => vector(source, i);
        const t = (i: number) => vector(target, i);
        return `vec3 ${name}(vec3 rgb) {
        vec3 result = ${t(0)} * clamp(rgb / ${s(0)}, 0.0, 1.0);
        ${Array.from({ length: 6 }, (_, i) => `result += (${t(i + 1)}-${t(i)}) * clamp((rgb-${s(i)}) / (${s(i + 1)}-${s(i)}), 0.0, 1.0);`).join("\n")}
        return result + (vec3(1.0)-${t(6)}) * clamp((rgb-${s(6)}) / (vec3(1.0)-${s(6)}), 0.0, 1.0);
    }`;
    })
    .join("\n");

// One calibration for the entire gait, measured on corresponding skin, stone
// and cloth patches of canonical idle. Preserve cyan accents and alpha.
function createPaletteFilter(): Filter {
    return new Filter({
        resolution: "inherit",
        glProgram: GlProgram.from({
            vertex: `
                in vec2 aPosition;
                out vec2 vTextureCoord;
                uniform vec4 uInputSize;
                uniform vec4 uOutputFrame;
                uniform vec4 uOutputTexture;
                void main() {
                    vec2 p = aPosition * uOutputFrame.zw + uOutputFrame.xy;
                    p.x = p.x * (2.0 / uOutputTexture.x) - 1.0;
                    p.y = p.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
                    gl_Position = vec4(p, 0.0, 1.0);
                    vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
                }`,
            fragment: `
                in vec2 vTextureCoord;
                out vec4 finalColor;
                uniform sampler2D uTexture;
                ${curves}
                void main() {
                    vec4 color = texture(uTexture, vTextureCoord);
                    vec3 rgb = color.rgb / max(color.a, 0.0001);
                    float cloth = smoothstep(1.15,1.30,rgb.r/max(rgb.g,0.001)) * smoothstep(0.96,1.01,rgb.b/max(rgb.g,0.001));
                    float stone = smoothstep(1.12,1.22,rgb.r/max(rgb.g,0.001)) * (1.0-cloth);
                    float cyan = smoothstep(1.05,1.25,rgb.g/max(rgb.r,0.001)) * smoothstep(1.05,1.25,rgb.b/max(rgb.r,0.001));
                    vec3 corrected = mix(Neutral(rgb),Stone(rgb),stone);
                    corrected = mix(corrected,Cloth(rgb),cloth);
                    corrected = mix(corrected,rgb,cyan);
                    finalColor = vec4(clamp(corrected,0.0,1.0)*color.a,color.a);
                }`,
        }),
    });
}
let sharedFilter: Filter | undefined;
export function syncGargantuanLabWalkPalette(sprite: Sprite, walking: boolean): void {
    if (walking && !sharedFilter) sharedFilter = createPaletteFilter();
    const desired = walking ? sharedFilter : undefined;
    const installed = sprite.filters ?? [];
    if (installed.find((filter) => filter === sharedFilter) === desired) return;
    const remaining = installed.filter((filter) => filter !== sharedFilter);
    sprite.filters = desired ? [desired, ...remaining] : remaining.length ? remaining : null;
}
