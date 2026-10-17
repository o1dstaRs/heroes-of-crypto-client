import { MONK_RANGED_FRAMES } from "./MonkRangedAnimationFrames";
import { Filter, GlProgram, Matrix, type Sprite, type Texture } from "pixi.js";
import { MONK_MELEE_ORBS } from "./MonkMeleeFrames";
import { MONK_REACTION_FRAMES } from "./MonkReactionFrames";

// Orb centers measured on the eight approved 768px walk cels, in canonical canvas coordinates.
export const MONK_WALK_ORBS = [
    [514.61, 237.04],
    [514.7, 247.29],
    [515.54, 248.71],
    [515.18, 238.35],
    [511.04, 231.95],
    [511.61, 247.59],
    [512.65, 249.07],
    [515.59, 240.31],
] as const;

// Hood top measured at alpha > 128 on each upward-strike cel; neck stays at y=150.
export const MONK_UP_HEAD_TOP = [28, 30, 32, 34, 33, 33, 32, 40, 49, 58, 48, 38, 28, 28, 28, 28] as const;

export const MONK_IDLE_CYCLE_MS = 3192;
export const MONK_HEAD_NOD_RADIANS = (1.8 * Math.PI) / 180;

export function monkIdleHeadAngle(elapsedMs: number): number {
    return Math.sin((elapsedMs / MONK_IDLE_CYCLE_MS) * Math.PI * 2) * MONK_HEAD_NOD_RADIANS;
}

