import { Filter, GlProgram, Matrix, Texture, type Sprite } from "pixi.js";
import { DRYAD_IDLE_COLOR_MATRIX } from "./DryadIdlePalette";

// Measured opaque sole centers in the approved 768px archery atlases.
// The planted stance is the painted 384px idle, expressed on the same 768px canvas.
export const DRYAD_RANGED_IDLE_SOLES = [
    [225, 730],
    [448, 716],
] as const;
export const DRYAD_RANGED_SOLES = {
    attack: [
        [
            [211.0, 730],
            [421.0, 713],
        ],
        [
            [217.0, 730],
            [420.0, 716],
        ],
        [
            [217.5, 730],
            [423.5, 716],
        ],
        [
            [216.5, 730],
            [422.0, 716],
        ],
        [
            [218.0, 731],
            [424.5, 716],
        ],
        [
            [217.5, 731],
            [426.5, 716],
        ],
        [
            [216.5, 730],
            [427.0, 720],
        ],
        [
            [215.5, 730],
            [426.5, 720],
        ],
        [
            [215.0, 730],
            [426.0, 720],
        ],
        [
            [216.0, 730],
            [427.0, 722],
        ],
        [
            [217.0, 730],
            [427.0, 722],
        ],
        [
            [216.0, 730],
            [427.0, 722],
        ],
        [
            [211.0, 730],
            [421.0, 713],
        ],
    ],
    attack_up: [
        [
            [211.0, 730],
            [421.0, 713],
        ],
        [
            [214.5, 730],
            [437.5, 721],
        ],
        [
            [215.0, 730],
            [439.5, 721],
        ],
        [
            [214.5, 730],
            [439.0, 721],
        ],
        [
            [215.0, 730],
            [438.5, 721],
        ],
        [
            [215.0, 730],
            [439.5, 721],
        ],
        [
            [216.5, 730],
            [427.0, 720],
        ],
        [
            [215.5, 730],
            [426.5, 720],
        ],
        [
            [215.0, 730],
            [426.0, 720],
        ],
        [
            [216.0, 730],
            [427.0, 722],
        ],
        [
            [217.0, 730],
            [427.0, 722],
        ],
        [
            [216.0, 730],
            [427.0, 722],
        ],
        [
            [211.0, 730],
            [421.0, 713],
        ],
    ],
    attack_down: [
        [
            [211.0, 730],
            [421.0, 713],
        ],
        [
            [213.5, 730],
            [436.5, 721],
        ],
        [
            [213.0, 730],
            [437.0, 721],
        ],
        [
            [212.5, 730],
            [436.5, 721],
        ],
        [
            [212.0, 730],
            [436.0, 720],
        ],
        [
            [212.5, 730],
            [436.5, 720],
        ],
        [
            [216.5, 730],
            [427.0, 720],
        ],
        [
            [215.5, 730],
            [426.5, 720],
        ],
        [
            [215.0, 730],
            [426.0, 720],
        ],
        [
            [216.0, 730],
            [427.0, 722],
        ],
        [
            [217.0, 730],
            [427.0, 722],
        ],
        [
            [216.0, 730],
            [427.0, 722],
        ],
        [
            [211.0, 730],
            [421.0, 713],
        ],
    ],
} as const;
export type DryadRangedState = keyof typeof DRYAD_RANGED_SOLES;
export function isDryadRangedState(state: string | undefined): state is DryadRangedState {
    return state === "attack" || state === "attack_up" || state === "attack_down";
}

export function dryadRangedRegistration(state: DryadRangedState, index: number) {
    const soles = DRYAD_RANGED_SOLES[state][index];
    if (!soles) return undefined;
    const [left, right] = soles;
    const [targetLeft, targetRight] = DRYAD_RANGED_IDLE_SOLES;
    const centerX = (left[0] + right[0]) / 2;
    const centerY = (left[1] + right[1]) / 2;
    const dx = centerX - (targetLeft[0] + targetRight[0]) / 2;
    const dy = centerY - (targetLeft[1] + targetRight[1]) / 2;
    return {
        anchorX: 0.5 + dx / 768,
        // Idle's footAnchorY is 366/384. The old attack anchor was two pixels higher.
        anchorY: (732 + dy) / 768,
        centerX,
        leftShift: [targetLeft[0] - left[0] + dx, targetLeft[1] - left[1] + dy],
        rightShift: [targetRight[0] - right[0] + dx, targetRight[1] - right[1] + dy],
    };
}

