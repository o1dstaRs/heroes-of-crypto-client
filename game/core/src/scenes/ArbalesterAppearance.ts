import { Filter, GlProgram, Matrix, type Sprite, type Texture } from "pixi.js";
import { arbalesterAttackLowerBodyFrame, arbalesterLowerBodyShader } from "./ArbalesterAttackLowerBody";
import {
    ARBALESTER_ANATOMY_BONE_COUNT,
    arbalesterAnatomyShader,
    arbalesterAttackAnatomyFrame,
} from "./ArbalesterAttackAnatomy";
import { arbalesterAttackPaletteFrame, arbalesterAttackPaletteShader } from "./ArbalesterAttackPalette";

// One monotone, black-preserving transfer per clip, measured against the native idle.
// Provenance and material comparisons: assets/design/arbalester_combat_match_v2/qa.
export const ARBALESTER_WALK_GRADE = {
    gain: [0.85960849, 0.80766623, 0.83149726],
    gamma: [0.76985184, 0.78212992, 0.80026132],
    headGain: [0.98100097, 0.87251942, 0.8027135],
} as const;
export const ARBALESTER_DEATH_GRADE = {
    gain: [0.86780842, 0.81978168, 0.81311299],
    gamma: [1.00971857, 0.88624225, 0.872103],
} as const;
// Compact melee v2: fit against leather, cloth, greave, face and hair interiors, excluding the weapon.
// Local provenance: assets/design/arbalester_melee_match_v2/qa/material-palette-fit.json.
export const ARBALESTER_MELEE_GRADES = {
    melee_attack: {
        gain: [0.97137562, 1.04431367, 0.92830788],
        gamma: [1.06089243, 1.04717474, 0.97235023],
    },
    melee_attack_up: {
        gain: [0.98468195, 1.08222156, 0.95641344],
        gamma: [1.06431746, 1.04026232, 0.94177449],
    },
    melee_attack_down: {
        gain: [1.07158584, 1.24648641, 1.13700408],
        gamma: [1.11735132, 1.12972188, 1.06405782],
    },
} as const;
const IDENTITY_GRADE = { gain: [1, 1, 1], gamma: [1, 1, 1] } as const;
const HEAD_ANCHORS = [
    [247, 38],
    [262, 41],
    [274, 38],
    [277, 29],
    [280, 41],
    [271, 38],
    [259, 35],
    [250, 35],
] as const;

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vBodyCoord;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uBodyMatrix;
void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vBodyCoord = (uBodyMatrix * vec3(vTextureCoord, 1.0)).xy;
}
`;
const fragment = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uHeadMask;
uniform vec3 uGain;
uniform vec3 uGamma;
uniform vec3 uHeadGain;
uniform vec2 uHeadAnchor;
uniform vec2 uMaskCell;
uniform float uStrength;
uniform float uRepairHead;
uniform float uGlobalAlpha;
${arbalesterLowerBodyShader}
${arbalesterAnatomyShader}
${arbalesterAttackPaletteShader}
void main(void) {
    vec2 sampleUv = vTextureCoord;
    vec2 sourceBody = vBodyCoord * 512.0;
    if (uRepairLower > 0.5 || uRepairAnatomy > 0.5) {
        sourceBody.x = lowerBodySourceX(sourceBody.x, sourceBody.y);
        sourceBody = arbalesterAnatomySource(sourceBody);
        sampleUv = (uBodyInverse * vec3(sourceBody / 512.0, 1.0)).xy;
    }
    vec4 source = texture(uTexture, sampleUv);
    if (source.a <= 0.00001) { finalColor = source; return; }
    vec3 rgb = source.rgb / source.a;
    vec3 grade = clamp(uGain * pow(max(rgb, vec3(0.0)), uGamma), 0.0, 1.0);
    rgb = uRepairAttackPalette > 0.5 ? attackPaletteRgb(rgb, sourceBody) : mix(rgb, grade, uStrength);
    vec2 local = vBodyCoord * 768.0 - uHeadAnchor;
    float inside = step(0.0, local.x) * step(0.0, local.y)
        * step(local.x, 126.0) * step(local.y, 159.0);
    vec2 maskUv = (uMaskCell * vec2(126.0, 159.0) + clamp(local, vec2(0.5), vec2(125.5, 158.5)))
        / vec2(504.0, 318.0);
    float head = texture(uHeadMask, maskUv).r * inside * uRepairHead;
    rgb *= mix(vec3(1.0), uHeadGain, head);
    // The distance mask excludes the contour and neck fade; gameplay fades remain intact.
    float alpha = mix(source.a, uGlobalAlpha, head);
    finalColor = vec4(rgb * alpha, alpha);
}
`;

