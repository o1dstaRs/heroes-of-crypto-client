import { GlProgram, Shader } from "pixi.js";

const vertex = `#version 300 es
in vec2 aPosition; in vec2 aUV;
out vec2 vUV; out vec4 vColor;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
uniform vec4 uWorldColorAlpha, uColor;
void main(){vUV=aUV;vColor=uColor*uWorldColorAlpha;gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);}`;

export const wyvernPoisonCommonMaterial = `
float wyvernHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float wyvernNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wyvernHash(i),wyvernHash(i+vec2(1,0)),f.x),mix(wyvernHash(i+vec2(0,1)),wyvernHash(i+vec2(1,1)),f.x),f.y);}
float wyvernFog(vec2 p){float v=0.,a=.55;for(int i=0;i<4;i++){v+=a*wyvernNoise(p);p=mat2(vec2(.8,.6),vec2(-.6,.8))*p*2.03+7.13;a*=.48;}return v;}
`;
export const wyvernFloorMaterial = `
vec4 wyvernFloorColor(vec2 vUV, float uTime, vec4 uSource){
    vec2 p = (vUV - .5) * 2.;
    if (max(abs(p.x), abs(p.y)) >= 1.2) { return vec4(0.); }

    vec2 flow = p * vec2(4.6, 7.1) - vec2(.38, .10) * uTime;
    vec2 bend = vec2(wyvernFog(flow * .52), wyvernFog(flow * .52 + vec2(7., uTime * .09))) - .5;
    vec2 q = flow + bend * 1.45;
    float bank = smoothstep(.28, .72, wyvernFog(q));
    float strands = smoothstep(.44, .73, wyvernFog(q * vec2(.72, 1.45) + vec2(5., uTime * .11)));
    // Round the footprint, then let broad drifting lobes break up the edge.
    vec2 silhouette = p + bend * .14;
    vec2 squared = silhouette * silhouette;
    float radius = sqrt(sqrt(dot(squared, squared)));
    float billows = wyvernNoise(p * vec2(4., 5.3) + bend * .6 - vec2(.15, .08) * uTime);
    float reach = .99 + .27 * (billows - .5);
    float fringe = 1. - smoothstep(reach - .23, reach, radius);

    vec2 source = (p - uSource.xy) / uSource.zw;
    float pooledMist = exp(-dot(source, source) * .64);
    float a = fringe * (.024 + .34 * bank + .14 * bank * strands + .065 * pooledMist);
    vec3 col = mix(vec3(.19, .27, .17), vec3(.50, .68, .42), .84 * bank + .16 * strands);
    return vec4(col * a, a);
}`;
export const wyvernAirMaterial = `
float wyvernHash3(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float wyvernNoise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(wyvernHash3(i),wyvernHash3(i+vec3(1,0,0)),f.x),mix(wyvernHash3(i+vec3(0,1,0)),wyvernHash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(wyvernHash3(i+vec3(0,0,1)),wyvernHash3(i+vec3(1,0,1)),f.x),mix(wyvernHash3(i+vec3(0,1,1)),wyvernHash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float wyvernCloud(vec3 p){float n=.57*wyvernNoise3(p);p=p*2.03+7.1;n+=.28*wyvernNoise3(p);p=p*2.03+3.7;return n+.14*wyvernNoise3(p);}
float wyvernDensity(vec3 p, float uTime, float uSeed) {
    float h = p.y;
    p.x -= .22 * h + .15 * sin(h * 3.6 - uTime * .46 + uSeed);
    p.z += .12 * sin(h * 3.4 - uTime * .32 + uSeed);
    float width = .40 + .13 * h;
    float envelope = exp(-dot(p.xz, p.xz) / (width * width));
    envelope *= smoothstep(0., .17, h) * (1. - smoothstep(.42, .96, h));
    vec3 q = p * vec3(3.8, 3.4, 3.8) + vec3(uSeed - uTime * .34, -uTime * .15, uSeed * .35);
    float curl = wyvernCloud(q * .65) - .5;
    return smoothstep(.29, .69, wyvernCloud(q + vec3(curl, -curl * .6, curl))) * envelope;
}
vec4 wyvernAirColor(vec2 vUV, float uTime, float uSeed, float uVent){
    vec2 p = vec2((vUV.x - .5) * 2., vUV.y);
    if (abs(p.x) >= .96) { return vec4(0.); }

    vec3 radiance = vec3(0.);
    float transmittance = 1.;
    for (int i = 0; i < 8; i++) {
        float z = -.56 + (float(i) + .5) * .14;
        vec3 q = vec3(p.x, p.y + z * .20, z);
        float a = 1. - exp(-wyvernDensity(q, uTime, uSeed) * (.34 + .08 * uVent));
        float light = exp(-wyvernDensity(q + vec3(-.17, .15, -.12), uTime, uSeed) * 1.9);
        vec3 col = mix(vec3(.19, .26, .16), vec3(.50, .66, .41), light);
        radiance += transmittance * a * col;
        transmittance *= 1. - a;
    }

    // Fade the billboard edges where a slanted ray could still sample fog.
    float edge = smoothstep(0., .18, p.y) * (1. - smoothstep(.70, .98, p.y));
    edge *= 1. - smoothstep(.61, .96, abs(p.x));
    return vec4(radiance, 1. - transmittance) * edge;
}`;
export const wyvernTrailMaterial = `
vec4 wyvernTrailColor(vec2 vUV, float uTime, float uSeed){
    float age = uTime;
    vec2 p = (vUV - .5) * 2. - vec2(.09, .04) * age;
    float bank = smoothstep(.31, .69, wyvernFog(p * vec2(3.9, 5.4) + vec2(uSeed, -age * .18)));
    float fringe = 1. - smoothstep(.25, .81, length(p));
    float fade = smoothstep(0., .22, age) * (1. - smoothstep(.43, 1.8, age));
    float a = fringe * fade * (.035 + .16 * bank);
    vec3 col = mix(vec3(.20, .26, .17), vec3(.45, .60, .37), bank);
    return vec4(col * a, a);
}`;

function fragment(material: string, color: string): string {
    return `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vColor; out vec4 finalColor;
uniform float uTime, uSeed, uVent;
uniform vec4 uSource;
${wyvernPoisonCommonMaterial}
${material}
void main(){finalColor=${color}*vColor;}`;
}

const floor = fragment(wyvernFloorMaterial, "wyvernFloorColor(vUV,uTime,uSource)");
const air = fragment(wyvernAirMaterial, "wyvernAirColor(vUV,uTime,uSeed,uVent)");
const trail = fragment(wyvernTrailMaterial, "wyvernTrailColor(vUV,uTime,uSeed)");

/** Local premultiplied-alpha VFX; no shared textures or full-screen filters. */
export function createWyvernPoisonShader(kind: "floor" | "air" | "trail", seed = 0) {
    return new Shader({
        glProgram: GlProgram.from({
            name: `wyvern-poison-${kind}`,
            vertex,
            fragment: kind === "floor" ? floor : kind === "air" ? air : trail,
        }),
        resources: {
            poison: {
                uTime: { value: 6.4, type: "f32" },
                uSeed: { value: seed, type: "f32" },
                uSource: { value: new Float32Array([0.1, -0.02, 1 / 3, 0.4]), type: "vec4<f32>" },
                uVent: { value: 0, type: "f32" },
            },
        },
    });
}
