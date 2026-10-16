import { ARBALESTER_ATTACK_PALETTE_PROFILES } from "./ArbalesterAttackPaletteData";
import { ARBALESTER_ATTACK_BODY_BALANCE } from "./ArbalesterAttackBodyBalance";
import { ARBALESTER_ATTACK_BODY_TONE, ARBALESTER_IDLE_BODY_TONE } from "./ArbalesterAttackToneData";
import { ARBALESTER_STRAIGHT_BODY_BALANCE, ARBALESTER_STRAIGHT_BODY_TONE } from "./ArbalesterStraightAttackFit";

const MATERIALS = ["dark_leather", "teal_cloth", "metal_greave", "face", "hair"] as const;
const profiles = new Map(
    Object.entries(ARBALESTER_ATTACK_PALETTE_PROFILES).map(([state, profile]) => [
        state,
        {
            frameGains: profile.frameGains.map((gains) => new Float32Array(gains.flat())),
            gammas: new Float32Array(MATERIALS.flatMap((material) => [...profile.materials[material].gamma])),
            handGain: new Float32Array(profile.materials.face.gain),
            headCenters: profile.headCenters,
            bodyBalance: (state === "attack"
                ? ARBALESTER_STRAIGHT_BODY_BALANCE
                : ARBALESTER_ATTACK_BODY_BALANCE[state]
            ).map((gain) => new Float32Array(gain)),
            bodyTone: (state === "attack" ? ARBALESTER_STRAIGHT_BODY_TONE : ARBALESTER_ATTACK_BODY_TONE[state]).map(
                (tone) => new Float32Array(tone),
            ),
        },
    ]),
);

export function arbalesterAttackPaletteFrame(state: string, frame: number) {
    if (!Number.isInteger(frame) || frame < 1 || frame > 10) return undefined;
    const profile = profiles.get(state);
    if (!profile) return undefined;
    return {
        gains: profile.frameGains[frame - 1],
        gammas: profile.gammas,
        handGain: profile.handGain,
        headCenter: profile.headCenters[frame - 1],
        bodyBalance: profile.bodyBalance[frame - 1],
        bodyTone: profile.bodyTone[frame - 1],
    };
}

