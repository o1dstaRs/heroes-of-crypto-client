import { Filter, GlProgram, Matrix, Texture, type Sprite } from "pixi.js";
import { type TeamType } from "@heroesofcrypto/common";
import { ABOMINATION_BASE_COLOR_GAINS, isAbominationBasePalette } from "./AbominationBasePalette";
import { personalArmyPresetFor } from "./personalArmyTint";
import { teamFlagPalette } from "./teamColors";

const smooth = (a: number, b: number, x: number): number => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

export function abominationIdleMotion(elapsedMs: number): [number, number, number, number] {
    const t = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) / 1000;
    const gripPhase = t % 9;
    const grip = smooth(2.1, 3.3, gripPhase) * (1 - smooth(5.2, 6.4, gripPhase));
    return [t, Math.sin((t * Math.PI * 2) / 3.8), Math.sin((t * Math.PI * 2) / 10.4), grip];
}

/** Connected movement fades through knees; both planted foot contacts stay exactly fixed. */
export function abominationIdleOffset(x: number, y: number, elapsedMs: number): [number, number] {
    if (y >= 670) return [0, 0];
    const [t, breath, look] = abominationIdleMotion(elapsedMs);
    const upper = 1 - smooth(470, 670, y);
    const head = (1 - smooth(115, 215, y)) * smooth(295, 360, x);
    const left = 365 + Math.max(0, y - 420) * 0.19;
    const right = 492 - Math.max(0, y - 430) * 0.12;
    const cloth = smooth(left - 12, left + 6, x) * (1 - smooth(right - 6, right + 12, x));
    const free = Math.max(0, Math.min(1, (y - 402) / 232)) ** 4;
    const wind = cloth * (1 - smooth(631, 650, y)) * free * Math.sin(7.225 * free ** 0.25 - 2.6 * t);
    return [
        2.5 * Math.sin((t * Math.PI * 2) / 7.6) * upper + look * (9 + (190 - y) * 0.045) * head + 17 * wind,
        7 * breath * upper + look * (x - 416) * 0.065 * head + 5 * wind,
    ];
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
    vBodyCoord = (uBodyMatrix * vec3(aPosition * uOutputFrame.zw * uInputSize.zw, 1.0)).xy;
}`;

const fragment = /* glsl */ `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uOpenHand;
uniform mat3 uInputMatrix;
uniform vec4 uInputClamp;
uniform vec4 uMotion;
uniform float uIdle;
uniform float uReady;
uniform vec3 uClothEdge;
uniform vec3 uClothCenter;
uniform vec4 uTintAlpha;

vec2 motion(vec2 p) {
    float upper = 1.0 - smoothstep(470.0, 670.0, p.y);
    float head = (1.0 - smoothstep(115.0, 215.0, p.y)) * smoothstep(295.0, 360.0, p.x);
    float left = 365.0 + max(0.0, p.y - 420.0) * 0.19;
    float right = 492.0 - max(0.0, p.y - 430.0) * 0.12;
    float cloth = smoothstep(left - 12.0, left + 6.0, p.x) * (1.0 - smoothstep(right - 6.0, right + 12.0, p.x));
    float u = clamp((p.y - 402.0) / 232.0, 0.0, 1.0);
    // Same travelling-wave speed and u^4 attachment as the army flag.
    float wind = cloth * (1.0 - smoothstep(631.0, 650.0, p.y)) * pow(u, 4.0) * sin(7.225 * u - 2.6 * uMotion.x);
    return vec2(2.5 * sin(uMotion.x * 6.28318530718 / 7.6) * upper
        + uMotion.z * (9.0 + (190.0 - p.y) * 0.045) * head + 17.0 * wind,
        7.0 * uMotion.y * upper + uMotion.z * (p.x - 416.0) * 0.065 * head + 5.0 * wind);
}
void main() {
    vec2 destination = vBodyCoord * 768.0;
    vec2 source = destination;
    for (int i = 0; i < 6; i++) source = destination - motion(source) * uIdle;
    vec2 uv = (uInputMatrix * vec3(source / 768.0, 1.0)).xy;
    vec4 body = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
    float hand = smoothstep(253.0, 273.0, source.x) * (1.0 - smoothstep(391.0, 407.0, source.x))
        * smoothstep(291.0, 311.0, source.y) * (1.0 - smoothstep(427.0, 445.0, source.y));
    if (uIdle > 0.5 && uReady > 0.5 && hand > 0.0) {
        vec4 opened = texture(uOpenHand, clamp(source / 768.0, vec2(0.0), vec2(1.0)));
        opened.rgb *= vec3(${ABOMINATION_BASE_COLOR_GAINS.join(", ")});
        opened *= uTintAlpha;
        body = mix(body, opened, hand * uMotion.w);
    }
    // The loincloth keeps its authored crimson material; flags provide wind timing only.
    finalColor = body;
}`;

const rgb = (color: number): number[] => [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];

export class AbominationIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            padding: 8,
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                uOpenHand: Texture.WHITE.source,
                idle: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uMotion: { value: new Float32Array(4), type: "vec4<f32>" },
                    uIdle: { value: 0, type: "f32" },
                    uReady: { value: 0, type: "f32" },
                    uClothEdge: { value: new Float32Array(3), type: "vec3<f32>" },
                    uClothCenter: { value: new Float32Array(3), type: "vec3<f32>" },
                    uTintAlpha: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(idle: boolean, elapsedMs: number, team: TeamType, openHand?: Texture): void {
        const uniforms = this.resources.idle.uniforms;
        uniforms.uMotion.set(abominationIdleMotion(elapsedMs));
        uniforms.uIdle = idle ? 1 : 0;
        const ready = openHand?.width === 768 && openHand.height === 768;
        if (ready) this.resources.uOpenHand = openHand.source;
        uniforms.uReady = ready ? 1 : 0;
        const preset = personalArmyPresetFor(team);
        const palette = teamFlagPalette(team);
        uniforms.uClothEdge.set(rgb(preset?.gradient[0] ?? palette.edge));
        uniforms.uClothCenter.set(rgb(preset?.gradient[1] ?? palette.center));
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.idle.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        const tint = this.sprite.getGlobalTint();
        const alpha = this.sprite.getGlobalAlpha();
        uniforms.uTintAlpha.set([...rgb(tint).map((channel) => channel * alpha), alpha]);
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, AbominationIdleFilter>();
export function syncAbominationIdleVisuals(
    sprite: Sprite,
    enabled: boolean,
    idle: boolean,
    elapsedMs: number,
    team: TeamType,
    openHand?: Texture,
): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        try {
            filter = new AbominationIdleFilter(sprite);
            filters.set(sprite, filter);
            const owned = filter;
            sprite.once("destroyed", () => owned.destroy());
        } catch {
            // Headless tests still cover contact positions, timing, and filter ownership.
        }
    }
    if (!filter) return;
    if (enabled) filter.update(idle, elapsedMs, team, openHand);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    if (enabled) remaining.splice(remaining.findIndex(isAbominationBasePalette) + 1, 0, filter);
    sprite.filters = remaining.length ? remaining : null;
}
