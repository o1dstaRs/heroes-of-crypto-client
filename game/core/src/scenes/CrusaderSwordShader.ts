import { GlProgram, Shader, type Texture } from "pixi.js";
import { CRUSADER_SWORD_VARIANT_OFFSET_PX } from "./CrusaderAuraSwords";

// Extra transparent sampling space only: never alter the sword's size or hilt registration.
export const CRUSADER_SWORD_GLOW_PADDING = 40;

const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec4 uColor;
void main(){
    vUV=aUV;
    vColor=uColor*uWorldColorAlpha;
    gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);
}`;

const fragment = /* glsl */ `#version 300 es
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform sampler2D uSword;
uniform float uTime;
uniform float uStraightAlpha;
const vec2 texel=vec2(1./2508.,1./1254.);
float silhouette(vec2 offset){
    return texture(uSword,vUV+offset*texel).a;
}
float hash(float n){ return fract(sin(n*127.1)*43758.5453); }
void main(){
    vec4 projection=texture(uSword,vUV);
    projection.rgb*=mix(1.,projection.a,uStraightAlpha);
    vec2 p=(vUV-vec2(.75,0.))*vec2(2508.,1254.);
    // Local coordinates for either cutout, with disjoint padded UV rectangles.
    p.x-=step(${(CRUSADER_SWORD_VARIANT_OFFSET_PX / 2).toFixed(1)},p.x)*${CRUSADER_SWORD_VARIANT_OFFSET_PX.toFixed(1)};
    // Three radii soften the actual silhouette, including the curled guard and pommel.
    // The source contains light filaments and runes, with a translucent interior.
    float closeHalo=0., middleHalo=0., farHalo=0.;
    for(int i=0;i<8;i++){
        float a=(float(i)+.5)*.785398163;
        vec2 d=vec2(cos(a),sin(a));
        closeHalo+=silhouette(d*3.);
        middleHalo+=silhouette(d*11.);
        farHalo+=silhouette(d*27.);
    }
    closeHalo*=.125;
    middleHalo*=.125;
    farHalo*=.125;
    float flicker=1.+.045*sin(uTime*3.7)+.025*sin(uTime*8.3+1.2);
    vec3 amber=vec3(1.,.27,.025);
    vec3 gold=vec3(1.,.66,.22);
    vec3 glow=(gold*closeHalo*.65+amber*middleHalo*.45+amber*farHalo*.18)*flicker;
    // Bright runes stay stable while the softer filaments carry a slow light flow.
    // Only radiance changes: the sword silhouette and radial position remain fixed.
    float core=smoothstep(.45,.9,projection.a);
    float flow=1.+.14*sin(p.y*.035-uTime*1.7+p.x*.045)*(1.-core);
    vec3 body=projection.rgb*flow*flicker;
    // A warm light pulse travels through the existing rune strokes without adding metal.
    float sweep=mod(uTime*.13,1.6)*670.-100.;
    float glint=exp(-pow((p.y+p.x*.32-sweep)/15.,2.));
    body+=gold*glint*projection.a*.18;
    // A bounded set of short-lived motes drifts off the blade; no emitter allocations.
    vec3 sparks=vec3(0.);
    float sparkRadius=max(1.5,length(fwidth(p))*.45);
    for(int i=0;i<7;i++){
        float seed=float(i)+1.;
        float cycle=uTime*(.19+hash(seed)*.08)+hash(seed+9.);
        float age=fract(cycle);
        float side=mod(seed,2.)*2.-1.;
        vec2 origin=vec2(side*(25.+hash(seed+2.)*12.),135.+hash(seed+3.)*280.);
        vec2 at=origin+vec2(side*age*24.,-age*34.);
        vec2 delta=p-at;
        float life=sin(age*3.14159265);
        life*=life*(.45+.55*hash(floor(cycle)+seed));
        float core=exp(-dot(delta,delta)/(sparkRadius*sparkRadius));
        float haze=exp(-dot(delta,delta)/(sparkRadius*sparkRadius*6.))*.14;
        sparks+=(gold*core+amber*haze)*life*.65;
    }
    // Additive projected light keeps the battlefield visible through the sword.
    // Keep geometry padding invisible at its edges, including any far-halo samples.
    float fade=smoothstep(470.,494.,p.x+627.)*(1.-smoothstep(760.,784.,p.x+627.))
              *smoothstep(34.,58.,p.y)*(1.-smoothstep(631.,655.,p.y));
    vec3 emitted=(glow*(1.-projection.a)+sparks)*fade;
    float glowAlpha=clamp(max(emitted.r,max(emitted.g,emitted.b))*.65,0.,.8);
    finalColor=vec4(body+emitted,projection.a+(1.-projection.a)*glowAlpha)*vColor;
}`;

/** One shader/mesh for all four blades; no filters, offscreen passes or particle containers. */
export function createCrusaderSwordShader(texture: Texture): Shader {
    return new Shader({
        glProgram: GlProgram.from({
            name: "crusader-runic-light-projection",
            vertex,
            fragment,
            preferredFragmentPrecision: "highp",
        }),
        resources: {
            uSword: texture.source,
            uSwordSampler: texture.source.style,
            glow: {
                uTime: { value: 0, type: "f32" },
                uStraightAlpha: { value: texture.source.alphaMode === "no-premultiply-alpha" ? 1 : 0, type: "f32" },
            },
        },
    });
}
