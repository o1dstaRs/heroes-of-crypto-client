import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { griffinFeatherAgeMs } from "./GriffinLabIdle";

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
uniform float uFeatherAge;
vec4 feather(vec2 p, float number) {
    float t = uFeatherAge - number*0.085;
    if (t<0.0 || t>1.35) return vec4(0.0);
    vec2 origin = vec2(480.0,302.0);
    vec2 drift = vec2((-105.0-125.0*number)*t + 10.0*sin(7.0*t+number)*t,
        (-145.0-115.0*number)*t+100.0*t*t);
    vec2 q = p-origin-drift;
    float angle = -0.55+number*1.1+1.8*t+0.35*sin(t*8.0+number);
    q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*q;
    float lengthPx = 14.0-2.0*number;
    float along = q.y/lengthPx;
    float widthPx = 4.8*max(0.0,1.0-along*along)*(0.86+0.14*sin(q.y*3.5));
    float vane = (1.0-smoothstep(widthPx-0.5,widthPx+0.6,abs(q.x)))
        *(1.0-smoothstep(0.93,1.0,abs(along)));
    float shaft = (1.0-smoothstep(0.3,0.9,abs(q.x)))*(1.0-smoothstep(0.90,1.10,abs(along)));
    float alpha=max(vane,shaft)*smoothstep(0.0,0.08,t)*(1.0-smoothstep(0.9,1.35,t));
    vec3 bronze=vec3(0.74,0.60,0.39);
    vec3 ivory=vec3(0.89,0.82,0.66);
    vec3 color=mix(bronze,ivory,number*0.65+shaft*0.3);
    return vec4(color*alpha,alpha);
}
void main() {
    vec2 destination=vBodyCoord*768.0;
    vec2 uv=(uInputMatrix*vec3(vBodyCoord,1.0)).xy;
    vec4 color=texture(uTexture,clamp(uv,uInputClamp.xy,uInputClamp.zw));
    for(int i=0;i<2;i++) {
        vec4 plume=feather(destination,float(i));
        color=plume+color*(1.0-plume.a);
    }
    finalColor=color;
}`;

class GriffinFeatherFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 12,
            resources: {
                idle: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uFeatherAge: { value: -1, type: "f32" },
                },
            },
        });
    }
    public update(elapsedMs: number): void {
        this.resources.idle.uniforms.uFeatherAge = griffinFeatherAgeMs(elapsedMs) / 1000;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.idle.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
        super.apply(...args);
    }
}
const filters = new WeakMap<Sprite, GriffinFeatherFilter>();

export function syncGriffinLabIdle(sprite: Sprite, enabled: boolean, _nowMs: number, elapsedMs: number): void {
    const active = enabled && griffinFeatherAgeMs(elapsedMs) >= 0;
    let filter = filters.get(sprite);
    if (active && !filter) {
        filter = new GriffinFeatherFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => owned.destroy());
    }
    if (!filter) return;
    if (active) filter.update(elapsedMs);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === active) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = active ? [...remaining, filter] : remaining.length ? remaining : null;
}
