import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { TROLL_CAST_CALIBRATION } from "./TrollLabCastCalibration";

const poseOrder = [-1, 0, 1, 2, 3, 1, 0, -1];
export function trollCastCalibration(state: string | undefined, frame: number) {
    return state === "cast" ? TROLL_CAST_CALIBRATION[poseOrder[frame]] : undefined;
}
function smooth(a: number, b: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
}
/** The same registration as the shader, including the planted-foot zone. Also anchors the fist light. */
export function trollCastRegisteredPoint(frame: number, x: number, y: number): { x: number; y: number } {
    const fit = trollCastCalibration("cast", frame);
    if (!fit) return { x, y };
    const [a, b] = fit.matrix;
    const weight = 1 - smooth(820, 910, y);
    return {
        x: x + weight * ((a[0] - 1) * x + a[1] * y + a[2]),
        y: y + weight * (b[0] * x + (b[1] - 1) * y + b[2]),
    };
}
const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
    vec2 p = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    p.x = p.x * 2.0 / uOutputTexture.x - 1.0;
    p.y = p.y * 2.0 * uOutputTexture.z / uOutputTexture.y - uOutputTexture.z;
    gl_Position = vec4(p,0.0,1.0);
    vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
}`;
const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform mat3 uBodyMatrix;
uniform mat3 uInputMatrix;
uniform vec3 uFitX;
uniform vec3 uFitY;
uniform vec3 uSkinGain;
uniform vec3 uSkinOffset;
uniform vec3 uLeatherGain;
uniform vec3 uLeatherOffset;
uniform vec3 uClothGain;
uniform vec3 uClothOffset;
void main() {
    vec2 target = (uBodyMatrix * vec3(vTextureCoord,1.0)).xy * 1152.0;
    vec2 p = target;
    // Invert the small, smooth registration field; displacement tapers to zero at both soles.
    for (int i=0;i<5;i++) {
        vec2 delta = vec2(dot(uFitX,vec3(p,1.0)),dot(uFitY,vec3(p,1.0))) - p;
        p = target - (1.0-smoothstep(820.0,910.0,p.y))*delta;
    }
    vec2 uv = (uInputMatrix * vec3(p/1152.0,1.0)).xy;
    vec4 pixel = texture(uTexture,uv);
    vec3 rgb = pixel.rgb * 255.0 / max(pixel.a,0.00001);
    float warm = smoothstep(8.0,22.0,rgb.r-rgb.g)*smoothstep(1.12,1.28,rgb.r/(rgb.g+1.0));
    vec3 color = mix(rgb*uSkinGain+uSkinOffset,rgb*uLeatherGain+uLeatherOffset,warm);
    float cloth = (1.0-smoothstep(580.0,640.0,p.x))*smoothstep(550.0,600.0,p.y)
        *(1.0-smoothstep(735.0,805.0,p.y))*warm;
    color = mix(color,rgb*uClothGain+uClothOffset,cloth);
    finalColor = vec4(clamp(color/255.0,0.0,1.0)*pixel.a,pixel.a);
}`;
class TrollCastMatchFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 8,
            resources: {
                calibration: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    ...Object.fromEntries(
                        [
                            "FitX",
                            "FitY",
                            "SkinGain",
                            "SkinOffset",
                            "LeatherGain",
                            "LeatherOffset",
                            "ClothGain",
                            "ClothOffset",
                        ].map((name) => [`u${name}`, { value: new Float32Array(3), type: "vec3<f32>" }]),
                    ),
                },
            },
        });
    }
    public update(frame: number): void {
        const data = trollCastCalibration("cast", frame)!;
        const u = this.resources.calibration.uniforms;
        u.uFitX.set(data.matrix[0]);
        u.uFitY.set(data.matrix[1]);
        for (const [material, label] of [
            ["skin", "Skin"],
            ["leather", "Leather"],
            ["cloth", "Cloth"],
        ] as const) {
            u[`u${label}Gain`].set(data[material].gain);
            u[`u${label}Offset`].set(data[material].offset);
        }
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.calibration.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, TrollCastMatchFilter>();
export function syncTrollLabCastMatch(sprite: Sprite, state: string | undefined, frame: number): void {
    const enabled = !!trollCastCalibration(state, frame);
    let filter = filters.get(sprite);
    if (!filter && enabled) {
        filter = new TrollCastMatchFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (enabled) filter.update(frame);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === enabled) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = enabled ? [filter, ...remaining] : remaining.length ? remaining : null;
}
