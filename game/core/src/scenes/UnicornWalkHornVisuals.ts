import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

// Horn root and tip on each authored 768px gait frame. Stretch only the isolated
// horn axis; the head, mane, body scale and ground registration stay untouched.
export const UNICORN_WALK_HORNS = [
    [610, 170, 676, 94],
    [610, 177, 677, 103],
    [614, 182, 676, 108],
    [618, 195, 680, 116],
    [611, 184, 675, 106],
    [610, 154, 668, 78],
    [609, 159, 668, 73],
    [615, 183, 676, 98],
] as const;
export const UNICORN_IDLE_HORN_LENGTH = Math.hypot(99, 111);
const vertex = `
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
const fragment = `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform mat3 uInputMatrix;
uniform vec4 uHorn;
uniform float uStretch;
uniform vec4 uInputClamp;
void main() {
 vec2 p = vBodyCoord * 768.0;
 vec2 axis = normalize(uHorn.zw - uHorn.xy);
 vec2 normal = vec2(-axis.y, axis.x);
 vec2 relative = p - uHorn.xy;
 float t = dot(relative, axis);
 float across = dot(relative, normal);
 float length = distance(uHorn.xy, uHorn.zw);
 if (t > 0.0 && t < length * uStretch + 8.0 && abs(across) < 17.0) {
   p = uHorn.xy + axis * (t / uStretch) + normal * across;
 }
 vec2 uv = (uInputMatrix * vec3(p / 768.0, 1.0)).xy;
 finalColor = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}`;
class HornFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 64,
            resources: {
                horn: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uHorn: { value: new Float32Array(4), type: "vec4<f32>" },
                    uStretch: { value: 1, type: "f32" },
                },
            },
        });
    }
    public update(frame: number, bodyScale: number): void {
        const points = UNICORN_WALK_HORNS[frame];
        this.resources.horn.uniforms.uHorn.set(points);
        this.resources.horn.uniforms.uStretch =
            UNICORN_IDLE_HORN_LENGTH / bodyScale / Math.hypot(points[2] - points[0], points[3] - points[1]);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.horn.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const ownedFilters = new WeakMap<Sprite, HornFilter>();
export function syncUnicornWalkHorn(sprite: Sprite, frame: number, bodyScale: number): void {
    let filter = ownedFilters.get(sprite);
    const enabled = !!UNICORN_WALK_HORNS[frame];
    if (enabled && !filter) {
        filter = new HornFilter(sprite);
        ownedFilters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(frame, bodyScale);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const rest = installed.filter((item) => item !== filter);
    sprite.filters = enabled ? [...rest, filter] : rest.length ? rest : null;
}
