import { Filter, GlProgram } from "pixi.js";

type Reaction = "hit" | "death";
type Ramp = readonly (readonly number[])[];
// RGB percentiles (10/25/50/75/90%) of opaque feather, steel and gold samples.
// Independent tone ramps retain texture contrast without lifting dark metal into green.
const base = {
    wings: [
        [46, 77, 121, 159, 182],
        [33, 60, 97, 133, 157],
        [19, 42, 71, 103, 128],
    ],
    steel: [
        [47, 73, 105, 155, 196],
        [46, 69, 97, 146, 184],
        [41, 61, 89, 135, 170],
    ],
    gold: [
        [24, 43, 70, 108, 152],
        [14, 28, 47, 75, 107],
        [1, 9, 23, 42, 65],
    ],
} as const;
const authored = {
    hit: {
        wings: [
            [46, 75, 122, 171, 201],
            [31, 55, 94, 139, 170],
            [15, 35, 67, 108, 141],
        ],
        steel: [
            [58, 86, 128, 180, 225],
            [56, 80, 120, 173, 216],
            [49, 71, 111, 161, 203],
        ],
        gold: [
            [27, 50, 81, 125, 179],
            [13, 30, 54, 84, 124],
            [3, 11, 27, 48, 74],
        ],
    },
    death: {
        wings: [
            [29, 64, 124, 175, 203],
            [16, 45, 92, 138, 168],
            [7, 27, 64, 105, 136],
        ],
        steel: [
            [44, 88, 133, 197, 237],
            [42, 80, 123, 184, 225],
            [38, 73, 113, 170, 206],
        ],
        gold: [
            [23, 44, 76, 123, 182],
            [8, 23, 46, 78, 124],
            [2, 9, 23, 43, 72],
        ],
    },
} as const;
const white = [245, 240, 229];
function points(source: readonly number[], target: readonly number[], channel: number) {
    return { x: [0, ...source, 255], y: [0, ...target, white[channel]] };
}
function ramp(value: number, source: readonly number[], target: readonly number[], channel: number): number {
    const { x, y } = points(source, target, channel);
    for (let i = 1; i < x.length; i++)
        if (value <= x[i]) return y[i - 1] + ((y[i] - y[i - 1]) * (value - x[i - 1])) / (x[i] - x[i - 1]);
    return y[y.length - 1];
}
const smooth = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};
export function valkyrieReactionColor(rgb: readonly number[], state: Reaction): number[] {
    const chroma = (rgb[0] - rgb[2]) / Math.max(rgb[0], 1);
    const steel = 1 - smooth(0.2, 0.32, chroma),
        gold = smooth(0.37, 0.5, chroma);
    const skin = smooth(1.42, 1.62, rgb[0] / Math.max(rgb[1], 1)) * smooth(0.55, 0.7, rgb[2] / Math.max(rgb[1], 1));
    return rgb.map((v, c) => {
        const samples = authored[state];
        const color =
            ramp(v, samples.steel[c], base.steel[c], c) * steel +
            ramp(v, samples.gold[c], base.gold[c], c) * gold +
            ramp(v, samples.wings[c], base.wings[c], c) * (1 - steel - gold);
        return color * (1 - skin * 0.12);
    });
}
function curve(name: string, source: Ramp, target: Ramp): string {
    return (
        source
            .map((channel, c) => {
                const { x, y } = points(channel, target[c], c);
                const f = (v: number) => (v / 255).toFixed(8);
                return (
                    `float ${name}${c}(float v) {\n` +
                    x
                        .slice(1)
                        .map(
                            (end, i) =>
                                `if(v<=${f(end)}) return mix(${f(y[i])},${f(y[i + 1])},(v-${f(x[i])})/${f(end - x[i])});`,
                        )
                        .join("\n") +
                    `return ${f(y[6])};\n}`
                );
            })
            .join("\n") + `\nvec3 ${name}(vec3 c) {return vec3(${name}0(c.r),${name}1(c.g),${name}2(c.b));}`
    );
}
const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(){
    vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
    gl_Position=vec4(p.x*2.0/uOutputTexture.x-1.0,p.y*2.0*uOutputTexture.z/uOutputTexture.y-uOutputTexture.z,0.0,1.0);
    vTextureCoord=aPosition*uOutputFrame.zw*uInputSize.zw;
}`;
export function valkyrieReactionPalette(state: Reaction): Filter {
    const samples = authored[state];
    return new Filter({
        glProgram: GlProgram.from({
            vertex,
            fragment: /* glsl */ `
        in vec2 vTextureCoord;
        out vec4 finalColor;
        uniform sampler2D uTexture;
        ${curve("wings", samples.wings, base.wings)}
        ${curve("steel", samples.steel, base.steel)}
        ${curve("gold", samples.gold, base.gold)}
        void main(){
            vec4 p=texture(uTexture,vTextureCoord);
            vec3 c=p.rgb/max(p.a,0.00001);
            float chroma=(c.r-c.b)/max(c.r,1.0/255.0);
            float s=1.0-smoothstep(.20,.32,chroma);
            float g=smoothstep(.37,.50,chroma);
            float skin=smoothstep(1.42,1.62,c.r/max(c.g,1.0/255.0))*smoothstep(.55,.70,c.b/max(c.g,1.0/255.0));
            vec3 rgb=(steel(c)*s+gold(c)*g+wings(c)*(1.0-s-g))*(1.0-skin*.12);
            finalColor=vec4(clamp(rgb,0.0,1.0)*p.a,p.a);
        }`,
        }),
        resolution: "inherit",
        antialias: "inherit",
    });
}
