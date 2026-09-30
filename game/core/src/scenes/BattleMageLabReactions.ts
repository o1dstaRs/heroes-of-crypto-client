import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";

export const BATTLE_MAGE_REACTION_DURATION_MS = { hit: 520, death: 1450 } as const;
export type BattleMageReaction = keyof typeof BATTLE_MAGE_REACTION_DURATION_MS;

const smooth = (start: number, end: number, value: number): number => {
    const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
    return t * t * (3 - 2 * t);
};

const hitKeys = [
    [0, 0, 0],
    [55, -15, 4],
    [105, -31, 10],
    [180, -22, 8],
    [320, 5, -1],
    [520, 0, 0],
] as const;
const deathKeys = [
    [0, 0, 0],
    [110, -27, 7],
    [230, -13, 13],
    [460, 15, 45],
    [780, 32, 78],
    [1450, 32, 78],
] as const;

/** Source-space motion and visibility, independent of frame rate and team facing. */
export function battleMageReactionPose(state: BattleMageReaction, elapsedMs: number) {
    const time = Math.min(BATTLE_MAGE_REACTION_DURATION_MS[state], Math.max(0, elapsedMs || 0));
    const keys = state === "hit" ? hitKeys : deathKeys;
    let index = 1;
    while (index < keys.length - 1 && keys[index][0] < time) index++;
    const before = keys[index - 1],
        after = keys[index];
    const t = smooth(before[0], after[0], time);
    return {
        x: before[1] + (after[1] - before[1]) * t,
        y: before[2] + (after[2] - before[2]) * t,
        flash: state === "hit" ? smooth(0, 40, time) * (1 - smooth(40, 125, time)) : 0,
        dissolve: state === "death" ? smooth(330, 1210, time) : 0,
        emberAlpha: state === "death" ? 1 - smooth(1130, 1450, time) : 0,
        shadowAlpha: state === "death" ? 1 - smooth(420, 1200, time) : 1,
        fireAlpha: state === "death" ? 1 - smooth(90, 430, time) : 1,
        time: time / 1000,
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
    vec2 uv = aPosition * uOutputFrame.zw * uInputSize.zw;
    vBodyCoord = (uBodyMatrix * vec3(uv, 1.0)).xy;
}`;

const fragment = /* glsl */ `
in vec2 vBodyCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform mat3 uInputMatrix;
uniform vec4 uInputClamp;
uniform vec4 uMotion;
uniform vec4 uLife;
uniform float uTime;
uniform float uAlpha;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(cell), hash(cell+vec2(1,0)), f.x),
        mix(hash(cell+vec2(0,1)), hash(cell+vec2(1,1)), f.x), f.y);
}
vec4 sampleBody(vec2 p) {
    if (any(lessThan(p, vec2(0))) || any(greaterThan(p, vec2(768)))) return vec4(0);
    vec2 uv = (uInputMatrix * vec3(p / 768.0, 1.0)).xy;
    return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}
