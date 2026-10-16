import { Filter, GlProgram, Matrix, type Sprite, type Texture } from "pixi.js";
import {
    isPikemanIdleCanonicalFrame,
    pikemanIdleFrame,
    PIKEMAN_IDLE_ATLAS_COLS,
    PIKEMAN_IDLE_ATLAS_ROWS,
    PIKEMAN_IDLE_FRAME_SIZE,
} from "./PikemanLabIdleMotion";

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
precision highp float;
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uAtlas;
uniform vec4 uFrameRect;
uniform vec4 uTintAlpha;
void main() {
    if (any(lessThan(vBodyCoord, vec2(0.0))) || any(greaterThan(vBodyCoord, vec2(1.0)))) {
        finalColor = vec4(0.0);
        return;
    }
    vec2 local = clamp(vBodyCoord, vec2(0.5/768.0), vec2(767.5/768.0));
    finalColor = texture(uAtlas, uFrameRect.xy + local * uFrameRect.zw) * uTintAlpha;
}`;

export class PikemanIdleFilter extends Filter {
    public constructor(
        private readonly sprite: Sprite,
        atlas: Texture,
    ) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 2,
            resources: {
                uAtlas: atlas.source,
                pikemanIdle: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uFrameRect: { value: new Float32Array(4), type: "vec4<f32>" },
                    uTintAlpha: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(frame: number, atlas: Texture): void {
        this.resources.uAtlas = atlas.source;
        this.resources.pikemanIdle.uniforms.uFrameRect.set([
            (frame % PIKEMAN_IDLE_ATLAS_COLS) / PIKEMAN_IDLE_ATLAS_COLS,
            Math.floor(frame / PIKEMAN_IDLE_ATLAS_COLS) / PIKEMAN_IDLE_ATLAS_ROWS,
            1 / PIKEMAN_IDLE_ATLAS_COLS,
            1 / PIKEMAN_IDLE_ATLAS_ROWS,
        ]);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.pikemanIdle.uniforms;
        args[0].calculateSpriteMatrix(uniforms.uBodyMatrix, this.sprite);
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

const filters = new WeakMap<Sprite, PikemanIdleFilter>();

/** Canonical holds bypass the filter, keeping the exact original texture and rendering path. */
export function syncPikemanLabIdle(sprite: Sprite, enabled: boolean, elapsedMs: number, atlas?: Texture): void {
    const frame = pikemanIdleFrame(elapsedMs);
    const ready =
        atlas?.width === PIKEMAN_IDLE_FRAME_SIZE * PIKEMAN_IDLE_ATLAS_COLS &&
        atlas.height === PIKEMAN_IDLE_FRAME_SIZE * PIKEMAN_IDLE_ATLAS_ROWS;
    const active = enabled && ready && !isPikemanIdleCanonicalFrame(frame);
    let filter = filters.get(sprite);
    if (active && !filter) {
        filter = new PikemanIdleFilter(sprite, atlas);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => {
            owned.destroy();
            filters.delete(sprite);
        });
    }
    if (!filter) return;
    if (active) filter.update(frame, atlas);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === active) return;
    const remaining = installed.filter((entry) => entry !== filter);
    // Existing contour/palette effects must run after the authored frame is drawn.
    sprite.filters = active ? [filter, ...remaining] : remaining.length ? remaining : null;
}
