import {
    angelActionFrameScale,
    angelActionFrameWidthScale,
    angelActionFrameOffset,
    angelActionState,
} from "./AngelActionRegistration";
import { ANGEL_MELEE_BLADES } from "./AngelMeleeBlades";
import { Filter, GlProgram, Matrix, type Sprite, type Texture } from "pixi.js";
import { angelCastAura, ANGEL_BLESSING_BLADES } from "./AngelBlessingIdle";

// Blade-only centerlines measured on the authored cels, in a 256px reference canvas.
// The guard/hand is excluded. Normalized coordinates also support half/quarter atlases.
type Blade = readonly [number, number, number, number];
const blades: Readonly<Record<string, readonly Blade[]>> = {
    ...ANGEL_MELEE_BLADES,
    idle: [
        [118, 158, 205, 242],
        [119, 158, 205, 242],
        [119, 158, 205, 242],
        [118, 158, 205, 242],
        [118, 158, 205, 242],
        [118, 158, 205, 242],
        [118, 158, 205, 242],
        [118, 158, 205, 242],
    ],
    walk: [
        [118, 158, 205, 242],
        [124, 158, 211, 242],
        [123, 158, 210, 242],
        [121, 158, 208, 242],
        [118, 158, 205, 242],
        [119, 159, 209, 244],
        [117, 159, 208, 244],
        [117, 159, 208, 244],
        [118, 158, 205, 242],
    ],
    attack: [
        [118, 158, 205, 242],
        [121, 158, 208, 243],
        [128, 158, 211, 243],
        [136, 160, 216, 248],
        [141, 160, 220, 252],
        [137, 158, 219, 248],
        [128, 158, 209, 243],
        [119, 158, 205, 242],
    ],
    attack_up: [
        [118, 158, 205, 242],
        [121, 157, 208, 243],
        [128, 154, 209, 243],
        [138, 155, 211, 246],
        [144, 153, 214, 247],
        [137, 156, 215, 247],
        [128, 158, 208, 243],
        [119, 158, 205, 242],
    ],
    attack_down: [
        [118, 158, 205, 242],
        [120, 158, 208, 241],
        [114, 159, 209, 238],
        [112, 166, 211, 233],
        [107, 168, 214, 229],
        [113, 167, 213, 236],
        [115, 162, 210, 242],
        [119, 158, 205, 242],
    ],
    hit: [
        [118, 158, 205, 242],
        [114, 158, 210, 237],
        [107, 156, 196, 233],
        [94, 154, 193, 229],
        [100, 160, 198, 235],
        [110, 161, 206, 241],
        [118, 159, 206, 242],
        [118, 158, 205, 242],
    ],
    death: [
        [118, 158, 205, 242],
        [134, 159, 206, 250],
        [147, 161, 200, 259],
        [171, 173, 200, 262],
        [189, 199, 192, 280],
        [199, 211, 184, 284],
        [211, 231, 202, 278],
        [225, 251, 210, 287],
    ],
    lab_walk: [
        [140, 178, 192, 233],
        [130, 187, 193, 232],
        [126, 159, 189, 217],
        [135, 147, 181, 180],
        [135, 148, 185, 195],
        [141, 146, 188, 189],
        [142, 147, 190, 198],
        [137, 145, 183, 192],
        [137, 148, 188, 192],
        [126, 159, 189, 217],
        [130, 187, 193, 232],
        [140, 178, 192, 233],
    ],
    lab_idle: [
        [127, 156, 208, 242],
        [127, 155, 209, 242],
        [126, 155, 209, 242],
        [126, 155, 209, 242],
        [126, 154, 210, 242],
        [126, 154, 209, 242],
        [126, 154, 209, 242],
        [126, 154, 208, 242],
        [126, 156, 208, 242],
        [126, 156, 208, 242],
        [126, 156, 208, 242],
        [126, 156, 208, 242],
        [126, 156, 208, 242],
        [126, 156, 208, 242],
        [126, 156, 208, 242],
        [126, 156, 209, 242],
        [126, 155, 209, 242],
        [126, 155, 209, 242],
        [126, 155, 209, 242],
        [126, 155, 209, 242],
        [126, 155, 209, 242],
        [127, 156, 208, 242],
        [127, 156, 208, 242],
        [127, 156, 208, 242],
    ],
    lab_cast: [[127, 156, 208, 242], ...ANGEL_BLESSING_BLADES, [127, 156, 208, 242]],
    lab_hit: [
        [127, 156, 208, 242],
        [127.3, 154.13, 211.042, 243.727],
        [122.209, 154.385, 206.97, 240.673],
        [127.809, 153.621, 212.57, 243.982],
        [127, 156, 208, 242],
    ],
    lab_death: [
        [127, 156, 208, 242],
        [139.327, 159.73, 221.288, 243.982],
        [141.618, 173.475, 229.687, 246.782],
        [120.237, 175.257, 218.997, 245.0],
        [192.525, 231.255, 293.576, 240.418],
        [186.925, 227.946, 291.54, 244.745],
    ],
    base: [[127, 155, 210, 243]],
};

