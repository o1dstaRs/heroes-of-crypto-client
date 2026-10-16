import { Filter, GlProgram, Matrix, type Sprite, type Texture } from "pixi.js";

const CANVAS = 1024;
const PADDING = 128;

function smoothstep(start: number, end: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
    return t * t * (3 - 2 * t);
}

/** Authored contact begins at 185ms; the exact idle frames occupy 0–30 and 365–470ms. */
export function wolfAttackReachPixels(state: string | undefined, elapsedMs: number): number {
    if ((state !== "attack" && state !== "attack_down") || !Number.isFinite(elapsedMs)) return 0;
    if (elapsedMs <= 30 || elapsedMs >= 365) return 0;
    const anticipation = state === "attack" ? 6 : 4;
    const peak = state === "attack" ? 28 : 24;
    if (elapsedMs < 100) return -anticipation * smoothstep(30, 100, elapsedMs);
    if (elapsedMs < 185) return -anticipation + (peak + anticipation) * smoothstep(100, 185, elapsedMs);
    if (elapsedMs <= 235) return peak;
    return peak * (1 - smoothstep(235, 365, elapsedMs));
}

/** Canonical 768px coordinates. Keep the complete low-biting head rigid and every paw planted. */
export function wolfAttackReachWeight(x: number, y: number): number {
    const body = 1 - smoothstep(470, 635, y);
    const head = smoothstep(535, 610, x) * (1 - smoothstep(635, 655, y));
    return body + (1 - body) * head;
}

function weightDerivativeX(x: number, y: number): number {
    const t = Math.max(0, Math.min(1, (x - 535) / 75));
    return smoothstep(470, 635, y) * (1 - smoothstep(635, 655, y)) * ((6 * t * (1 - t)) / 75);
}

/** Forward deformation for measurements: translate torso/head, flex lower legs, never move Y. */
export function wolfAttackReachPoint(x: number, y: number, reach: number): { x: number; y: number } {
    return { x: x + reach * wolfAttackReachWeight(x, y), y };
}

/** Invert the forward field so each output pixel samples one original, undissolved texel. */
export function wolfAttackReachSourcePoint(x: number, y: number, reach: number): { x: number; y: number } {
    let sourceX = x;
    // The minimum Jacobian is 0.88 at the −6px anticipation; this field cannot fold.
    for (let iteration = 0; iteration < 5; iteration++) {
        sourceX -=
            (sourceX + reach * wolfAttackReachWeight(sourceX, y) - x) / (1 + reach * weightDerivativeX(sourceX, y));
    }
    return { x: sourceX, y };
}

function sliceRect(sliceIndex = 0, sliceCount = 1): [number, number, number, number] {
    const count = Number.isFinite(sliceCount) ? Math.max(1, Math.floor(sliceCount)) : 1;
    const index = Number.isFinite(sliceIndex) ? Math.max(0, Math.min(count - 1, Math.floor(sliceIndex))) : 0;
    return [index / count, 0, 1 / count, 1];
}

