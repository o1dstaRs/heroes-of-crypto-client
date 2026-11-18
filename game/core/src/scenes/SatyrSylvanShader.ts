import { GlProgram, Shader } from "pixi.js";

const vertex = `#version 300 es
in vec2 aPosition; in vec2 aUV;
out vec2 vUV; out vec4 vColor;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
uniform vec4 uWorldColorAlpha, uColor;
void main(){
 vUV=aUV;vColor=uColor*uWorldColorAlpha;
 gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);
}`;

const common = `
precision highp float;
in vec2 vUV; in vec4 vColor; out vec4 finalColor;
uniform float uTime;
const float PI=3.14159265359;
const float TAU=6.28318530718;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float field(vec2 p){return .64*noise(p)+.25*noise(p*2.03+7.3)+.11*noise(p*4.13+13.1);}
float glow(float d,float width){return exp(-d*d/(width*width));}
mat2 rotate(float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c);}
vec3 emerald=vec3(.045,.72,.28), jade=vec3(.12,1.,.53), mint=vec3(.68,1.,.76);
`;

const floor = `#version 300 es
${common}
void main(){
 vec2 p=(vUV-.5)*2.;float r=length(p),t=uTime;
 // A transparent centre and softly clipped outskirts keep the figure and tiles readable.
 float edge=1.-smoothstep(.84,1.,r);
 if(edge<=0.){finalColor=vec4(0);return;}
 vec2 flowing=rotate(t*.075)*p;
 vec2 warp=vec2(field(flowing*3.8+vec2(t*.12,0.)),field(flowing*3.8+vec2(8.,-t*.1)))-.5;
 vec2 q=p+warp*.10;
 float a=atan(q.y,q.x),rr=length(q),aa=max(fwidth(rr),.003);
 float n=field(flowing*8.5+warp*2.-vec2(0.,t*.20));
 float breath=.92+.08*sin(t*.8);
 // Two travelling, braided filaments. Distortion lives in the magic, not in range geometry.
 float ring=.69+.046*sin(a*3.-t*.65)+.020*sin(a*7.+t*.31);
 float d=rr-ring;
 float flow=.40+.60*pow(.5+.5*sin(a*3.-t*1.05+rr*7.),2.);
 float thread=glow(d,max(.009,aa*.7))*flow;
 float bloom=glow(d,.043)*flow;
 float twin=glow(rr-ring-.048*sin(a*4.+t*.53),max(.005,aa*.65))*.30;
 float inner=glow(rr-.40-.04*sin(a*2.+t*.45),max(.007,aa*.7));
 inner*=pow(max(0.,sin(a*3.+t*.65)),4.);
 float spiral=pow(max(0.,sin(a*3.-rr*13.+t*.85+n*2.)),12.);
 spiral*=smoothstep(.22,.40,rr)*(1.-smoothstep(.70,.91,rr));
 // Low-frequency emerald haze is subordinate to the brighter mint edges.
 float mist=glow(rr-.57,.26)*smoothstep(.22,.74,n)*.20;
 float pool=exp(-r*r*8.)*.075;
 float wave=pow(.5+.5*sin(rr*23.-t*1.35+warp.y*2.),10.);
 wave*=smoothstep(.20,.48,rr)*(1.-smoothstep(.66,.91,rr))*.13;
 // Broken outer constellations: broad enough to survive the normal distant board view.
 float ticks=glow(rr-.85,max(.007,aa*.65))*pow(max(0.,cos(a*24.+t*.18)),14.)*.28;
 vec3 light=emerald*(mist+bloom*.46+pool+spiral*.20)+jade*(thread*.72+twin*.28+inner*.34+wave);
 light+=mint*(thread*.22+ticks);
 // Energy travels from the source across the entire field, rather than only along its edge.
 float radialMask=smoothstep(.10,.22,rr)*(1.-smoothstep(.78,.96,rr));
 float roots=pow(max(0.,cos(a*5.+rr*10.-t*.38+warp.x*3.)),22.);
 float rootPulse=.22+.78*pow(.5+.5*sin(rr*20.-t*2.2),4.);
 light+=jade*roots*rootPulse*radialMask*.28;
 float wavePhase=fract(t*.22), waveRadius=.12+wavePhase*.80;
 float ripple=glow(rr-waveRadius,.014+aa)*sin(wavePhase*PI);
 float waveHalo=glow(rr-waveRadius,.065)*sin(wavePhase*PI);
 light+=(jade*ripple*.20+emerald*waveHalo*.12)*radialMask;
 // Slow caustic wash and a broad travelling arc connect the whole composition.
 float caustics=glow(sin(a*3.+rr*15.-t*.4+n*3.),.12)*radialMask;
 light+=emerald*caustics*.055;
 // Two counter-moving energy crests carry a bright head and a dissipating tail around the field.
 float crest=mod(a-t*.42+TAU*8.,TAU), counter=mod(-a-t*.31+2.+TAU*8.,TAU);
 light+=mint*glow(d,.017+min(crest,.8)*.022)*exp(-crest*2.9)*.48;
 light+=jade*glow(rr-ring+.035,.022+min(counter,.8)*.018)*exp(-counter*3.4)*.29;
 light*=edge*breath;
 finalColor=vec4(light,min(.65,dot(light,vec3(.2,.65,.15))))*vColor;
}`;

