import { Filter, type Sprite } from "pixi.js";

// Sole centers measured in the 768px source frames, left boot then right boot.
// Register both points to the idle stance, not to the changing whole-frame bounds.
export const SCAVENGER_IDLE_SOLES = [
    [194.5, 723],
    [500, 743],
] as const;
export const SCAVENGER_HIT_SOLES = [
    [
        [209, 730],
        [509, 743],
    ],
    [
        [230, 733],
        [551, 743],
    ],
    [
        [209.5, 733],
        [519, 743],
    ],
    [
        [209, 732],
        [514, 743],
    ],
    [
        [209.5, 728],
        [510, 743],
    ],
    [
        [207.5, 728],
        [507, 743],
    ],
    [
        [208.5, 729],
        [502, 743],
    ],
    [
        [207.5, 728],
        [500, 743],
    ],
] as const;

// Correction is local to the boots. Never scale or shear the complete character.
const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vBodyCoord;
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
}
`;
const fragment = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uInputClamp;
uniform float uCenterX;
uniform float uCenterY;
uniform float uWidth;
uniform float uShear;
uniform float uMirror;
void main(void) {
    vec2 body = vec2(uMirror < 0.0 ? 1.0 - vBodyCoord.x : vBodyCoord.x, vBodyCoord.y);
    // The torso, belt and thighs retain their original width. Blend only below the knees.
    float boots = smoothstep(0.78, 0.92, body.y);
    float sourceX = uCenterX + (body.x - uCenterX) / uWidth;
    float sourceY = body.y - uShear * (sourceX - uCenterX);
    vec2 offset = (vec2(sourceX, sourceY) - body) * boots;
    offset.x *= uMirror;
    vec2 uv = vTextureCoord + offset * uOutputFrame.zw * uInputSize.zw;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}
`;

type Registration = { anchorX: number; anchorY: number };
const registrations = new WeakMap<Sprite, Registration>();
const filters = new WeakMap<Sprite, Filter>();

export function scavengerHitFootCorrection(frameIndex: number) {
    const [left, right] = SCAVENGER_HIT_SOLES[frameIndex] ?? SCAVENGER_HIT_SOLES[0];
    const [targetLeft, targetRight] = SCAVENGER_IDLE_SOLES;
    const dx = right[0] - left[0];
    return {
        centerX: (left[0] + right[0]) / 2,
        centerY: (left[1] + right[1]) / 2,
        targetX: (targetLeft[0] + targetRight[0]) / 2,
        targetY: (targetLeft[1] + targetRight[1]) / 2,
        widthScale: (targetRight[0] - targetLeft[0]) / dx,
        shear: (targetRight[1] - targetLeft[1] - (right[1] - left[1])) / dx,
    };
}

/** Source-to-output sole coordinates after the boot-only shader, in source pixels. */
export function scavengerHitRegisteredSoles(frameIndex: number) {
    const c = scavengerHitFootCorrection(frameIndex);
    return SCAVENGER_HIT_SOLES[frameIndex].map(([x, y]) => [
        c.centerX + (x - c.centerX) * c.widthScale,
        y + c.shear * (x - c.centerX),
    ]);
}

/** Remove the previous frame's translation and local correction before another state takes ownership. */
export function clearScavengerHitRegistration(sprite: Sprite): void {
    const previous = registrations.get(sprite);
    if (previous) {
        sprite.anchor.set(previous.anchorX, previous.anchorY);
        registrations.delete(sprite);
    }
    const filter = filters.get(sprite);
    if (filter && sprite.filters?.includes(filter)) {
        const remaining = sprite.filters.filter((entry) => entry !== filter);
        sprite.filters = remaining.length ? remaining : null;
    }
}

/** Keep both soles planted without changing sprite scale, rotation, skew, or body proportions. */
export function applyScavengerHitRegistration(sprite: Sprite, frameIndex: number): void {
    clearScavengerHitRegistration(sprite);
    if (!SCAVENGER_HIT_SOLES[frameIndex]) return;
    const c = scavengerHitFootCorrection(frameIndex);
    registrations.set(sprite, { anchorX: sprite.anchor.x, anchorY: sprite.anchor.y });
    sprite.anchor.set(sprite.anchor.x + (c.centerX - c.targetX) / 768, sprite.anchor.y + (c.centerY - c.targetY) / 768);
    let filter = filters.get(sprite);
    if (!filter) {
        filter = Filter.from({
            gl: { vertex, fragment },
            resources: {
                registration: {
                    uCenterX: { value: 0, type: "f32" },
                    uCenterY: { value: 0, type: "f32" },
                    uWidth: { value: 1, type: "f32" },
                    uShear: { value: 0, type: "f32" },
                    uMirror: { value: 1, type: "f32" },
                },
            },
        });
        filter.resolution = "inherit";
        filter.padding = 0;
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => {
            owned.destroy();
            filters.delete(sprite);
        });
    }
    Object.assign(filter.resources.registration.uniforms, {
        uCenterX: c.centerX / 768,
        uCenterY: c.centerY / 768,
        uWidth: c.widthScale,
        uShear: c.shear,
        uMirror: sprite.scale.x < 0 ? -1 : 1,
    });
    sprite.filters = [filter, ...(sprite.filters ?? [])];
}
