import { Filter, GlProgram, Matrix, Sprite } from "pixi.js";
import { CANNON_WAKE_SCALE } from "./TsarCannonImpact";
import { CANNON_GAS_GLSL } from "./TsarCannonEngineVfx";

const vertex = `
in vec2 aPosition;out vec2 vInputUv;out vec2 vBodyUv;
uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;uniform mat3 uBodyMatrix;
void main(){
 vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
 p.x=p.x*2./uOutputTexture.x-1.;p.y=p.y*2.*uOutputTexture.z/uOutputTexture.y-uOutputTexture.z;
 gl_Position=vec4(p,0.,1.);vInputUv=aPosition*uOutputFrame.zw*uInputSize.zw;
 vBodyUv=(uBodyMatrix*vec3(vInputUv,1.)).xy;
}`;

// Preserve native material contrast: the previous per-channel histogram flattened
// shadows and highlights into orange midtones. These gains keep worn edges bright.
export const CANNON_BRONZE_GAIN = [0.92, 0.82, 0.72] as const;

const palettes = new WeakMap<Sprite, Filter>();
const settledDeath = new WeakMap<Sprite, { source: Sprite["texture"]["source"]; progress: number }>();
/** One material correction after barrel rotation and stopped-wheel replacement, in every state. */
export function syncCannonMaterial(sprite: Sprite, deathProgress?: number): void {
    if (deathProgress !== undefined)
        settledDeath.set(sprite, { source: sprite.texture.source, progress: deathProgress });
    else if (settledDeath.get(sprite)?.source !== sprite.texture.source) settledDeath.delete(sprite);
    const tilt = Math.min(1, (deathProgress ?? settledDeath.get(sprite)?.progress ?? 0) / 0.7);
    let filter = palettes.get(sprite);
    if (!filter) {
        filter = new Filter({
            glProgram: GlProgram.from({
                vertex,
                fragment: `
precision highp float;in vec2 vInputUv;in vec2 vBodyUv;out vec4 finalColor;
uniform sampler2D uTexture;uniform vec3 uPose;
void main(){
 vec4 pixel=texture(uTexture,vInputUv);
 vec3 rgb=pixel.rgb/max(pixel.a,.00001);
 vec2 p=vBodyUv*uPose.x-vec2(uPose.y);
 // Follow the lower edge of the falling barrel; keep its approved bronze intact.
 float chassis=smoothstep(410.+uPose.z*.35*p.x,434.+uPose.z*.35*p.x,p.y);
 float brightness=max(rgb.r,max(rgb.g,rgb.b));
 float glint=1.+.18*smoothstep(.30,.75,brightness);
 vec3 approved=clamp(rgb*vec3(${CANNON_BRONZE_GAIN.join(",")})*glint,0.,1.);
 vec3 graded=mix(rgb,approved,chassis);
 finalColor=vec4(graded*pixel.a,pixel.a);
}`,
            }),
            resolution: 2,
            antialias: "inherit",
            resources: {
                material: {
                    uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uPose: { value: new Float32Array(3), type: "vec3<f32>" },
                },
            },
        });
        const owned = filter;
        filter.apply = (...args: Parameters<Filter["apply"]>) => {
            args[0].calculateSpriteMatrix(owned.resources.material.uniforms.uBodyMatrix, sprite);
            Filter.prototype.apply.call(owned, ...args);
        };
        palettes.set(sprite, filter);
        sprite.once("destroyed", () => {
            owned.destroy();
            palettes.delete(sprite);
            settledDeath.delete(sprite);
        });
    }
    const width = sprite.texture.width;
    filter.resources.material.uniforms.uPose.set([width, width === 1024 ? 128 : 0, tilt]);
    // A newly attached action filter must run before this shared material pass.
    const current = sprite.filters ?? [];
    if (current[current.length - 1] !== filter) sprite.filters = [...current.filter((f) => f !== filter), filter];
}

const wakes = new WeakMap<Sprite, Filter>();
export function updateCannonEngineWake(sprite: Sprite, elapsedMs: number): void {
    const filter = wakes.get(sprite);
    if (filter) filter.resources.wake.uniforms.uTime = Math.max(0, elapsedMs) / 1000;
}

/** Keep the approved iron sphere; render hot turbulent powder gases continuously on the GPU. */
export function attachCannonEngineWake(sprite: Sprite): void {
    const filter = new Filter({
        glProgram: GlProgram.from({
            vertex,
            fragment: `
precision highp float;in vec2 vInputUv;in vec2 vBodyUv;out vec4 finalColor;
uniform sampler2D uArt;uniform vec4 uFrame;uniform float uWakeScale;uniform float uTime;
${CANNON_GAS_GLSL}
vec4 art(vec2 p){
 if(p.x<0.||p.y<0.||p.x>=320.||p.y>=320.)return vec4(0.);
 return texture(uArt,uFrame.xy+(p/320.)*uFrame.zw);
}
void main(){
 vec2 p=vBodyUv*320.;
 float radius=distance(p,vec2(257.,145.));
 if(radius<45.){finalColor=art(p)*(1.-smoothstep(43.5,45.,radius));return;}
 vec2 q=vec2(213.-p.x,p.y-145.)/uWakeScale;
 vec4 plume=vec4(0.);
 for(int i=0;i<8;i++){
  float id=floor(uTime/.055)-float(i);
  float age=uTime-id*.055;
  float seed=hash(vec3(id,3.,8.));
  vec2 c=vec2(age*420.,sin(age*12.+seed*6.283)*age*28.);
  float r=12.+age*93.;
  vec4 cloud=gas((q-c)/vec2(r*1.35,r),seed*9.,age,exp(-age*14.)*.58);
  cloud*=smoothstep(0.,.025,age)*(1.-smoothstep(.20,.44,age))*.64;
  plume=over(cloud,plume);
 }
 // Sparse glowing grains are dragged back through the gases, never a solid beam.
 for(int i=0;i<7;i++){
  float id=float(i),a=fract(uTime*2.9+id*.143),seed=hash(vec3(id,6.,11.));
  vec2 c=vec2(a*160.,(seed-.5)*a*44.);
  float dist=segment(q,c,c-vec2(4.+seed*9.,seed-0.5));
  float glow=exp(-dist*dist/2.5)*(1.-a)*.75;
  plume=over(vec4(vec3(1.,.50,.10)*glow,glow),plume);
 }
 plume*=smoothstep(-8.,0.,q.x)*(1.-smoothstep(165.,190.,q.x))*smoothstep(0.,.055,uTime);
 finalColor=plume;
}`,
        }),
        resolution: 2,
        antialias: "inherit",
        resources: {
            uArt: sprite.texture.source,
            wake: {
                uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                uFrame: { value: new Float32Array(4), type: "vec4<f32>" },
                uWakeScale: { value: CANNON_WAKE_SCALE, type: "f32" },
                uTime: { value: 0, type: "f32" },
            },
        },
    });
    filter.apply = (...args: Parameters<Filter["apply"]>) => {
        args[0].calculateSpriteMatrix(filter.resources.wake.uniforms.uBodyMatrix, sprite);
        const t = sprite.texture;
        filter.resources.wake.uniforms.uFrame.set([
            t.frame.x / t.source.width,
            t.frame.y / t.source.height,
            t.width / t.source.width,
            t.height / t.source.height,
        ]);
        Filter.prototype.apply.call(filter, ...args);
    };
    sprite.filters = [...(sprite.filters ?? []), filter];
    wakes.set(sprite, filter);
    sprite.once("destroyed", () => {
        filter.destroy();
        wakes.delete(sprite);
    });
}
