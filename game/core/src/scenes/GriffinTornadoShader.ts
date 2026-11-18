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

// Both halves sample one continuous elliptical flow, including its lighting at the seams.
const fragment = /* glsl */ `#version 300 es
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uTime;
float hash(vec3 p){
    p=fract(p*.1031);
    p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
}
float noise(vec3 p){
    vec3 i=floor(p), f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
                   mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                   mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){
    return noise(p)*.56+noise(p*2.03+13.4)*.28+noise(p*4.11+31.7)*.16;
}
void main(){
    float angle=vUV.x*6.2831853;
    float h=vUV.y;
    // Positive sampling phase advects the material in negative world rotation (clockwise).
    float flow=angle+uTime*1.3-h*3.5;
    // Broad rolling volumes carry the silhouette even when the battlefield is zoomed out.
    vec3 field=vec3(cos(flow)*2.1,sin(flow)*2.1,h*3.2-uTime*.24);
    float broad=fbm(field);
    float detail=fbm(vec3(field.xy*2.3,h*17.+broad*2.-uTime*.55));
    float billow=smoothstep(.22,.76,broad);
    float wisps=smoothstep(.3,.73,detail);
    float fade=smoothstep(0.,.13,h)*(1.-smoothstep(.82,1.,h));
    float nearSide=.5-.5*sin(angle);
    float gust=.94+.06*sin(angle*2.+uTime*.85-h*4.);
    // A continuous translucent body replaces the disconnected sine-wave rings.
    float density=(.28+billow*.39+wisps*.18)*fade*gust;
    density*=mix(1.,.82,nearSide);
    float gradient=broad-fbm(field+vec3(-.24,.15,.2));
    float light=clamp(.49+.24*cos(angle+2.2)+gradient*2.1+.12*sin(h*3.14159), .08,1.);
    float rim=pow(max(0.,cos(angle+2.2)),4.)*smoothstep(.3,.75,h)*billow;
    float shadow=exp(-pow((h-.19)*5.,2.))*nearSide*.17;
    vec3 dust=mix(vec3(.14,.17,.20),vec3(.85,.83,.75),light);
    dust+=vec3(.22,.18,.10)*rim-shadow;
    // Sparse airborne dust glints stay subordinate to the large lit cloud masses.
    float motes=smoothstep(.79,.9,noise(field*23.))*wisps*billow;
    dust+=vec3(.58,.43,.20)*motes;
    dust=max(dust,vec3(.06));
    finalColor=vec4(dust*density,density)*vColor;
}`;

export function createGriffinTornadoShader(): Shader {
    return new Shader({
        glProgram: GlProgram.from({ name: "griffin-tornado", vertex, fragment }),
        resources: {
            storm: {
                uTime: { value: 0, type: "f32" },
            },
        },
    });
}
