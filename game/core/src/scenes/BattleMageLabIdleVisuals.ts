import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

export const BATTLE_MAGE_IDLE_PERIOD_MS = 4800;
export const BATTLE_MAGE_IDLE_SPEED = 1.25;
export const BATTLE_MAGE_IDLE_FIRE_SPEED = 2.6;

/** Connected torso motion in the canonical 768px canvas; soles never move. */
export function battleMageIdleMotion(elapsedMs: number): [number, number] {
    const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    const ramp = Math.min(1, time / 450);
    const fade = ramp * ramp * (3 - 2 * ramp);
    const phase = (time / BATTLE_MAGE_IDLE_PERIOD_MS) * Math.PI * 2;
    return [5 * Math.sin(phase) * fade, 1.6 * Math.sin(phase * 2) * fade];
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
uniform mat3 uInputMatrix;
uniform vec4 uInputClamp;
uniform vec2 uSway;
uniform float uTime;
uniform float uFireTime;
uniform float uAlpha;

float gauss(vec2 p, vec2 size) {
    vec2 q = p / size;
    return exp(-dot(q, q));
}
float glint(vec2 p, vec2 center, float phase) {
    vec2 d = p - center;
    float pulse = pow(max(0.0, sin(uTime * 1.8 + phase)), 12.0);
    return pulse * (gauss(d, vec2(1.25, 10.0)) + gauss(d, vec2(8.0, 1.25))
        + 0.3 * gauss(d, vec2(5.0)));
}
float tongue(vec2 p, float x, float height, float phase) {
    float h = (253.0 - p.y) / height;
    float wave = sin(h * 9.0 - uFireTime * 4.0 + phase)
        + 0.4 * sin(h * 17.0 - uFireTime * 6.0 + phase);
    float center = x + wave * (5.0 + 13.0 * h);
    float width = mix(11.0, 0.8, clamp(h, 0.0, 1.0))
        * (1.0 + 0.24 * sin(h * 12.0 - uFireTime * 5.2 + phase));
    float d = (p.x - center) / width;
    return exp(-d * d) * smoothstep(0.0, 0.16, h)
        * (1.0 - smoothstep(0.78, 1.0, h));
}
void main() {
    vec2 p = vBodyCoord * 768.0;
    // Move head, both arms and book together. Blend through hips, reaching zero
    // above the boots. No global scaling or independently floating equipment.
    p -= uSway * (1.0 - smoothstep(350.0, 650.0, p.y));
    vec2 source = p;
    // Same travelling sine and u^4 free-edge response as the amount flags:
    // 1.15 waves along the cloth, 2.6 radians/second. Only the rear cape moves;
    // its shoulder attachment, hand, front coat and both boots remain fixed.
    float cloth = (1.0 - smoothstep(295.0, 330.0, p.x))
        * (1.0 - smoothstep(658.0, 679.0, p.y));
    float along = clamp((p.y - 255.0) / 420.0, 0.0, 1.0);
    float windPhase = 6.2831853 * 1.15 * along - 2.6 * uTime;
    float wind = cloth * pow(along, 4.0) * smoothstep(0.0, 0.45, uTime);
    source.x -= 13.0 * wind * sin(windPhase);
    source.y -= 4.0 * wind * cos(windPhase);
    float flameRegion = (1.0 - smoothstep(255.0, 276.0, p.y))
        * smoothstep(165.0, 182.0, p.x) * (1.0 - smoothstep(266.0, 287.0, p.x));
    float flameTip = 1.0 - smoothstep(170.0, 258.0, p.y);
    source.x += flameRegion * flameTip * (10.0 * sin(p.y * 0.085 + uFireTime * 4.4)
        + 5.0 * sin(p.y * 0.14 - uFireTime * 5.6));
    source.y += flameRegion * flameTip * 7.0 * sin(p.x * 0.09 + uFireTime * 3.3);
    vec2 uv = (uInputMatrix * vec3(source / 768.0, 1.0)).xy;
    vec4 body = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));

    vec2 orb = p - vec2(228.0, 246.0);
    float pulse = 0.85 + 0.12 * sin(uFireTime * 3.1) + 0.06 * sin(uFireTime * 8.7);
    float halo = gauss(orb, vec2(55.0, 57.0) * 1.15) * 0.48 * pulse;
    float core = gauss(orb, vec2(12.0)) * 1.10 * pulse;
    float fire = tongue(p, 207.0, 112.0 + 22.0 * sin(uFireTime * 2.4), 0.0)
        + tongue(p, 238.0, 134.0 + 25.0 * sin(uFireTime * 2.1), 2.0)
        + tongue(p, 253.0, 86.0 + 18.0 * sin(uFireTime * 2.7), 4.0)
        + 0.60 * tongue(p, 223.0, 100.0 + 24.0 * sin(uFireTime * 2.9), 1.2);
    // Bright energy travels around the painted orb, so even the compact core
    // shows directional motion at battlefield size instead of a static glow.
    float angle = atan(orb.y, orb.x + 0.0001);
    float ringDistance = (length(orb) - 29.0) / 2.8;
    float orbit = exp(-ringDistance * ringDistance)
        * pow(0.5 + 0.5 * sin(angle * 3.0 + uFireTime * 3.4), 5.0);
    float sparks = 0.0;
    for (int i = 0; i < 8; i++) {
        float seed = float(i);
        float life = fract(uFireTime * (0.27 + seed * 0.016) + seed * 0.173);
        vec2 center = vec2(228.0 + sin(seed * 8.4 + life * 3.0) * (19.0 + life * 12.0),
            235.0 - life * 113.0);
        float fade = sin(life * 3.14159265);
        sparks += gauss(p - center, vec2(2.2, 4.2)) * fade * fade;
    }
    float jewels = glint(p, vec2(429.0, 200.0), 0.0)
        + glint(p, vec2(440.0, 341.0), 2.3)
        + glint(p, vec2(433.0, 67.0), 4.0);
    float metal = glint(p, vec2(381.0, 184.0), 1.1)
        + glint(p, vec2(586.0, 239.0), 3.3);
    // Premultiplied light: lilac-white core, saturated violet tongues and soft
    // spill around the palm. Equipment glints stay on the painted material.
    vec3 emission = vec3(0.52, 0.10, 1.0) * (halo + fire * 0.85)
        + vec3(0.95, 0.64, 1.0) * (core + sparks + orbit * 0.65)
        + (vec3(0.85, 0.55, 1.0) * jewels + vec3(1.0, 0.82, 0.55) * metal) * body.a;
    emission *= uAlpha;
    float glowAlpha = clamp(max(max(emission.r, emission.g), emission.b), 0.0, uAlpha);
    float alpha = body.a + glowAlpha * (1.0 - body.a);
    finalColor = vec4(min(body.rgb + emission, vec3(alpha)), alpha);
}`;

export class BattleMageIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 4,
            resources: {
                mageIdle: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uSway: { value: new Float32Array(2), type: "vec2<f32>" },
                    uTime: { value: 0, type: "f32" },
                    uFireTime: { value: 0, type: "f32" },
                    uAlpha: { value: 1, type: "f32" },
                },
            },
        });
    }
    public update(elapsedMs: number): void {
        const u = this.resources.mageIdle.uniforms;
        const animationMs = (Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0) * BATTLE_MAGE_IDLE_SPEED;
        u.uSway.set(battleMageIdleMotion(animationMs));
        u.uTime = animationMs / 1000;
        u.uFireTime = u.uTime * BATTLE_MAGE_IDLE_FIRE_SPEED;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.mageIdle.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
        u.uAlpha = this.sprite.getGlobalAlpha();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, BattleMageIdleFilter>();

export function syncBattleMageLabIdle(sprite: Sprite, enabled: boolean, elapsedMs: number): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new BattleMageIdleFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => {
            owned.destroy();
            filters.delete(sprite);
        });
    }
    if (!filter) return;
    if (enabled) filter.update(elapsedMs);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
