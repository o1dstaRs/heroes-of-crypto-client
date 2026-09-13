import { ARBALESTER_ATTACK_ARM_DATA } from "./ArbalesterAttackArmData";
import { ARBALESTER_ATTACK_HEAD_DATA } from "./ArbalesterAttackHeadData";
import {
    ARBALESTER_STRAIGHT_WAIST,
    ARBALESTER_IDLE_WAIST_WIDTH,
    straightAttackArmTarget,
} from "./ArbalesterStraightAttackFit";

/** Inverse pose registration: retain each bone's axis and only calibrate its thickness. */
export interface ArbalesterAnatomyBone {
    axis: readonly [number, number, number, number];
    sourceHalfWidth: number;
    targetHalfWidth: number;
    outerHalfWidth: number;
    endFadePx: number;
    /** A signed side confines correction to the exposed contour away from an overlapping weapon. */
    side?: -1 | 0 | 1;
    horizontalOnly?: boolean;
}

export const ARBALESTER_ANATOMY_BONE_COUNT = 6;

const profiles = Object.fromEntries(
    Object.entries(ARBALESTER_ATTACK_HEAD_DATA).map(([state, frames]) => [
        state,
        frames.map((head, frameIndex) => {
            const axis = new Float32Array(ARBALESTER_ANATOMY_BONE_COUNT * 4);
            const shape = new Float32Array(ARBALESTER_ANATOMY_BONE_COUNT * 4);
            const side = new Float32Array(ARBALESTER_ANATOMY_BONE_COUNT);
            const mode = new Float32Array(ARBALESTER_ANATOMY_BONE_COUNT);
            axis.set(head.slice(0, 4));
            shape.set(head.slice(4, 8));
            mode[0] = 1;
            let enabled = head[4] > 0;
            ARBALESTER_ATTACK_ARM_DATA[state]?.[frameIndex]?.forEach((arm, index) => {
                const slot = index + 1;
                axis.set(arm.slice(0, 4), slot * 4);
                shape.set(arm.slice(4, 8), slot * 4);
                if (state === "attack" && arm[4] > 0) {
                    shape[slot * 4 + 1] = straightAttackArmTarget(arm[4], index);
                }
                side[slot] = arm[8];
                enabled ||= arm[4] > 0 && arm[4] !== arm[5];
            });
            if (state === "attack") {
                const [right, width] = ARBALESTER_STRAIGHT_WAIST[frameIndex];
                if (width > 0) {
                    // Keep the weapon-side half of the trunk untouched. A broad
                    // fade along the exposed flank avoids pinching the belt seam.
                    const flankWidth = 230 - (right - width);
                    axis.set([230, 205, 230, 285], 12);
                    shape.set(
                        [flankWidth, flankWidth - (width - ARBALESTER_IDLE_WAIST_WIDTH), flankWidth + 12, 25],
                        12,
                    );
                    side[3] = -1;
                    mode[3] = 2;
                    enabled = true;
                }
            }
            return { axis, shape, side, mode, enabled };
        }),
    ]),
);

export function arbalesterAttackAnatomyFrame(state: string, frame: number) {
    if (!Number.isInteger(frame) || frame < 1 || frame > 10) return undefined;
    const profile = profiles[state]?.[frame];
    return profile?.enabled ? profile : undefined;
}

/**
 * Each transverse section is strictly monotone. Both ends and the outer margin
 * return continuously to identity, so the correction cannot duplicate contours.
 * Length, direction and joint positions come entirely from the authored pose.
 */
export const arbalesterAnatomyShader = /* glsl */ `
uniform vec4 uAnatomyAxis[6];
uniform vec4 uAnatomyShape[6];
uniform float uAnatomySide[6];
uniform float uAnatomyMode[6];
uniform float uRepairAnatomy;
vec2 anatomyBoneSource(vec2 p, vec4 axis, vec4 shape, float side, float mode) {
    if (shape.x <= 0.0 || shape.y <= 0.0 || shape.z <= max(shape.x,shape.y)
        || shape.w <= 0.0 || abs(shape.x-shape.y) < 0.001) return p;
    vec2 delta = axis.zw-axis.xy;
    float lengthPx = length(delta);
    if (lengthPx < 1.0) return p;
    vec2 tangent = delta/lengthPx;
    vec2 normal = vec2(-tangent.y,tangent.x);
    vec2 offset = p-axis.xy;
    float along = dot(offset,tangent);
    float across = dot(offset,normal);
    if (mode > 0.5) {
        lengthPx = delta.y;
        if (lengthPx < 1.0) return p;
        along = p.y-axis.y;
        across = p.x-mix(axis.x,axis.z,along/lengthPx);
        normal = vec2(1.0,0.0);
    }
    if (side*across < 0.0) return p;
    if (along <= 0.0 || along >= lengthPx || abs(across) >= shape.z) return p;
    float sourceAcross;
    if (abs(across) <= shape.y) sourceAcross = abs(across)*shape.x/shape.y;
    else sourceAcross = mix(shape.x,shape.z,(abs(across)-shape.y)/(shape.z-shape.y));
    sourceAcross *= sign(across);
    float fade = min(shape.w,lengthPx*0.49);
    float endWeight = smoothstep(0.0,fade,along)
        * (1.0-smoothstep(lengthPx-fade,lengthPx,along));
    if (mode > 1.5) endWeight = smoothstep(0.0,fade,along)
        * (1.0-smoothstep(lengthPx-35.0,lengthPx,along));
    return p+normal*(sourceAcross-across)*endWeight;
}
vec2 arbalesterAnatomySource(vec2 p) {
    if (uRepairAnatomy < 0.5) return p;
    for (int i=0; i<6; i++) p=anatomyBoneSource(p,uAnatomyAxis[i],uAnatomyShape[i],uAnatomySide[i],uAnatomyMode[i]);
    return p;
}
`;
