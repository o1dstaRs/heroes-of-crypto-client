import { Filter, type Sprite } from "pixi.js";

export const SCAVENGER_IDLE_BREATH_PERIOD_MS = 3200;
// Roughly 1.5–2 screen pixels of shoulder lift at the regular board zoom.
export const SCAVENGER_IDLE_BREATH_LIFT = 0.024;
export const SCAVENGER_IDLE_CHEST_EXPANSION = 0.035;

/** A continuous inhale/exhale with zero velocity at both ends, independent of ticker frequency. */
export function scavengerIdleBreathAmount(nowMs: number): number {
    return (1 - Math.cos((nowMs * Math.PI * 2) / SCAVENGER_IDLE_BREATH_PERIOD_MS)) * 0.5;
}

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
uniform float uBreath;
void main(void) {
    // The waist starts at 40% of the original figure. Never move its belt, pelvis or boots.
    float upperBody = 1.0 - smoothstep(0.15, 0.39, vBodyCoord.y);
    float chest = upperBody * smoothstep(0.12, 0.26, vBodyCoord.y);
    vec2 offset = vec2(-(vBodyCoord.x - 0.5) * chest * ${SCAVENGER_IDLE_CHEST_EXPANSION.toFixed(6)}, upperBody * ${SCAVENGER_IDLE_BREATH_LIFT.toFixed(6)}) * uBreath;
    vec2 uv = vTextureCoord + offset * uOutputFrame.zw * uInputSize.zw;
    // Sample the actual battlefield cutout; no tint, exposure or saturation changes.
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}
`;

const filters = new WeakMap<Sprite, Filter>();

/** Own one mutable breathing uniform per sprite; leave all unrelated gameplay filters intact. */
export function syncScavengerIdleBreath(sprite: Sprite, enabled: boolean, nowMs: number): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        try {
            filter = Filter.from({
                gl: { vertex, fragment },
                resources: { breathing: { uBreath: { value: 0, type: "f32" } } },
            });
            filter.resolution = "inherit";
            filter.padding = 0;
        } catch {
            // Headless tests can still render the unchanged original cutout.
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
    if (enabled) filter.resources.breathing.uniforms.uBreath = scavengerIdleBreathAmount(nowMs);
    const installed = sprite.filters ?? [];
    if (enabled === installed.includes(filter)) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
