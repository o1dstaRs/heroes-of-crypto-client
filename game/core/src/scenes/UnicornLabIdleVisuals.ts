import { Container, Filter, GlProgram, Matrix, Rectangle, Sprite, Texture } from "pixi.js";
import { UNICORN_IDLE_GLSL, unicornDustAge } from "./UnicornLabIdleMotion";

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
uniform float uPhase;
uniform vec4 uInputClamp;
${UNICORN_IDLE_GLSL}
void main() {
    vec2 destination = vBodyCoord * 768.0;
    vec2 source = destination;
    for (int i = 0; i < 8; i++) source = destination - unicornIdleOffset(source);
    vec2 uv = (uInputMatrix * vec3(source / 768.0, 1.0)).xy;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}`;

class UnicornIdleFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                tail: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uPhase: { value: 0, type: "f32" },
                },
            },
        });
    }
    public update(nowMs: number, flagPhase: number, flagSpeed: number): void {
        this.resources.tail.uniforms.uPhase = -nowMs * 0.001 * flagSpeed + flagPhase;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.tail.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
        uniforms.uInputMatrix.copyFrom(uniforms.uBodyMatrix).invert();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, UnicornIdleFilter>();
const dustLayers = new WeakMap<Sprite, Container>();
const dustFrames = new WeakMap<Texture, Texture[]>();

/** Wind deforms hair only; authored poses own the legs and dust follows ground contact. */
export function syncUnicornLabIdle(
    sprite: Sprite,
    enabled: boolean,
    nowMs: number,
    elapsedMs: number,
    flagPhase: number,
    flagSpeed: number,
    dustTexture?: Texture,
): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new UnicornIdleFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    let dust = dustLayers.get(sprite);
    if (enabled && !dust && dustTexture?.source) {
        let frames = dustFrames.get(dustTexture);
        if (!frames) {
            const w = dustTexture.width / 2;
            const h = dustTexture.height / 2;
            frames = Array.from(
                { length: 4 },
                (_, i) =>
                    new Texture({
                        source: dustTexture.source,
                        frame: new Rectangle((i % 2) * w, Math.floor(i / 2) * h, w, h),
                    }),
            );
            dustFrames.set(dustTexture, frames);
        }
        dust = new Container();
        dust.label = "unicorn-hoof-dust";
        dust.eventMode = "none";
        for (const texture of frames) {
            const puff = new Sprite(texture);
            puff.anchor.set(0.8, 0.85);
            puff.width = 230;
            puff.height = 110;
            puff.visible = false;
            dust.addChild(puff);
        }
        const ownedDust = dust;
        sprite.once("destroyed", () => ownedDust.destroy({ children: true }));
        dustLayers.set(sprite, dust);
    }
    if (dust) {
        if (sprite.parent && dust.parent !== sprite.parent) sprite.parent.addChild(dust);
        dust.position.copyFrom(sprite.position);
        dust.scale.copyFrom(sprite.scale);
        dust.rotation = sprite.rotation;
        dust.alpha = sprite.alpha;
        dust.zIndex = sprite.zIndex + 0.001;
        const age = enabled ? unicornDustAge(elapsedMs) : -1;
        dust.visible = age >= 0;
        const frame = Math.min(3, Math.floor(Math.max(0, age) * 4));
        // Match the actual authored hoof locations, including the instant backward pose change.
        const hoofX = age < 0.375 ? 600 : 330;
        for (let i = 0; i < dust.children.length; i++) {
            const puff = dust.children[i];
            puff.visible = age >= 0 && i === frame;
            puff.position.set(hoofX - sprite.anchor.x * 768, 732 - sprite.anchor.y * 768);
            puff.alpha = 0.9;
        }
    }
    if (!filter) return;
    if (enabled) filter.update(nowMs, flagPhase, flagSpeed);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [...remaining, filter] : remaining.length ? remaining : null;
}