const veil = `#version 300 es
${common}
void main(){
 float a=vUV.x*TAU,h=vUV.y,t=uTime;
 // Periodic noise coordinates meet seamlessly at the back/front split.
 vec2 polar=vec2(cos(a),sin(a));
 float n=field(polar*3.+vec2(h*2.,-t*.16));
 float bent=.28+.12*sin(a*2.-t*.65)+.055*sin(a*5.+t*.48)+(n-.5)*.10;
 float d=h-bent;
 float aa=max(fwidth(h),.008);
 float stream=pow(.5+.5*sin(a*3.-t*.8+h*2.),2.);
 float core=glow(d,max(.012,aa*.7));
 float halo=glow(d,.085);
 float second=glow(h-bent-.15,max(.007,aa*.6))*.35;
 float silk=glow(d-.06,.15)*smoothstep(.32,.76,n)*.11;
 float edges=smoothstep(0.,.10,h)*(1.-smoothstep(.65,1.,h));
 vec3 light=(jade*core*.42+emerald*halo*.26+mint*second*.17+emerald*silk)*(.22+.78*stream)*edges;
 float curtain=pow(.5+.5*sin(a*19.+n*4.-t*.21),6.);
 curtain*=exp(-h*4.)*smoothstep(0.,.06,h)*(.5+.5*sin(a*4.+t*.22));
 light+=emerald*curtain*.12*edges;
 finalColor=vec4(light,min(.48,dot(light,vec3(.2,.65,.15))))*vColor;
}`;

const core = `#version 300 es
${common}
void main(){
 vec2 p=(vUV-.5)*2.;float r=length(p);
 // A smooth 4.8-second breath: only soft light under the hooves, with no drawn ornament.
 float breath=.5-.5*cos(uTime*TAU/4.8);
 float radius=.94+.08*breath;
 float rr=r/radius,edge=1.-smoothstep(.72,1.,r);
 float well=exp(-rr*rr*95.);
 float scatter=exp(-rr*rr*12.);
 float inner=exp(-rr*rr*32.);
 vec3 light=emerald*scatter*.28+jade*inner*.16+vec3(.79,1.,.66)*well*.68;
 light*=(.56+.44*breath)*edge;
 finalColor=vec4(light,min(.8,dot(light,vec3(.2,.65,.15))))*vColor;
}`;

/** Local analytic emission; no render-texture feedback, texture samples or fullscreen filter. */
export function createSatyrSylvanShader(kind: "floor" | "veil" | "core"): Shader {
    return new Shader({
        glProgram: GlProgram.from({
            name: `satyr-sylvan-${kind}`,
            vertex,
            fragment: kind === "floor" ? floor : kind === "core" ? core : veil,
        }),
        resources: { sylvan: { uTime: { value: 0, type: "f32" } } },
    });
}