export function angelSwordBlade(state: string, frame: number, lab: boolean): Blade | undefined {
    const actionState = angelActionState(state);
    const key =
        lab &&
        ["idle", "walk", "cast", "hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"].includes(
            actionState,
        )
            ? `lab_${actionState}`
            : state.replace(/^melee_/, "");
    const blade = blades[key]?.[frame];
    const scale = lab ? angelActionFrameScale(state, frame) : 1;
    const horizontal = scale * (lab ? angelActionFrameWidthScale(state, frame) : 1);
    const [dx, dy] = lab ? angelActionFrameOffset(state, frame) : [0, 0];
    if (!blade || (scale === 1 && horizontal === 1 && dx === 0 && dy === 0)) return blade;
    return [
        blade[0] * horizontal + 124.5 * (1 - horizontal) + dx / 3,
        blade[1] * scale + 245 * (1 - scale) + dy / 3,
        blade[2] * horizontal + 124.5 * (1 - horizontal) + dx / 3,
        blade[3] * scale + 245 * (1 - scale) + dy / 3,
    ];
}

const registeredFrames = new WeakMap<readonly Texture[], string>();
const textureBlades = new WeakMap<Texture, { blade: Blade; flight: boolean; clipped: boolean; blessing: boolean }>();

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
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
    vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
    vBodyCoord = (uBodyMatrix * vec3(vTextureCoord, 1.0)).xy;
}`;

const fragment = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uBlade;
uniform float uWidthScale;
uniform float uStrength;
uniform float uClipToFrame;
uniform float uBlessing;
uniform float uBlessingActive;
void main() {
    vec4 painted = texture(uTexture, vTextureCoord);
    vec2 p = vBodyCoord * 256.0;
    vec2 ab = uBlade.zw - uBlade.xy;
    float t = clamp(dot(p - uBlade.xy, ab) / dot(ab, ab), 0.0, 1.0);
    // The overhead hold boosts the existing aura equally in radius and brightness.
    float boost = 1.0 + 2.0 * uBlessing * uBlessingActive;
    float d = length(p - uBlade.xy - t * ab) / (uWidthScale * boost);
    // Expand the aura instead of overexposing the blade: no painted white core.
    // The outer falloff radius is 2.5x wider than the former tight bloom.
    float halo = 0.22 * exp(-d * d / 90.0) + 0.12 * exp(-d * d / 400.0);
    float edge = min(min(p.x, p.y), min(256.0 - p.x, 256.0 - p.y));
    float light = min(1.0, halo * uStrength * boost * mix(1.0, smoothstep(0.0, 3.0, edge), uClipToFrame));
    // Composite BEHIND the artwork: opaque blade pixels retain their original
    // color, bevels and tip; existing translucent highlights remain in front.
    finalColor = vec4(painted.rgb + vec3(light) * (1.0 - painted.a),
        painted.a + light * (1.0 - painted.a));
}`;