/** Fade during the last two recovery poses; the final pose already IS the new idle. */
export function dryadRangedIdleBlend(index: number, elapsed: number, durations: readonly number[] = []): number {
    if (index < 10) return 0;
    if (index >= 12) return 1;
    const duration = (durations[10] ?? 75) + (durations[11] ?? 65);
    const time = (index === 11 ? (durations[10] ?? 75) : 0) + elapsed;
    const progress = Math.max(0, Math.min(1, time / duration));
    return progress * progress * (3 - 2 * progress);
}

/** Keep the authored recoil, then settle into the repainted idle over the final recovery poses. */
export function dryadHitIdleBlend(index: number, elapsed: number, durations: readonly number[] = []): number {
    if (index < 6) return 0;
    if (index >= 8) return 1;
    const duration = (durations[6] ?? 65) + (durations[7] ?? 60);
    const time = (index === 7 ? (durations[6] ?? 65) : 0) + elapsed;
    const progress = Math.max(0, Math.min(1, time / duration));
    return progress * progress * (3 - 2 * progress);
}

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vBodyCoord;
out vec2 vIdleCoord;
uniform mat3 uBodyMatrix;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vBodyCoord = aPosition;
    vIdleCoord = (uBodyMatrix * vec3(vTextureCoord, 1.0)).xy;
}
`;
const fragment = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vBodyCoord;
in vec2 vIdleCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uInputClamp;
uniform float uCenterX;
uniform vec2 uLeftShift;
uniform vec2 uRightShift;
uniform float uMirror;
uniform sampler2D uIdleTexture;
uniform vec4 uIdleFrame;
uniform vec2 uIdleOffset;
uniform float uIdleBlend;
uniform vec4 uGradeR;
uniform vec4 uGradeG;
uniform vec4 uGradeB;
uniform vec4 uTintAlpha;
void main(void) {
    vec2 body = vec2(uMirror < 0.0 ? 1.0 - vBodyCoord.x : vBodyCoord.x, vBodyCoord.y);
    // Each foot translates rigidly. Blend only below the knees and across the empty stance gap;
    // the torso, arms, bow, arrow and individual foot proportions remain untouched.
    float lowerLeg = smoothstep(0.78, 0.92, body.y);
    float side = smoothstep(uCenterX - 0.04, uCenterX + 0.04, body.x);
    vec2 offset = -mix(uLeftShift, uRightShift, side) * lowerLeg;
    offset.x *= uMirror;
    vec2 uv = vTextureCoord + offset * uOutputFrame.zw * uInputSize.zw;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
    if (uIdleBlend > 0.0) {
        // Map the idle into the same planted ground coordinates, without scaling either pose.
        vec2 idleUv = vIdleCoord + uIdleOffset;
        vec4 idle = vec4(0.0);
        if (all(greaterThanEqual(idleUv, vec2(0.0))) && all(lessThanEqual(idleUv, vec2(1.0)))) {
            idle = texture(uIdleTexture, uIdleFrame.xy + idleUv * uIdleFrame.zw);
            if (idle.a > 0.0) {
                vec4 rgb = vec4(idle.rgb / idle.a, 1.0);
                idle.rgb = clamp(vec3(dot(rgb, uGradeR), dot(rgb, uGradeG), dot(rgb, uGradeB)), 0.0, 1.0) * idle.a;
            }
            idle *= uTintAlpha;
        }
        finalColor = mix(finalColor, idle, uIdleBlend);
    }
}
`;

class DryadRangedFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resources: {
                uIdleTexture: Texture.WHITE.source,
                registration: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uCenterX: { value: 0, type: "f32" },
                    uLeftShift: { value: [0, 0], type: "vec2<f32>" },
                    uRightShift: { value: [0, 0], type: "vec2<f32>" },
                    uMirror: { value: 1, type: "f32" },
                    uIdleFrame: { value: [0, 0, 1, 1], type: "vec4<f32>" },
                    uIdleOffset: { value: [0, 0], type: "vec2<f32>" },
                    uIdleBlend: { value: 0, type: "f32" },
                    uGradeR: {
                        value: [
                            DRYAD_IDLE_COLOR_MATRIX[0],
                            DRYAD_IDLE_COLOR_MATRIX[1],
                            DRYAD_IDLE_COLOR_MATRIX[2],
                            DRYAD_IDLE_COLOR_MATRIX[4],
                        ],
                        type: "vec4<f32>",
                    },
                    uGradeG: {
                        value: [
                            DRYAD_IDLE_COLOR_MATRIX[5],
                            DRYAD_IDLE_COLOR_MATRIX[6],
                            DRYAD_IDLE_COLOR_MATRIX[7],
                            DRYAD_IDLE_COLOR_MATRIX[9],
                        ],
                        type: "vec4<f32>",
                    },
                    uGradeB: {
                        value: [
                            DRYAD_IDLE_COLOR_MATRIX[10],
                            DRYAD_IDLE_COLOR_MATRIX[11],
                            DRYAD_IDLE_COLOR_MATRIX[12],
                            DRYAD_IDLE_COLOR_MATRIX[14],
                        ],
                        type: "vec4<f32>",
                    },
                    uTintAlpha: { value: [1, 1, 1, 1], type: "vec4<f32>" },
                },
            },
        });
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        args[0].calculateSpriteMatrix(this.resources.registration.uniforms.uBodyMatrix, this.sprite);
        super.apply(...args);
    }
}

const anchors = new WeakMap<Sprite, { x: number; y: number }>();
const filters = new WeakMap<Sprite, Filter>();

export function clearDryadRangedRegistration(sprite: Sprite): void {
    const anchor = anchors.get(sprite);
    if (anchor) {
        sprite.anchor.set(anchor.x, anchor.y);
        anchors.delete(sprite);
    }
    const owned = filters.get(sprite);
    if (owned && sprite.filters?.includes(owned)) {
        const remaining = sprite.filters.filter((filter) => filter !== owned);
        sprite.filters = remaining.length ? remaining : null;
    }
}

export function applyDryadRangedRegistration(
    sprite: Sprite,
    state: DryadRangedState | "hit",
    index: number,
    idleTexture?: Texture,
    elapsed = 0,
    durations?: readonly number[],
): void {
    clearDryadRangedRegistration(sprite);
    // Hit recoil keeps its authored anchor and legs. Only its closing pose blends to idle.
    const registration =
        state === "hit"
            ? {
                  anchorX: 0.5,
                  anchorY: 730 / 768,
                  centerX: 384,
                  leftShift: [0, 0],
                  rightShift: [0, 0],
              }
            : dryadRangedRegistration(state, index);
    if (!registration) return;
    anchors.set(sprite, { x: sprite.anchor.x, y: sprite.anchor.y });
    sprite.anchor.set(registration.anchorX, registration.anchorY);
    let filter = filters.get(sprite);
    if (!filter) {
        filter = new DryadRangedFilter(sprite);
        filter.resolution = "inherit";
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => {
            owned.destroy();
            filters.delete(sprite);
            anchors.delete(sprite);
        });
    }
    const tint = sprite.getGlobalTint();
    const alpha = sprite.getGlobalAlpha();
    if (idleTexture) filter.resources.uIdleTexture = idleTexture.source;
    Object.assign(filter.resources.registration.uniforms, {
        uCenterX: registration.centerX / 768,
        uLeftShift: registration.leftShift.map((value) => value / 768),
        uRightShift: registration.rightShift.map((value) => value / 768),
        uMirror: sprite.scale.x < 0 ? -1 : 1,
        uIdleBlend: idleTexture
            ? state === "hit"
                ? dryadHitIdleBlend(index, elapsed, durations)
                : dryadRangedIdleBlend(index, elapsed, durations)
            : 0,
        uIdleOffset: [0.5 - registration.anchorX, 732 / 768 - registration.anchorY],
        uIdleFrame: idleTexture
            ? [
                  idleTexture.frame.x / idleTexture.source.width,
                  idleTexture.frame.y / idleTexture.source.height,
                  idleTexture.frame.width / idleTexture.source.width,
                  idleTexture.frame.height / idleTexture.source.height,
              ]
            : [0, 0, 1, 1],
        uTintAlpha: [
            (((tint >> 16) & 255) / 255) * alpha,
            (((tint >> 8) & 255) / 255) * alpha,
            ((tint & 255) / 255) * alpha,
            alpha,
        ],
    });
    sprite.filters = [filter, ...(sprite.filters ?? [])];
}