// Classifiers read ungraded RGB and the sampled source-body coordinate after anatomy mapping.
// Every transfer is monotone and black preserving; this shader never changes alpha or coordinates.
export const arbalesterAttackPaletteShader = /* glsl */ `
uniform float uRepairAttackPalette;
uniform vec3 uAttackGains[5];
uniform vec3 uAttackGammas[5];
uniform vec3 uAttackHandGain;
uniform vec3 uAttackBodyBalance;
uniform float uAttackBodyTone[9];
uniform vec2 uAttackHeadCenter;
float attackBodyTone(float value) {
${ARBALESTER_IDLE_BODY_TONE.slice(1)
    .map(
        (target, index) =>
            `    if (value <= uAttackBodyTone[${index + 1}]) return mix(${ARBALESTER_IDLE_BODY_TONE[index].toFixed(9)}, ${target.toFixed(9)}, clamp((value-uAttackBodyTone[${index}])/max(0.000001,uAttackBodyTone[${index + 1}]-uAttackBodyTone[${index}]),0.0,1.0));`,
    )
    .join("\n")}
    return 1.0;
}
vec3 attackPaletteCurve(vec3 rgb, vec3 gain, vec3 gamma) {
    return clamp(gain * pow(max(rgb, vec3(0.0)), gamma), 0.0, 1.0);
}
float attackArmorCoverage(vec2 p, vec4 axis, float halfWidth) {
    vec2 delta = axis.zw - axis.xy;
    float lengthSquared = dot(delta, delta);
    if (halfWidth <= 0.0 || lengthSquared < 1.0) return 0.0;
    float along = clamp(dot(p - axis.xy, delta) / lengthSquared, 0.0, 1.0);
    float distancePx = length(p - (axis.xy + along * delta));
    return 1.0 - smoothstep(halfWidth * 0.85, halfWidth * 1.15, distancePx);
}
vec3 attackPaletteRgb(vec3 rgb, vec2 sourceBody) {
    if (uRepairAttackPalette < 0.5) return rgb;
    vec3 leather = attackPaletteCurve(rgb, uAttackGains[0], uAttackGammas[0]);
    vec3 cloth = attackPaletteCurve(rgb, uAttackGains[1], uAttackGammas[1]);
    vec3 metal = attackPaletteCurve(rgb, uAttackGains[2], uAttackGammas[2]);
    vec3 skin = attackPaletteCurve(rgb, uAttackGains[3], uAttackGammas[3]);
    vec3 skinHands = attackPaletteCurve(rgb, uAttackHandGain, uAttackGammas[3]);
    vec3 hair = attackPaletteCurve(rgb, uAttackGains[4], uAttackGammas[4]);
    // Blue steel reflections are not turquoise fabric. Cloth is below the belt;
    // letting its transfer cover the whole figure made raised arms turn cyan.
    float clothHeight = smoothstep(238.0, 253.0, sourceBody.y)
        * (1.0 - smoothstep(386.0, 398.0, sourceBody.y));
    float teal = smoothstep(0.015, 0.055, min(rgb.g - rgb.r, rgb.b - rgb.r)) * clothHeight;
    float shin = smoothstep(323.0, 341.0, sourceBody.y) * (1.0 - smoothstep(398.0, 414.0, sourceBody.y));
    // Use the actual source-arm contours. A horizontal body band also catches
    // neutral leather highlights on the chest and incorrectly tints them blue.
    float upperArmor = max(
        attackArmorCoverage(sourceBody, uAnatomyAxis[1], uAnatomyShape[1].x),
        attackArmorCoverage(sourceBody, uAnatomyAxis[2], uAnatomyShape[2].x)
    );
    float neutral = (1.0 - smoothstep(0.015, 0.065, rgb.r - rgb.g)) * smoothstep(0.10, 0.20, max(rgb.r, max(rgb.g, rgb.b)));
    vec3 color = mix(leather, metal, max(shin, upperArmor * neutral) * (1.0 - teal));
    // Match the figure's overall warm leather/steel balance, not just a small
    // sample panel. A diagonal chromatic correction preserves detail and light.
    vec3 balancedBody = color * uAttackBodyBalance;
    const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
    balancedBody *= dot(color, luma) / max(0.00001, dot(balancedBody, luma));
    color = clamp(balancedBody, 0.0, 1.0);
    // Idle's forearm steel is nearly neutral (R/G 1.01262, B/G 1.01047).
    // Keep warm reflected light, but remove excess cyan from raised gauntlets.
    vec3 armSteel = vec3(max(color.r, color.g * 1.01261842), color.g,
        min(color.b, color.g * 1.01047149));
    armSteel *= dot(color, luma) / max(0.00001, dot(armSteel, luma));
    color = mix(color, clamp(armSteel, 0.0, 1.0), upperArmor * neutral);
    // Match shadow depth and highlights as well as hue. Earlier mean-only fits
    // lifted dark leather into grey in the raised/lowered poses.
    float bodyLuma = dot(color, luma);
    color *= attackBodyTone(bodyLuma) / max(0.00001, bodyLuma);
    color = clamp(color, 0.0, 1.0);
    color = mix(color, cloth, teal);
    float skinColor = smoothstep(0.07, 0.14, rgb.r - rgb.g) * smoothstep(0.23, 0.40, rgb.r);
    float exposedHands = smoothstep(255.0, 283.0, sourceBody.x) * (1.0 - smoothstep(290.0, 320.0, sourceBody.y));
    color = mix(color, skinHands, skinColor * exposedHands);
    vec2 headOffset = (sourceBody - (uAttackHeadCenter + vec2(-9.0, -8.0))) / vec2(31.0, 35.0);
    float head = 1.0 - smoothstep(0.72, 1.15, length(headOffset));
    color = mix(color, mix(hair, skin, skinColor), head);
    return color;
}
`;