export class AngelSwordGlowFilter extends Filter {
    private readonly paddingTransform = new Matrix();
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 64,
            resources: {
                angelSword: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uBlade: { value: new Float32Array([127, 155, 210, 243]), type: "vec4<f32>" },
                    uWidthScale: { value: 1, type: "f32" },
                    uStrength: { value: 1, type: "f32" },
                    uClipToFrame: { value: 0, type: "f32" },
                    uBlessing: { value: 0, type: "f32" },
                    uBlessingActive: { value: 0, type: "f32" },
                },
            },
        });
    }
    public update(blade: Blade, flight: boolean, clipped = false): void {
        this.resources.angelSword.uniforms.uBlade.set(blade);
        // Flight uses a larger canvas around the same-sized body.
        this.resources.angelSword.uniforms.uWidthScale = flight ? 0.62 : 1;
        this.resources.angelSword.uniforms.uClipToFrame = clipped ? 1 : 0;
    }
    public updateBlessing(elapsedMs: number): void {
        this.resources.angelSword.uniforms.uBlessing = angelCastAura(elapsedMs);
    }
    public updatePadding(overhead: boolean): void {
        // Filter padding is measured in render pixels, while sprite.height excludes
        // the battlefield/camera scale. Read the current ancestor transforms rather
        // than last render's worldTransform so zoom changes cannot clip one frame.
        const matrix = this.sprite.getGlobalTransform(this.paddingTransform);
        const { width, height } = this.sprite.texture.orig;
        const screenWidth = Math.abs(matrix.a) * width + Math.abs(matrix.c) * height;
        const screenHeight = Math.abs(matrix.b) * width + Math.abs(matrix.d) * height;
        this.padding = Math.max(64, Math.max(screenWidth, screenHeight) * (overhead ? 1.2 : 0.25) + 16);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        // Animation ticks can swap the texture after the unit's palette tick. Resolve
        // at draw time so the light never trails the sword by one cel.
        const binding = textureBlades.get(this.sprite.texture);
        this.resources.angelSword.uniforms.uStrength = binding ? 1 : 0;
        this.resources.angelSword.uniforms.uBlessingActive = binding?.blessing ? 1 : 0;
        if (binding) this.update(binding.blade, binding.flight, binding.clipped);
        args[0].calculateSpriteMatrix(this.resources.angelSword.uniforms.uBodyMatrix, this.sprite);
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, AngelSwordGlowFilter>();
export function syncAngelSwordGlow(
    sprite: Sprite,
    state: string,
    frame: number,
    lab: boolean,
    frames?: readonly Texture[],
    idleElapsedMs = 0,
): void {
    const registration = `${lab}:${state}`;
    if (frames && registeredFrames.get(frames) !== registration) {
        frames.forEach((texture, index) => {
            const blade = angelSwordBlade(state, index, lab);
            if (blade)
                textureBlades.set(texture, {
                    blade,
                    flight: lab && state === "walk",
                    clipped: state === "death" && !lab,
                    blessing: lab && state === "cast",
                });
        });
        registeredFrames.set(frames, registration);
    }
    const blade = angelSwordBlade(state, frame, lab);
    if (blade)
        textureBlades.set(sprite.texture, {
            blade,
            flight: lab && state === "walk",
            clipped: state === "death" && !lab,
            blessing: lab && state === "cast",
        });
    let filter = filters.get(sprite);
    if (blade && !filter) {
        filter = new AngelSwordGlowFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    // Reserve enough room around the raised sword for the expanded base aura.
    filter.updatePadding(lab && state === "cast");
    if (blade) filter.update(blade, lab && state === "walk", state === "death" && !lab);
    filter.updateBlessing(lab && state === "cast" ? idleElapsedMs : 0);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === !!blade) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = blade ? [...remaining, filter] : remaining.length ? remaining : null;
}
