import { GlProgram, Shader } from "pixi.js";

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
uniform float uTime;
const float TAU=6.28318530718;
float hash(float n){return fract(sin(n*127.1+17.3)*43758.5453);}
float segment(vec2 p,vec2 a,vec2 b){
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.));
}
float line(float distance,float width,float aa){
    return 1.-smoothstep(width,width+aa,distance);
}
void main(){
    vec2 p=(vUV-.5)*2.;
    float r=length(p);
    float a=atan(p.y,p.x);
    float aa=max(length(fwidth(p))*.65,.001);
    float edge=1.-smoothstep(.90,1.,r);
    vec3 orange=vec3(1.,.205,.012);
    vec3 amber=vec3(1.,.40,.035);
    vec3 gold=vec3(1.,.73,.30);

    // Broad translucent light bath. Slow continuous folds, never granular noise.
    float folds=.5+.5*sin(a*3.+r*9.-uTime*.45+sin(a*2.+uTime*.23));
    float veil=exp(-pow((r-.57)/.37,2.))*(.16+.11*folds);
    veil*=.38+.62*smoothstep(.13,.48,r);
    vec3 light=orange*veil;
    // A molten edge has a fine hot core, an amber shoulder and diffuse floor spill.
    float rim=abs(r-.852);
    light+=gold*line(rim,.0018,aa)*.64;
    light+=amber*exp(-rim/.012)*.24+orange*exp(-rim/.052)*.22;
    float arc=pow(max(0.,sin(a*4.+uTime*.28)),6.);
    light+=amber*line(abs(r-.898),.001,aa)*arc*.26;

    // Three long, tapered energy ribbons follow the rim, leaving the centre open.
    for(int i=0;i<3;i++){
        float n=float(i);
        float phase=a*2.-uTime*(.22+n*.035)+n*2.094;
        float lane=.62+n*.057+.035*sin(a*3.+uTime*.28+n*1.8);
        float envelope=pow(max(0.,sin(phase)),5.);
        float d=abs(r-lane);
        light+=amber*exp(-d/.019)*envelope*.18;
        light+=gold*line(d,.0008,aa)*envelope*.27;
    }

    // Eight sparse angular sigils echo the diamonds and forks of the sword blades.
    float sector=TAU/8.;
    float id=floor((a+sector*.5)/sector);
    float local=a-id*sector;
    vec2 q=vec2(sin(local)*r,cos(local)*r-.785);
    float rune=segment(q,vec2(0.,-.034),vec2(.018,0.));
    rune=min(rune,segment(q,vec2(.018,0.),vec2(0.,.034)));
    rune=min(rune,segment(q,vec2(0.,.034),vec2(-.018,0.)));
    rune=min(rune,segment(q,vec2(-.018,0.),vec2(0.,-.034)));
    rune=min(rune,segment(q,vec2(0.,-.049),vec2(0.,-.026)));
    rune=min(rune,segment(q,vec2(0.,.026),vec2(0.,.049)));
    float runePulse=.72+.18*sin(uTime*.8+id*1.7);
    light+=gold*line(rune,.0014,aa)*runePulse*.72;
    light+=orange*exp(-rune/.012)*.13;

    // Sparse embers drift outwards; analytic lifetimes avoid particle allocations.
    for(int i=0;i<16;i++){
        float seed=float(i)+1.;
        float cycle=uTime*(.09+hash(seed)*.055)+hash(seed+32.);
        float life=fract(cycle);
        float theta=seed*2.39996+uTime*.035;
        float radius=.42+hash(seed+7.)*.29+life*.18;
        vec2 at=vec2(cos(theta),sin(theta))*radius;
        vec2 d=p-at;
        float size=max(.0025,aa*.75);
        float pulse=pow(sin(life*3.14159265),2.);
        float mote=exp(-dot(d,d)/(size*size));
        float halo=exp(-dot(d,d)/.00035);
        light+=(gold*mote*.65+orange*halo*.08)*pulse;
    }
    light*=edge;
    finalColor=vec4(light,clamp(max(light.r,max(light.g,light.b)),0.,1.))*vColor;
}`;

/** Procedural floor light: one mesh, no artwork samples, filters or offscreen passes. */
export function createCrusaderFloorAuraShader(): Shader {
    return new Shader({
        glProgram: GlProgram.from({ name: "crusader-amber-floor-light", vertex, fragment }),
        resources: { aura: { uTime: { value: 0, type: "f32" } } },
    });
}
