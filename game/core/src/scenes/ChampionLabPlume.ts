import { Filter, GlProgram, Matrix, type Sprite, type Texture } from "pixi.js";
import { championLabWalkHeightScale, championLabWalkWidthScale } from "./ChampionLabWalkCalibration";

const WALK_ROOTS = [
    [360, 130],
    [360, 130],
    [360, 138],
    [360, 142],
    [360, 136],
    [360, 130],
    [360, 136],
    [361, 139],
] as const;

export const CHAMPION_PLUME_PERIOD_MS = (Math.PI * 2 * 1000) / 5.2;
const PLUME_SIZE = [96, 80] as const;

/** A faster count-flag ripple; the socket and its first fibres are immobile. */
export function championPlumeWave(u: number, seconds: number, height: number): number {
    const free = Math.max(0, Math.min(1, u));
    const pinned = Math.max(0, Math.min(1, (free - 0.12) / 0.88));
    return height * 0.14 * pinned ** 2 * Math.sin(Math.PI * 2 * 1.15 * free - 5.2 * seconds);
}

export function championPlumePlacement(walkFrame: number): { root: readonly number[]; size: number[]; canvas: number } {
    const walking = walkFrame >= 0;
    return {
        root: walking ? (WALK_ROOTS[walkFrame] ?? WALK_ROOTS[0]) : [490, 251],
        size: walking
            ? [
                  PLUME_SIZE[0] / championLabWalkWidthScale(walkFrame),
                  PLUME_SIZE[1] / championLabWalkHeightScale(walkFrame),
              ]
            : [...PLUME_SIZE],
        canvas: walking ? 768 : 1024,
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
    vBodyCoord = (uBodyMatrix * vec3(aPosition * uOutputFrame.zw * uInputSize.zw, 1.0)).xy;
}`;
const fragment = /* glsl */ `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uPlume;
uniform mat3 uInputMatrix;
uniform vec4 uInputClamp;
uniform vec4 uPlacement;
uniform vec2 uClockCanvas;
uniform vec4 uTintAlpha;
vec2 hairOffset(vec2 uv) {
    // The metal socket occupies the bottom-right. Bend the whole arched crest,
    // including its crown, while keeping the socket and adjoining fibres fixed.
    float crown = max(0.0, 0.73 - uv.y);
    float free = clamp((0.805 - uv.x) / 0.69 + crown * 0.82, 0.0, 1.0);
    float pinned = clamp((free - 0.12) / 0.88, 0.0, 1.0);
    float socket = 1.0 - smoothstep(0.68, 0.735, uv.y) * smoothstep(0.70, 0.75, uv.x);
    float phase = 6.28318530718 * 1.15 * free - 5.2 * uClockCanvas.x;
    float envelope = pinned * pinned * socket;
    return envelope * vec2(0.045 * cos(phase), 0.14 * sin(phase));
}
void main() {
    vec2 bodyUv = (uInputMatrix * vec3(vBodyCoord, 1.0)).xy;
    vec4 body = texture(uTexture, clamp(bodyUv, uInputClamp.xy, uInputClamp.zw));
    vec2 p = vBodyCoord * uClockCanvas.y;
    vec2 destination = (p - uPlacement.xy) / uPlacement.zw + vec2(0.805, 0.836);
    vec2 plumeUv = destination;
    for (int i = 0; i < 6; i++) plumeUv = destination - hairOffset(plumeUv);
    vec4 plume = texture(uPlume, clamp(plumeUv, vec2(0.0), vec2(1.0)));
    if (any(lessThan(plumeUv, vec2(0.0))) || any(greaterThan(plumeUv, vec2(1.0)))) plume = vec4(0.0);
    plume *= uTintAlpha;
    finalColor = plume + body * (1.0 - plume.a);
}`;

class ChampionPlumeFilter extends Filter {
    public constructor(
        private readonly sprite: Sprite,
        texture: Texture,
    ) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 12,
            resources: {
                uPlume: texture.source,
                plume: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uPlacement: { value: new Float32Array(4), type: "vec4<f32>" },
                    uClockCanvas: { value: new Float32Array(2), type: "vec2<f32>" },
                    uTintAlpha: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(texture: Texture, now: number, walkFrame: number): void {
        const placement = championPlumePlacement(walkFrame);
        this.resources.uPlume = texture.source;
        this.resources.plume.uniforms.uPlacement.set([...placement.root, ...placement.size]);
        this.resources.plume.uniforms.uClockCanvas.set([now / 1000, placement.canvas]);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.plume.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
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

const filters = new WeakMap<Sprite, ChampionPlumeFilter>();
export function syncChampionPlume(
    sprite: Sprite,
    enabled: boolean,
    texture: Texture | undefined,
    now: number,
    walkFrame: number,
): void {
    let filter = filters.get(sprite);
    if (enabled && texture && texture.width === 512 && !filter) {
        filter = new ChampionPlumeFilter(sprite, texture);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    const installed = sprite.filters ?? [];
    if (enabled && texture) {
        filter.update(texture, now, walkFrame);
        if (!installed.includes(filter)) sprite.filters = [...installed, filter];
    } else if (installed.includes(filter)) sprite.filters = installed.filter((f) => f !== filter);
}