// Measured on the approved 24 native cels: robe and embroidery are calibrated separately.
// Keep the painted orb/fingers outside this correction, and never change texture alpha.
export const MONK_IDLE_MATERIAL_GAINS = [
    [
        [1.0667, 1, 1],
        [1.0198, 1.0449, 1.0784],
    ],
    [
        [1.0667, 1, 1],
        [1.0198, 1.0316, 1.0784],
    ],
    [
        [1.2308, 1.1053, 1.0909],
        [0.9717, 0.9939, 1],
    ],
    [
        [1.2308, 1.1053, 1.0909],
        [0.9626, 0.9819, 0.9821],
    ],
    [
        [1.2308, 1.1053, 1.0909],
        [0.9717, 0.9939, 1],
    ],
    [
        [1, 1, 1.0435],
        [1.051, 1.0584, 1.0577],
    ],
    [
        [1, 1, 1.0435],
        [1.051, 1.0584, 1.0577],
    ],
    [
        [1, 1, 1.0435],
        [1.051, 1.0584, 1.0577],
    ],
    [
        [1.2308, 1, 1],
        [1.0619, 1.0867, 1.0784],
    ],
    [
        [1.2308, 1, 1],
        [1.051, 1.0724, 1.0784],
    ],
    [
        [1.2308, 1, 1],
        [1.0619, 1.0867, 1.0784],
    ],
    [
        [1, 1, 1],
        [1, 0.9939, 1],
    ],
    [
        [1.0667, 1, 1],
        [0.9904, 0.9939, 1],
    ],
    [
        [1.0667, 1, 1],
        [0.9904, 0.9939, 1],
    ],
    [
        [0.9412, 0.913, 0.96],
        [1, 0.9939, 1],
    ],
    [
        [0.9412, 0.913, 0.96],
        [0.981, 0.9819, 0.9821],
    ],
    [
        [0.9412, 0.913, 0.9231],
        [0.981, 0.9819, 0.9821],
    ],
    [
        [0.9412, 0.913, 0.9231],
        [0.9626, 0.9588, 0.9322],
    ],
    [
        [0.9412, 0.913, 0.9231],
        [0.9626, 0.9588, 0.9322],
    ],
    [
        [0.9412, 0.913, 0.9231],
        [0.9626, 0.9588, 0.9322],
    ],
    [
        [1, 0.9545, 0.96],
        [1, 1.0062, 1],
    ],
    [
        [1, 0.9545, 0.96],
        [1, 1.0062, 0.9821],
    ],
    [
        [1, 0.9545, 0.96],
        [1, 1.0188, 1],
    ],
    [
        [1.0667, 1, 1],
        [1.0098, 1.0316, 1.0577],
    ],
] as const;

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
uniform sampler2D uCanonical;
uniform vec3 uClothGain;
uniform vec3 uGoldGain;
uniform vec4 uTintAlpha;
uniform float uHeadAngle;
uniform float uPhase;
uniform float uGlowStrength;
uniform float uReaction;
uniform float uPlantFeet;
uniform float uUpHeadScale;
uniform mat3 uTextureMatrix;
uniform vec2 uOrb;
uniform vec4 uHitWidths;
uniform vec4 uHitCenters;
float profile(vec4 values, float y) {
    if (y < 500.0) return mix(values.x, values.y, smoothstep(400.0, 500.0, y));
    if (y < 600.0) return mix(values.y, values.z, smoothstep(500.0, 600.0, y));
    return mix(values.z, values.w, smoothstep(600.0, 680.0, y));
}
void main() {
    vec2 p = vBodyCoord * 768.0;
    vec2 sampleP = p;
    // Restore the hood height around the stationary neck, tapering before the raised sleeve.
    float hood = (1.0 - smoothstep(440.0, 480.0, p.x))
        * (1.0 - smoothstep(140.0, 185.0, p.y));
    sampleP.y = mix(p.y, 150.0 + (p.y - 150.0) * uUpHeadScale, hood);
    float widthScale = mix(1.0, profile(uHitWidths, p.y), smoothstep(310.0, 400.0, p.y));
    float center = profile(uHitCenters, p.y);
    sampleP.x = center + (p.x - center) / widthScale;
    vec2 sampleUV = (uTextureMatrix * vec3(sampleP / 768.0, 1.0)).xy;
    vec4 painted = texture(uTexture, sampleUV);
    vec3 rgb = painted.rgb / max(painted.a, 0.0001);
    float gold = smoothstep(1.12, 1.3, rgb.r / max(rgb.b, 0.003));
    float robe = (1.0 - smoothstep(440.0, 472.0, p.x))
        * smoothstep(170.0, 195.0, p.y) * (1.0 - smoothstep(400.0, 440.0, p.y));
    painted.rgb *= mix(vec3(1.0), mix(uClothGain, uGoldGain, gold), robe * (1.0 - uReaction));

    // One canonical hood texture throughout the loop eliminates cel-to-cel color/detail flicker.
    // Rotation is local to the skull, blending through the neck; the shoulders are not rotated.
    float headWeight = (1.0 - smoothstep(142.0, 193.0, p.y)) * (1.0 - uReaction);
    vec2 source = p;
    source.x -= 3.0 * sin(uPhase) * pow(clamp((500.0 - p.y) / 400.0, 0.0, 1.0), 1.3);
    vec2 pivot = vec2(391.0, 169.0);
    vec2 delta = source - pivot;
    float angle = -uHeadAngle * headWeight;
    source = pivot + mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * delta;
    vec4 canonical = texture(uCanonical, clamp(source / 768.0, 0.0, 1.0)) * uTintAlpha;
    vec4 body = mix(painted, canonical, headWeight);

    // Preserve stable clothing below the moving sleeve as well as the canonical planted feet.
    float lower = smoothstep(400.0, 500.0, p.y) * max(1.0 - uReaction, uPlantFeet);
    vec4 lowerBody = texture(uCanonical, clamp(p / 768.0, 0.0, 1.0)) * uTintAlpha;
    body = mix(body, lowerBody, lower);

    // Slowly breathing halo BEHIND premultiplied foreground. Opaque hands transmit zero glow.
    vec2 orb = uOrb;
    float distanceFromOrb = length(p - orb) / 0.8;
    float halo = min(0.98, 0.90 * exp(-pow(distanceFromOrb / 84.0, 2.0))
        + 0.65 * exp(-pow(distanceFromOrb / 43.0, 2.0)))
        * (1.0 - smoothstep(125.0, 165.0, distanceFromOrb));
    vec3 haloColor = mix(vec3(0.68, 1.0, 0.16), vec3(1.0, 0.98, 0.48),
        exp(-pow(distanceFromOrb / 52.0, 2.0)));
    vec4 glow = vec4(haloColor * halo, halo) * uTintAlpha * uGlowStrength;
    finalColor = body + glow * (1.0 - body.a);
}`;

export class MonkIdleFilter extends Filter {
    public constructor(
        private readonly sprite: Sprite,
        canonical: Texture,
    ) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            padding: 24,
            antialias: "inherit",
            resources: {
                uCanonical: canonical.source,
                monk: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uTextureMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uClothGain: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" },
                    uGoldGain: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" },
                    uTintAlpha: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" },
                    uHeadAngle: { value: 0, type: "f32" },
                    uPhase: { value: 0, type: "f32" },
                    uGlowStrength: { value: 1, type: "f32" },
                    uReaction: { value: 0, type: "f32" },
                    uPlantFeet: { value: 0, type: "f32" },
                    uUpHeadScale: { value: 1, type: "f32" },
                    uOrb: { value: new Float32Array([515, 232]), type: "vec2<f32>" },
                    uHitWidths: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" },
                    uHitCenters: { value: new Float32Array([384, 384, 384, 384]), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(elapsedMs: number, frame: number, canonical: Texture, reaction?: string): void {
        this.resources.uCanonical = canonical.source;
        const u = this.resources.monk.uniforms;
        const gains = MONK_IDLE_MATERIAL_GAINS[Math.max(0, Math.min(23, frame))];
        u.uClothGain.set(gains[0]);
        u.uGoldGain.set(gains[1]);
        u.uHeadAngle = monkIdleHeadAngle(elapsedMs);
        u.uPhase = (elapsedMs / MONK_IDLE_CYCLE_MS) * Math.PI * 2;
        // Three seconds to 80%, three seconds back to full strength, with smooth turnarounds.
        u.uGlowStrength = 0.9 + 0.1 * Math.cos((elapsedMs / 6000) * Math.PI * 2);
        const action = reaction === "hit" || reaction === "death" ? reaction : undefined;
        const reactionFrame = action ? MONK_REACTION_FRAMES[action][Math.max(0, Math.min(21, frame))] : undefined;
        u.uUpHeadScale =
            reaction === "melee_attack_up" ? (150 - MONK_UP_HEAD_TOP[Math.max(0, Math.min(15, frame))]) / 122 : 1;
        const ranged =
            MONK_RANGED_FRAMES[reaction as keyof typeof MONK_RANGED_FRAMES]?.[Math.max(0, Math.min(15, frame))];
        if (reaction === "attack_up" && ranged) u.uUpHeadScale = ranged.headScale;
        const walking = reaction === "walk";
        const melee = MONK_MELEE_ORBS[reaction as keyof typeof MONK_MELEE_ORBS];
        u.uReaction = reactionFrame || walking || melee || ranged ? 1 : 0;
        // Hit recoil stays above the planted canonical lower robe and feet.
        u.uPlantFeet = action === "hit" ? 1 : 0;
        u.uOrb.set(
            walking
                ? MONK_WALK_ORBS[Math.max(0, Math.min(7, frame))]
                : (ranged?.orb ??
                      melee?.[Math.max(0, Math.min(15, frame))] ??
                      reactionFrame?.orb ?? [515 + 2 * Math.sin(u.uPhase), 232]),
        );
        u.uGlowStrength *= ranged?.glow ?? reactionFrame?.glow ?? 1;
        const hit = action === "hit" ? MONK_REACTION_FRAMES.hit[Math.max(0, Math.min(21, frame))] : undefined;
        u.uHitWidths.set(hit?.widths ?? [1, 1, 1, 1]);
        u.uHitCenters.set(hit?.centers ?? [384, 384, 384, 384]);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.monk.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uTextureMatrix.copyFrom(u.uBodyMatrix).invert();
        const tint = this.sprite.getGlobalTint(),
            alpha = this.sprite.getGlobalAlpha();
        u.uTintAlpha.set([
            (((tint >> 16) & 255) / 255) * alpha,
            (((tint >> 8) & 255) / 255) * alpha,
            ((tint & 255) / 255) * alpha,
            alpha,
        ]);
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, MonkIdleFilter>();
export function syncMonkLabIdle(
    sprite: Sprite,
    enabled: boolean,
    elapsedMs: number,
    frame: number,
    canonical?: Texture,
    reaction?: string,
): void {
    const active = enabled && canonical?.width === 768 && canonical.height === 768;
    let filter = filters.get(sprite);
    if (active && !filter) {
        filter = new MonkIdleFilter(sprite, canonical!);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (active) filter.update(elapsedMs, frame, canonical!, reaction);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === active) return;
    const others = installed.filter((entry) => entry !== filter);
    sprite.filters = active ? [filter, ...others] : others.length ? others : null;
}