class ArbalesterAppearanceFilter extends Filter {
    public constructor(
        private readonly sprite: Sprite,
        mask: Texture,
    ) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resources: {
                uHeadMask: mask.source,
                appearance: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uBodyInverse: { value: new Matrix(), type: "mat3x3<f32>" },
                    uLowerSource: { value: new Float32Array(32), type: "vec4<f32>", size: 8 },
                    uLowerTarget: { value: new Float32Array(32), type: "vec4<f32>", size: 8 },
                    uLowerProtection: { value: new Float32Array(224), type: "vec2<f32>", size: 112 },
                    uRepairLower: { value: 0, type: "f32" },
                    uLowerStartY: { value: 240, type: "f32" },
                    uAnatomyAxis: {
                        value: new Float32Array(ARBALESTER_ANATOMY_BONE_COUNT * 4),
                        type: "vec4<f32>",
                        size: ARBALESTER_ANATOMY_BONE_COUNT,
                    },
                    uAnatomyShape: {
                        value: new Float32Array(ARBALESTER_ANATOMY_BONE_COUNT * 4),
                        type: "vec4<f32>",
                        size: ARBALESTER_ANATOMY_BONE_COUNT,
                    },
                    uRepairAnatomy: { value: 0, type: "f32" },
                    uAnatomySide: {
                        value: new Float32Array(ARBALESTER_ANATOMY_BONE_COUNT),
                        type: "f32",
                        size: ARBALESTER_ANATOMY_BONE_COUNT,
                    },
                    uAnatomyMode: {
                        value: new Float32Array(ARBALESTER_ANATOMY_BONE_COUNT),
                        type: "f32",
                        size: ARBALESTER_ANATOMY_BONE_COUNT,
                    },
                    uRepairAttackPalette: { value: 0, type: "f32" },
                    uAttackGains: { value: new Float32Array(15), type: "vec3<f32>", size: 5 },
                    uAttackGammas: { value: new Float32Array(15), type: "vec3<f32>", size: 5 },
                    uAttackHeadCenter: { value: new Float32Array(2), type: "vec2<f32>" },
                    uAttackHandGain: { value: new Float32Array(3), type: "vec3<f32>" },
                    uAttackBodyBalance: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" },
                    uAttackBodyTone: { value: new Float32Array(9), type: "f32", size: 9 },
                    uGain: { value: new Float32Array(3), type: "vec3<f32>" },
                    uGamma: { value: new Float32Array(3), type: "vec3<f32>" },
                    uHeadGain: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" },
                    uHeadAnchor: { value: new Float32Array(2), type: "vec2<f32>" },
                    uMaskCell: { value: new Float32Array(2), type: "vec2<f32>" },
                    uStrength: { value: 1, type: "f32" },
                    uRepairHead: { value: 0, type: "f32" },
                    uGlobalAlpha: { value: 1, type: "f32" },
                },
            },
            resolution: "inherit",
            antialias: "inherit",
            padding: 0,
            clipToViewport: false,
        });
    }
    public update(state: string, frame: number, mask: Texture): void {
        const u = this.resources.appearance.uniforms;
        const walk = state === "walk";
        const grade = walk
            ? ARBALESTER_WALK_GRADE
            : state === "death"
              ? ARBALESTER_DEATH_GRADE
              : (ARBALESTER_MELEE_GRADES[state as keyof typeof ARBALESTER_MELEE_GRADES] ?? IDENTITY_GRADE);
        u.uGain.set(grade.gain);
        u.uGamma.set(grade.gamma);
        u.uHeadGain.set(walk ? ARBALESTER_WALK_GRADE.headGain : [1, 1, 1]);
        u.uStrength = state === "death" ? Math.min(1, Math.max(0, frame / 5)) : 1;
        u.uRepairHead = walk && mask.width === 504 && mask.height === 318 ? 1 : 0;
        this.resources.uHeadMask = mask.source;
        const index = Math.max(0, Math.min(7, frame));
        u.uHeadAnchor.set(HEAD_ANCHORS[index]);
        u.uMaskCell.set([index % 4, Math.floor(index / 4)]);
        const attackPalette =
            this.sprite.texture.width === 512 ? arbalesterAttackPaletteFrame(state, frame) : undefined;
        u.uRepairAttackPalette = attackPalette ? 1 : 0;
        if (attackPalette) {
            u.uAttackGains.set(attackPalette.gains);
            u.uAttackGammas.set(attackPalette.gammas);
            u.uAttackHeadCenter.set(attackPalette.headCenter);
            u.uAttackHandGain.set(attackPalette.handGain);
            u.uAttackBodyBalance.set(attackPalette.bodyBalance);
            u.uAttackBodyTone.set(attackPalette.bodyTone);
        }
        const anatomy = this.sprite.texture.width === 512 ? arbalesterAttackAnatomyFrame(state, frame) : undefined;
        u.uRepairAnatomy = anatomy ? 1 : 0;
        if (anatomy) {
            u.uAnatomyAxis.set(anatomy.axis);
            u.uAnatomyShape.set(anatomy.shape);
            u.uAnatomySide.set(anatomy.side);
            u.uAnatomyMode.set(anatomy.mode);
        }
        const lower = this.sprite.texture.width === 512 ? arbalesterAttackLowerBodyFrame(state, frame) : undefined;
        u.uRepairLower = lower ? 1 : 0;
        // Keep rows with an overlapping weapon intact; blend below the final overlap.
        u.uLowerStartY = lower?.startY ?? 240;
        if (lower) {
            u.uLowerSource.set(lower.source);
            u.uLowerTarget.set(lower.target);
            u.uLowerProtection.set(lower.protection);
        }
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        args[0].calculateSpriteMatrix(this.resources.appearance.uniforms.uBodyMatrix, this.sprite);
        this.resources.appearance.uniforms.uBodyInverse
            .copyFrom(this.resources.appearance.uniforms.uBodyMatrix)
            .invert();
        this.resources.appearance.uniforms.uGlobalAlpha = this.sprite.getGlobalAlpha();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, ArbalesterAppearanceFilter>();

/** Swap appearance with the authored frame; idle/hit retain their already identical source palette. */
export function syncArbalesterAppearance(sprite: Sprite, state: string, frame: number, mask: Texture): void {
    const melee = state === "melee_attack" || state === "melee_attack_up" || state === "melee_attack_down";
    const lower = sprite.texture.width === 512 && !!arbalesterAttackLowerBodyFrame(state, frame);
    // The first and last melee frames contain the exact idle pixels and bypass the authored-art grade.
    const enabled = state === "walk" || (state === "death" && frame > 0) || (melee && frame > 0 && frame < 11) || lower;
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        try {
            filter = new ArbalesterAppearanceFilter(sprite, mask);
        } catch {
            // The headless renderer retains source pixels; browser QA covers the shader path.
            return;
        }
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => {
            owned.destroy();
            filters.delete(sprite);
        });
    }
    if (!filter) return;
    if (enabled) filter.update(state, frame, mask);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
