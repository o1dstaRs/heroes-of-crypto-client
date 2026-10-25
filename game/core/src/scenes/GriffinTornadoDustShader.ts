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

// Separate detail layer: the approved wind material and silhouette remain untouched.
// Fixed-cost GPU particles need neither per-frame geometry uploads nor spawned display objects.
const fragment = /* glsl */ `#version 300 es
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uTime;
float hash(vec2 p){
    vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
    q+=dot(q,q.yzx+33.33);
    return fract((q.x+q.y)*q.z);
}
void main(){
    float h=vUV.y;
    float edge=smoothstep(.12,.28,h)*(1.-smoothstep(.84,.98,h));
    float nearSide=.5-.5*sin(vUV.x*6.2831853);
    vec4 result=vec4(0.);
    // Three speeds/depths prevent a uniform sheet of glitter. All travel clockwise.
    for(int layer=0;layer<3;layer++){
        float z=float(layer);
        float rows=13.+z*3.;
        vec2 uv=vec2(fract(vUV.x+uTime*(.18+z*.018)+h*.31+z*.27)*24.,
            h*rows-uTime*(.16+z*.045));
        vec2 cell=floor(uv);
        vec2 key=vec2(mod(cell.x,24.),cell.y)+z*67.;
        float seed=hash(key);
        vec2 offset=vec2(seed,hash(key+19.))*.6+.2;
        vec2 p=fract(uv)-offset;
        // Size in screen pixels keeps individual grains visible at normal board zoom.
        vec2 pixel=p/max(fwidth(vec2(vUV.x*24.,h*rows)),vec2(.001));
        float size=mix(1.15,2.2,hash(key+37.))/(1.+z*.12);
        float grain=1.-smoothstep(size*.35,size+.55,length(pixel));
        float halo=exp(-dot(pixel,pixel)/(size*size*3.))*.10;
        // A short, very soft motion streak follows the tangential wind direction.
        vec2 streak=pixel/vec2(size*2.4,size*.65);
        float trail=exp(-dot(streak,streak))*.23;
        float life=pow(sin(fract(uTime*.10+seed)*3.14159),2.);
        float sparse=smoothstep(.72,.82,hash(key+53.));
        float alpha=min(.95,(grain+halo+trail)*life*edge*sparse*mix(.90,1.35,nearSide)/(1.+z*.20));
        vec3 color=mix(vec3(.48,.37,.23),vec3(.97,.86,.65),seed);
        // Restrained reflected highlights, not emissive sparks.
        color+=vec3(.10,.09,.06)*smoothstep(.65,.95,seed)*nearSide;
        result.rgb+=(1.-result.a)*color*alpha;
        result.a+=(1.-result.a)*alpha;
    }
    // Sparse broad powder puffs connect the tiny grains to the existing wind.
    vec2 uv=vec2(fract(vUV.x+uTime*.195+h*.18)*8.,h*4.-uTime*.07);
    vec2 key=vec2(mod(floor(uv.x),8.),floor(uv.y));
    float seed=hash(key+91.);
    vec2 p=fract(uv)-vec2(.25+seed*.5,.5);
    float puff=exp(-dot(p/vec2(.33,.25),p/vec2(.33,.25)));
    float envelope=pow(sin(fract(uTime*.055+seed)*3.14159),2.);
    float alpha=puff*envelope*edge*.24*smoothstep(.38,.72,seed);
    vec3 powder=mix(vec3(.20,.19,.17),vec3(.62,.57,.47),nearSide);
    result.rgb+=(1.-result.a)*powder*alpha;
    result.a+=(1.-result.a)*alpha;
    finalColor=result*vColor;
}`;

export function createGriffinTornadoDustShader(): Shader {
    return new Shader({
        glProgram: GlProgram.from({ name: "griffin-tornado-dust", vertex, fragment }),
        resources: { storm: { uTime: { value: 0, type: "f32" } } },
    });
}
