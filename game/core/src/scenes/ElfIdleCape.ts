import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

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
uniform float uTime;
uniform float uStrength;
void main() {
    vec2 p = vBodyCoord * 768.0;
    // Rear cloth only. The right boundary stays left of the planted boots.
    float cloth = (1.0 - smoothstep(294.0, 320.0, p.x))
        * (1.0 - smoothstep(681.0, 701.0, p.y));
    // The lower bow limb crosses the upper cloak; keep that overlap fixed.
    float bowGuard = smoothstep(270.0, 291.0, p.x)
        * (1.0 - smoothstep(451.0, 477.0, p.y));
    float along = clamp((p.y - 245.0) / 440.0, 0.0, 1.0);
    float wind = cloth * (1.0 - bowGuard) * pow(along, 4.0) * uStrength;
    float phase = 6.2831853 * 1.15 * along - 2.6 * uTime;
    vec2 source = p - wind * vec2(18.0 * sin(phase), 4.0 * cos(phase));
    vec2 uv = (uInputMatrix * vec3(source / 768.0, 1.0)).xy;
    finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}`;

/** Continuous cloth motion over the existing breathing/bow-inspection atlas. */
export class ElfIdleCapeFilter extends Filter {
    private activatedAtMs: number | undefined;
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 4,
            resources: {
                elfCape: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uTime: { value: 0, type: "f32" },
                    uStrength: { value: 0, type: "f32" },
                },
            },
        });
    }
    public update(nowMs: number): void {
        const now = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0;
        this.activatedAtMs ??= now;
        const ramp = Math.max(0, Math.min(1, (now - this.activatedAtMs) / 450));
        const u = this.resources.elfCape.uniforms;
        // Clock is independent of sprite-frame timing and the one-second idle hold.
        u.uTime = (now % ((Math.PI * 2 * 1000) / 2.6)) / 1000;
        u.uStrength = ramp * ramp * (3 - 2 * ramp);
    }
    public pause(): void {
        this.activatedAtMs = undefined;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.elfCape.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, ElfIdleCapeFilter>();

export function syncElfIdleCape(sprite: Sprite, enabled: boolean, nowMs: number): void {
    let filter = filters.get(sprite);
    if (enabled && !filter) {
        filter = new ElfIdleCapeFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => {
            owned.destroy();
            filters.delete(sprite);
        });
    }
    if (!filter) return;
    if (enabled) filter.update(nowMs);
    else filter.pause();
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