void main() {
    vec2 destination = vBodyCoord * 768.0;
    vec2 p = destination;
    // Invert the connected displacement; head and held book keep their shape.
    // Motion blends through the hips to zero above the planted boots.
    for (int i=0; i<5; i++) {
        float weight = 1.0-smoothstep(350.0, 650.0, p.y);
        p = destination-uMotion.xy*weight;
    }
    vec4 body = sampleBody(p);
    float flame = (1.0-smoothstep(254.0,275.0,p.y))
        * smoothstep(165.0,183.0,p.x)*(1.0-smoothstep(269.0,288.0,p.x));
    body *= mix(1.0, uLife.w, flame);
    body.rgb = mix(body.rgb, vec3(body.a,body.a*0.76,body.a*0.88), uMotion.z*0.32);
    if (uMotion.w < 0.5) { finalColor=body; return; }

    // A travelling dissolve consumes the figure into violet embers. Noise is
    // locked to the artwork, avoiding flickering holes while the body slumps.
    float field = p.y/768.0*0.7 + noise(p/17.0)*0.22 + noise(p/6.0)*0.08;
    float threshold = mix(-0.12,1.12,uLife.x);
    float remain = smoothstep(threshold-0.025,threshold+0.025,field);
    float rim = (1.0-smoothstep(0.018,0.065,abs(field-threshold)))
        * smoothstep(0.0,0.10,uLife.x)*(1.0-smoothstep(0.88,1.0,uLife.x));
    vec3 light = vec3(0.65,0.20,1.0)*rim*body.a*0.7;
    vec3 sparks = vec3(0);
    for (int i=0;i<24;i++) {
        float seed=float(i);
        vec2 origin=vec2(185.0+hash(vec2(seed,3.0))*350.0,
            100.0+hash(vec2(seed,8.0))*560.0);
        float age=(uTime-0.3-hash(vec2(seed,11.0))*0.68)/0.58;
        if(age>0.0 && age<1.0) {
            float sourceAlpha=sampleBody(origin).a;
            float drift=sin(seed*2.4+age*3.0);
            vec2 center=origin+vec2(drift*age*45.0,-age*105.0);
            vec2 q=(destination-center)/vec2(2.0,4.5);
            float glow=exp(-dot(q,q))*sin(age*3.14159265)*sourceAlpha;
            sparks+=vec3(0.82,0.43,1.0)*glow;
        }
    }
    float materialAlpha=body.a*remain;
    vec3 emission=(light+sparks*uLife.y)*uAlpha;
    float glowAlpha=clamp(max(max(emission.r,emission.g),emission.b),0.0,uAlpha);
    float alpha=materialAlpha+glowAlpha*(1.0-materialAlpha);
    finalColor=vec4(min(body.rgb*remain+emission,vec3(alpha)),alpha);
}`;

export class BattleMageReactionFilter extends Filter {
    public constructor(private readonly sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            antialias: "inherit",
            padding: 8,
            resources: {
                reaction: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uInputMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uMotion: { value: new Float32Array(4), type: "vec4<f32>" },
                    uLife: { value: new Float32Array(4), type: "vec4<f32>" },
                    uTime: { value: 0, type: "f32" },
                    uAlpha: { value: 1, type: "f32" },
                },
            },
        });
    }
    public update(state: BattleMageReaction, elapsedMs: number): void {
        const pose = battleMageReactionPose(state, elapsedMs);
        const u = this.resources.reaction.uniforms;
        u.uMotion.set([pose.x, pose.y, pose.flash, state === "death" ? 1 : 0]);
        u.uLife.set([pose.dissolve, pose.emberAlpha, pose.shadowAlpha, pose.fireAlpha]);
        u.uTime = pose.time;
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const u = this.resources.reaction.uniforms;
        args[0].calculateSpriteMatrix(u.uBodyMatrix, this.sprite);
        u.uInputMatrix.copyFrom(u.uBodyMatrix).invert();
        u.uAlpha = this.sprite.getGlobalAlpha();
        super.apply(...args);
    }
}

const filters = new WeakMap<Sprite, BattleMageReactionFilter>();
export function syncBattleMageLabReaction(
    sprite: Sprite,
    state: BattleMageReaction | undefined,
    elapsedMs: number,
): void {
    let filter = filters.get(sprite);
    if (state && !filter) {
        filter = new BattleMageReactionFilter(sprite);
        filters.set(sprite, filter);
        const owned = filter;
        sprite.once("destroyed", () => {
            owned.destroy();
            filters.delete(sprite);
        });
    }
    if (!filter) return;
    if (state) filter.update(state, elapsedMs);
    const installed = sprite.filters ?? [];
    if (installed.includes(filter) === !!state) return;
    const remaining = installed.filter((entry) => entry !== filter);
    sprite.filters = state ? [filter, ...remaining] : remaining.length ? remaining : null;
}
