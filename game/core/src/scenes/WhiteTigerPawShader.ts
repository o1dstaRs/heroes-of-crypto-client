import { GlProgram, Shader } from "pixi.js";
const vertex = `#version 300 es
in vec2 aPosition;in vec2 aUV;out vec2 vUV;out vec4 vColor;
uniform mat3 uProjectionMatrix,uWorldTransformMatrix,uTransformMatrix;
uniform vec4 uWorldColorAlpha,uColor;
void main(){vUV=aUV;vColor=uColor*uWorldColorAlpha;gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);}`;
const fragment = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vColor; out vec4 finalColor;
uniform float uTime,uAlert,uPerimeter,uTransition;
float g(float x,float w){return exp(-x*x/(w*w));}
float oval(vec2 p,vec2 at,vec2 radius){
 float r=length((p-at)/radius);return 1.-smoothstep(.88,1.05,r);
}
float pawprint(vec2 p){
 // Four round toes and a broad three-lobed feline heel pad; retracted claws.
 float pad=oval(p,vec2(-.032,0.),vec2(.041,.041));
 pad=max(pad,oval(p,vec2(-.050,-.024),vec2(.019,.023)));
 pad=max(pad,oval(p,vec2(-.050,.024),vec2(.019,.023)));
 float toes=oval(p,vec2(.028,-.058),vec2(.021,.018));
 toes=max(toes,oval(p,vec2(.059,-.022),vec2(.024,.019)));
 toes=max(toes,oval(p,vec2(.059,.022),vec2(.024,.019)));
 toes=max(toes,oval(p,vec2(.028,.058),vec2(.021,.018)));
 return max(pad,toes);
}
void main(){
 float s=vUV.x,d=vUV.y;
 float steps=max(2.,floor(uPerimeter/.54/2.)*2.);
 float spacing=uPerimeter/steps;
 float stepId=min(steps-1.,floor(s/spacing)),footSide=mod(stepId,2.)*2.-1.;
 vec2 foot=vec2((fract(s/spacing)-.5)*spacing,d*.42-footSide*.025);
 float printMask=pawprint(foot/1.20);
 // One new contact every 280ms. Older prints retain a short, fading afterglow.
 float age=mod(uTime/.28-stepId+steps,steps)*.28;
 float contact=smoothstep(0.,.055,age)*exp(-age*3.1);
 float glow=exp(-dot(foot/vec2(.13,.12),foot/vec2(.13,.12)))*contact;
 vec3 base=mix(vec3(.21,.68,.32),vec3(.88,.12,.08),uAlert);
 vec3 hot=mix(vec3(.69,1.,.56),vec3(1.,.59,.30),uAlert);
 float a=g(d,.034)*.20+printMask*(.48+contact*.45)+glow*.36;
 // A quiet travelling filament connects the steps without moving the boundary.
 float ribbon=g(d,.16)*(.025+.045*pow(.5+.5*sin(s*.75-uTime*.8),6.));
 a+=ribbon;
 vec3 col=mix(base,hot,clamp(contact*.9+glow*.3,0.,1.));
 a*=1.-smoothstep(.82,1.,abs(d));a=clamp(a,0.,.94);
 finalColor=vec4(col*a,a)*vColor;
}
`;
export function createWhiteTigerPawShader() {
    return new Shader({
        glProgram: GlProgram.from({ name: "white-tiger-paw-aura", vertex, fragment }),
        resources: {
            aura: {
                uTime: { value: 0, type: "f32" },
                uAlert: { value: 0, type: "f32" },
                uPerimeter: { value: 30, type: "f32" },
                uTransition: { value: 100, type: "f32" },
            },
        },
    });
}

const fieldFragment = `#version 300 es
precision highp float;
in vec2 vUV;in vec4 vColor;out vec4 finalColor;
uniform float uTime,uAlert,uTransition;
uniform vec2 uSize,uBody;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float g(float x,float w){return exp(-x*x/(w*w));}
void main(){
 vec2 p=(vUV-.5)*uSize,halfSize=uSize*.5;
 float r=max(abs(p.x)/halfSize.x,abs(p.y)/halfSize.y);
 float edge=min(halfSize.x-abs(p.x),halfSize.y-abs(p.y));
 float boundary=smoothstep(0.,.28,edge);
 float body=max(abs(p.x)-uBody.x*.5,abs(p.y)-uBody.y*.5);
 float ownerFade=smoothstep(-.05,.38,body);
 float n=noise(p*.95+vec2(uTime*.07,-uTime*.10));
 float fine=noise(p*2.+vec2(-uTime*.11,uTime*.05));
 float fold=pow(max(0.,1.-abs(n*.68+fine*.32-.50)*5.),3.);
 // Transparent ground mist, strongest near the perimeter and never an opaque plate.
 float mist=fold*(.035+.10*g(edge-.48,.55))*(.78+.22*sin(uTime*.5));
 // A broad, soft reveal ripple crosses the whole field on a slow loop.
 float phase=fract(uTime*.13),ring=g(r-(.14+phase*.84),.035);
 float wave=ring*sin(phase*3.14159)*.12;
 // Entering/leaving invisibility sends one additional response through the field.
 float eventRing=g(r-uTransition*.8,.05)*exp(-uTransition*1.3)*.24;
 float a=(mist+wave+eventRing)*boundary*ownerFade;
 vec3 col=mix(vec3(.18,.63,.32),vec3(.78,.075,.055),uAlert);
 col+=mix(vec3(.20,.28,.12),vec3(.22,.12,.06),uAlert)*(wave+eventRing)*3.;
 a=clamp(a,0.,.22);
 finalColor=vec4(col*a,a)*vColor;
}`;
export function createWhiteTigerFieldShader(size: [number, number], body: [number, number]) {
    return new Shader({
        glProgram: GlProgram.from({ name: "white-tiger-spectral-field", vertex, fragment: fieldFragment }),
        resources: {
            aura: {
                uTime: { value: 0, type: "f32" },
                uAlert: { value: 0, type: "f32" },
                uTransition: { value: 100, type: "f32" },
                uSize: { value: new Float32Array(size), type: "vec2<f32>" },
                uBody: { value: new Float32Array(body), type: "vec2<f32>" },
            },
        },
    });
}