/** Full-frame UV sampling also crosses a shadow slice boundary without clipping its contents. */
export function wolfAttackReachSourceUv(
    localX: number,
    localY: number,
    reach: number,
    sliceIndex = 0,
    sliceCount = 1,
): { x: number; y: number } {
    const slice = sliceRect(sliceIndex, sliceCount);
    const source = wolfAttackReachSourcePoint(
        (slice[0] + localX * slice[2]) * CANVAS - PADDING,
        localY * CANVAS - PADDING,
        reach,
    );
    return { x: (source.x + PADDING) / CANVAS, y: (source.y + PADDING) / CANVAS };
}

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vBodyCoord;
uniform mat3 uBodyMatrix;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vec2 textureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vBodyCoord = (uBodyMatrix * vec3(textureCoord, 1.0)).xy;
}
`;

const fragment = /* glsl */ `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uAtlas;
uniform vec4 uFrameRect;
uniform vec4 uSliceRect;
uniform vec4 uTintAlpha;
uniform float uReach;
vec2 weightAndDerivative(vec2 point) {
    float body = 1.0 - smoothstep(470.0, 635.0, point.y);
    float headY = 1.0 - smoothstep(635.0, 655.0, point.y);
    float headX = smoothstep(535.0, 610.0, point.x);
    float t = clamp((point.x - 535.0) / 75.0, 0.0, 1.0);
    return vec2(body + (1.0 - body) * headX * headY,
        (1.0 - body) * headY * 6.0 * t * (1.0 - t) / 75.0);
}
void main(void) {
    vec2 fullUv = uSliceRect.xy + vBodyCoord * uSliceRect.zw;
    vec2 outputPoint = fullUv * 1024.0 - vec2(128.0);
    vec2 sourcePoint = outputPoint;
    for (int i = 0; i < 5; i++) {
        vec2 field = weightAndDerivative(sourcePoint);
        sourcePoint.x -= (sourcePoint.x + uReach * field.x - outputPoint.x) / (1.0 + uReach * field.y);
    }
    vec2 sourceUv = (sourcePoint + vec2(128.0)) / 1024.0;
    if (any(lessThan(sourceUv, vec2(0.0))) || any(greaterThan(sourceUv, vec2(1.0)))) {
        finalColor = vec4(0.0);
        return;
    }
    // Sample the whole authored frame, including texels beyond a shadow's cropped slice.
    finalColor = texture(uAtlas, uFrameRect.xy + sourceUv * uFrameRect.zw) * uTintAlpha;
}
`;

class WolfAttackReachFilter extends Filter {
    public constructor(
        private readonly sprite: Sprite,
        fullFrame: Texture,
    ) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 0,
            resources: {
                uAtlas: fullFrame.source,
                reach: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uFrameRect: { value: new Float32Array(4), type: "vec4<f32>" },
                    uSliceRect: { value: new Float32Array([0, 0, 1, 1]), type: "vec4<f32>" },
                    uTintAlpha: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" },
                    uReach: { value: 0, type: "f32" },
                },
            },
        });
    }
    public update(reach: number, fullFrame: Texture, sliceIndex?: number, sliceCount?: number): void {
        const { x, y, width, height } = fullFrame.frame;
        const uniforms = this.resources.reach.uniforms;
        uniforms.uReach = reach;
        uniforms.uFrameRect.set([
            x / fullFrame.source.width,
            y / fullFrame.source.height,
            width / fullFrame.source.width,
            height / fullFrame.source.height,
        ]);
        uniforms.uSliceRect.set(sliceRect(sliceIndex, sliceCount));
        this.resources.uAtlas = fullFrame.source;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.reach.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        // The sprite matrix already includes facing, projection and cropped-slice anchors.
        const tint = this.sprite.getGlobalTint();
        const alpha = this.sprite.getGlobalAlpha();
        uniforms.uTintAlpha.set([
            (((tint >> 16) & 255) / 255) * alpha,
            (((tint >> 8) & 255) / 255) * alpha,
            ((tint & 255) / 255) * alpha,
            alpha,
        ]);
        super.apply(...args);
    }
}

const reachFilters = new WeakMap<Sprite, WolfAttackReachFilter>();

export function syncWolfAttackReachVisuals(
    sprite: Sprite,
    state: string | undefined,
    totalElapsedMs: number,
    fullFrameTexture: Texture,
    sliceIndex?: number,
    sliceCount?: number,
): void {
    const reach = wolfAttackReachPixels(state, totalElapsedMs);
    let filter = reachFilters.get(sprite);
    if (reach !== 0) {
        if (!filter) {
            try {
                filter = new WolfAttackReachFilter(sprite, fullFrameTexture);
                reachFilters.set(sprite, filter);
                const owned = filter;
                sprite.once("destroyed", () => {
                    owned.destroy();
                    reachFilters.delete(sprite);
                });
            } catch {
                // Retry after a transient/headless renderer failure; keep the authored pose meanwhile.
            }
        }
        filter?.update(reach, fullFrameTexture, sliceIndex, sliceCount);
    }
    const installed = sprite.filters ?? [];
    const desired = reach !== 0 ? filter : undefined;
    if (desired && installed[0] === desired && installed.filter((entry) => entry === desired).length === 1) return;
    if (!desired && (!filter || !installed.includes(filter))) return;
    const rest = installed.filter((entry) => entry !== filter);
    // Direct atlas sampling comes first, so unrelated gameplay/color filters still see its output.
    sprite.filters = desired ? [desired, ...rest] : rest.length ? rest : null;
}
