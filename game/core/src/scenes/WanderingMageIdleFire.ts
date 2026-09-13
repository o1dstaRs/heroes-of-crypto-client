import { Filter, GlProgram, Matrix, type Sprite, type Texture } from "pixi.js";
import { WANDERING_MAGE_IDLE_PALMS } from "./WanderingMageIdleAnchors";

export const WANDERING_MAGE_IDLE_FIRE_SPEED = 1.2;
export function wanderingMageFireFrame(elapsedMs: number): number {
    const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    return Math.floor((time * WANDERING_MAGE_IDLE_FIRE_SPEED * 60) / 1000 + 1e-9) % 60;
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
uniform sampler2D uAtlas;
uniform vec4 uBodyRect;
uniform vec4 uFireRect;
uniform vec2 uBodyPalm;
uniform vec2 uFirePalm;
uniform vec4 uTintAlpha;
vec4 sampleFrame(vec2 p, vec4 rect) {
    if (any(lessThan(p,vec2(0.0))) || any(greaterThan(p,vec2(768.0)))) return vec4(0.0);
    return texture(uAtlas,rect.xy+clamp(p,vec2(0.5),vec2(767.5))/768.0*rect.zw);
}
void main() {
    vec2 p = vBodyCoord*768.0;
    vec4 body = sampleFrame(p,uBodyRect);
    // The detached flame follows the current palm; the hand, sleeve, face and
    // torso retain the original breathing frame and two-second body clock.
    float flame = smoothstep(uBodyPalm.x-112.0,uBodyPalm.x-90.0,p.x)
        * (1.0-smoothstep(uBodyPalm.y-17.0,uBodyPalm.y-3.0,p.y));
    vec4 fire = sampleFrame(p+uFirePalm-uBodyPalm,uFireRect);
    finalColor = mix(body,fire,flame)*uTintAlpha;
}`;

class MageIdleFireFilter extends Filter {
    public constructor(
        private readonly sprite: Sprite,
        frames: readonly Texture[],
    ) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                uAtlas: frames[0].source,
                mage: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uBodyRect: { value: new Float32Array(4), type: "vec4<f32>" },
                    uFireRect: { value: new Float32Array(4), type: "vec4<f32>" },
                    uBodyPalm: { value: new Float32Array(2), type: "vec2<f32>" },
                    uFirePalm: { value: new Float32Array(2), type: "vec2<f32>" },
                    uTintAlpha: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(body: number, elapsedMs: number, frames: readonly Texture[]): void {
        const u = this.resources.mage.uniforms;
        for (const [part, index] of [
            ["Body", body],
            ["Fire", wanderingMageFireFrame(elapsedMs)],
        ] as const) {
            const texture = frames[index];
            const { x, y, width, height } = texture.frame;
            u[`u${part}Rect`].set([
                x / texture.source.width,
                y / texture.source.height,
                width / texture.source.width,
                height / texture.source.height,
            ]);
            u[`u${part}Palm`].set(WANDERING_MAGE_IDLE_PALMS[index]);
        }
        this.resources.uAtlas = frames[0].source;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.mage.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
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
const filters = new WeakMap<Sprite, MageIdleFireFilter>();
export function syncWanderingMageIdleFire(
    sprite: Sprite,
    frame: number,
    elapsedMs: number,
    frames: readonly Texture[],
): void {
    const enabled = frame >= 0 && frame < 120 && frames.length === 120;
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        try {
            filter = new MageIdleFireFilter(sprite, frames);
        } catch {
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
    if (enabled) filter.update(frame, elapsedMs, frames);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
