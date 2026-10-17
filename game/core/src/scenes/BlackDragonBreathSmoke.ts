import { Filter, GlProgram, Matrix, Texture, type Sprite } from "pixi.js";
import { BLACK_DRAGON_LAB_BREATH_MS } from "./BlackDragonLabIdle";

export function blackDragonSmokeTiming(elapsedMs: number) {
    const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    const breathMs = time % BLACK_DRAGON_LAB_BREATH_MS;
    const openingStartMs = BLACK_DRAGON_LAB_BREATH_MS / 2;
    const emissionDurationMs = openingStartMs * 1.3;
    // The longer exhale crosses the idle loop boundary without restarting the plume.
    const emissionAgeMs = Math.max(0, time - openingStartMs) % BLACK_DRAGON_LAB_BREATH_MS;
    const emissionProgress = Math.min(1, emissionAgeMs / emissionDurationMs);
    return {
        active: time >= openingStartMs && emissionAgeMs < emissionDurationMs,
        // Start with the first readable mouth puff and stretch the emitting cels
        // over the extended exhale. Cels 13–15 dissipate too early for this motion.
        frame: 1 + 11 * emissionProgress,
        // Match the authored 80 ms body cels so the emitter cannot slide off the mouth.
        rise: (8 * (1 - Math.cos((Math.floor(breathMs / 80) * Math.PI * 2) / 32))) / 2,
    };
}

const vertex = /* glsl */ `
in vec2 aPosition;
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
    vec2 uv = aPosition * uOutputFrame.zw * uInputSize.zw;
    vBodyCoord = (uBodyMatrix * vec3(uv, 1.0)).xy;
}`;

const fragment = /* glsl */ `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uSmoke;
uniform mat3 uInputMatrix;
uniform vec4 uInputClamp;
uniform float uFrame;
uniform float uRise;
uniform float uActive;
uniform float uAlpha;
vec4 smokeCel(vec2 uv, float frame) {
    vec2 cell = vec2(mod(frame, 4.0), floor(frame / 4.0));
    vec2 inset = 0.5 / vec2(145.0, 109.0);
    return texture(uSmoke, (cell + clamp(uv, inset, 1.0 - inset)) / 4.0);
}
void main() {
    vec2 uv = (uInputMatrix * vec3(vBodyCoord, 1.0)).xy;
    vec4 body = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
    // Attach at the red inner corner, behind the outer jaw, rather than at the lips.
    vec2 mouth = vec2(818.0, 485.0 - uRise);
    vec2 offset = (vBodyCoord * 1024.0 - mouth) / 1.08;
    // Turn the existing rising plume 55 degrees around its mouth attachment:
    // its centreline now exhales forward/down along the user's drawn trajectory.
    // Inverse rotation for texture lookup; facing follows the owning sprite.
    vec2 local = vec2(
        0.573576 * offset.x + 0.819152 * offset.y,
       -0.819152 * offset.x + 0.573576 * offset.y
    );
    // Small evolving eddies affect only the plume, fading to zero at its mouth attachment.
    float downstream = smoothstep(0.0, 80.0, local.x);
    local.y += sin(local.x * 0.055 - uFrame * 0.35) * 1.3 * downstream;
    vec2 smokeUV = (local + vec2(13.0, 82.0)) / vec2(145.0, 109.0);
    float inside = step(0.0, smokeUV.x) * step(smokeUV.x, 1.0)
                 * step(0.0, smokeUV.y) * step(smokeUV.y, 1.0);
    float blend = smoothstep(0.0, 1.0, fract(uFrame));
    vec4 plume = mix(smokeCel(smokeUV, floor(uFrame)), smokeCel(smokeUV, min(15.0, floor(uFrame) + 1.0)), blend);
    vec3 color = plume.a > 0.001 ? plume.rgb / plume.a : vec3(0.0);
    float alpha = (1.0 - pow(1.0 - plume.a, 1.8)) * inside * uActive * uAlpha;
    // The sampled body is premultiplied. Only the red tissue inside the mouth
    // admits smoke in front of it; scales, teeth and the black lip stay in front.
    vec3 material = body.a > 0.001 ? body.rgb / body.a : vec3(0.0);
    vec2 jaw = vBodyCoord * 1024.0 - mouth;
    float mouthRegion = step(-18.0, jaw.x) * step(jaw.x, 70.0)
                      * step(-12.0, jaw.y) * step(jaw.y, 80.0);
    float redTissue = smoothstep(0.06, 0.18, material.r - max(material.g, material.b))
                    * smoothstep(1.35, 1.9, material.r / max(0.025, material.g))
                    * mouthRegion;
    // Neutral silver-grey volume: more readable without lighting or tinting the dragon.
    vec3 rgb = min(color * 1.18, vec3(0.83)) * alpha;
    finalColor = vec4(rgb, alpha) * (1.0 - body.a * (1.0 - redTissue))
               + body * (1.0 - alpha * redTissue);
}`;

export class BlackDragonBreathSmokeFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                uSmoke: Texture.WHITE.source,
                breath: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uFrame: { value: 0, type: "f32" },
                    uRise: { value: 0, type: "f32" },
                    uActive: { value: 0, type: "f32" },
                    uAlpha: { value: 1, type: "f32" },
                },
            },
        });
    }
    public update(elapsedMs: number, texture: Texture): void {
        const timing = blackDragonSmokeTiming(elapsedMs);
        this.resources.uSmoke = texture.source;
        Object.assign(this.resources.breath.uniforms, {
            uFrame: timing.frame,
            uRise: timing.rise,
            uActive: timing.active ? 1 : 0,
        });
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.breath.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        uniforms.uAlpha = this.sprite.getGlobalAlpha();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, BlackDragonBreathSmokeFilter>();

export function syncBlackDragonBreathSmoke(
    sprite: Sprite,
    enabled: boolean,
    elapsedMs: number,
    texture?: Texture,
): void {
    const ready = enabled && texture?.width === 580 && texture.height === 436;
    let filter = filters.get(sprite);
    if (ready && !filter) {
        filter = new BlackDragonBreathSmokeFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (ready) filter.update(elapsedMs, texture);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === ready) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = ready ? [...remaining, filter] : remaining.length ? remaining : null;
}
