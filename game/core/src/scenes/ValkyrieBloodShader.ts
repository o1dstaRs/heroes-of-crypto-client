import { GlProgram, Shader } from "pixi.js";
import { BLOOD_PULSE_SPEED } from "./ValkyrieBloodSpray";

const vertex = `#version 300 es
in vec2 aPosition;in vec2 aUV;out vec2 vUV;out vec4 vColor;
uniform mat3 uProjectionMatrix,uWorldTransformMatrix,uTransformMatrix;
uniform vec4 uWorldColorAlpha,uColor;
void main(){vUV=aUV;vColor=uColor*uWorldColorAlpha;gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);}`;

const fragment = `#version 300 es
precision highp float;
in vec2 vUV;in vec4 vColor;out vec4 finalColor;
uniform float uTime,uPerimeter,uPulseSpeed;
float hash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
float noise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);
 float n=i.x+i.y*57.;
 return mix(mix(hash(n),hash(n+1.),f.x),mix(hash(n+57.),hash(n+58.),f.x),f.y);
}
// Signed distance and the local coordinates of the nearest wet lobe.
vec3 lobe(vec2 p,vec2 center,vec2 radii){
 vec2 q=(p-center)/radii;
 return vec3((length(q)-1.)*min(radii.x,radii.y),q);
}
vec3 nearest(vec3 a,vec3 b){return a.x<b.x?a:b;}
void main(){
 float count=max(4.,floor(uPerimeter/.42));
 float spacing=uPerimeter/count;
 float id=min(count-1.,floor(vUV.x/spacing));
 float seed=hash(id+9.);
 vec2 p=vec2((fract(vUV.x/spacing)-.5)*spacing,vUV.y*.42);
 float shift=(seed-.5)*.12;
 vec2 q=p-vec2((hash(id+33.)-.5)*.08,shift);
 // Stable stains and smaller satellite droplets. Only the wet surface moves.
 float rough=noise(vec2(vUV.x*31.,p.y*43.));
 vec2 distortion=vec2(noise(vec2(vUV.x*16.,p.y*19.)),rough)-.5;
 vec2 wet=(q+distortion*.035)/1.15;
 vec3 stain=lobe(wet,vec2(0.),vec2(.105+seed*.055,.065+hash(id+4.)*.035));
 stain=nearest(stain,lobe(wet,vec2(-.085,.025),vec2(.085,.033)));
 stain=nearest(stain,lobe(wet,vec2(.067,-.024),vec2(.06,.045)));
 for(int j=0;j<5;j++){
  float k=float(j),h=hash(id*17.+k*3.7);
  float angle=h*6.2831853;
  vec2 center=vec2(cos(angle),sin(angle))*(.14+hash(id+k+83.)*.11);
  float radius=.009+hash(id*7.+k+21.)*.023;
  stain=nearest(stain,lobe(wet,center,vec2(radius*(1.+h*.8),radius)));
 }
 // A compact moving pressure crest, followed by a longer wet wake.
 float behind=mod(uTime*uPulseSpeed*uPerimeter-vUV.x+uPerimeter,uPerimeter);
 float ahead=uPerimeter-behind;
 float crest=exp(-pow(min(behind,ahead)/.22,2.));
 float wake=exp(-behind/.65);
 // A continuous wet smear joins every stain; its uneven banks keep the blood organic.
 // The factual range centerline below remains in exactly the same place.
 float bank=.067+.032*(distortion.x+.5)+.012*rough+crest*.025;
 float crossSection=p.y+distortion.x*.022;
 stain=nearest(stain,vec3(abs(crossSection)-bank,0.,crossSection/bank));
 float aa=max(fwidth(stain.x),.0018);
 float coverage=1.-smoothstep(-aa,aa,stain.x);
 float soaked=(1.-smoothstep(.002,.025,stain.x))*(1.-coverage);
 // A wave of renewed wetness runs around the fixed perimeter, like the tiger's contacts.
 float fresh=max(crest,wake*.65);
 float flow=noise(vec2(vUV.x*5.-uTime*.36,p.y*25.+uTime*.12));
 float depth=clamp(-stain.x/.065,0.,1.);
 vec2 slope=stain.yz;
 vec3 normal=normalize(vec3(slope*.56,1.));
 vec3 light=normalize(vec3(-.45,-.6,1.));
 float diffuse=.58+.42*max(0.,dot(normal,light));
 vec3 blood=mix(vec3(.18,.005,.016),vec3(.64,.025,.045),.35+flow*.45+fresh*.2);
 blood*=diffuse*(1.-depth*.2);
 blood=mix(blood,vec3(.74,.028,.050),crest*(.38+.22*flow));
 // Restrained neutral coat reflection over red absorption, not additive emission.
 float spec=pow(max(0.,dot(normal,normalize(vec3(-.28,-.40,1.)))),38.);
 float ripple=.5+.5*sin(length(stain.yz)*17.-uTime*3.5+id*2.);
 spec*=smoothstep(.004,.025,-stain.x)*(.38+.22*fresh)*(.65+.35*flow)*(.8+.2*ripple);
 blood+=vec3(.98,.66,.52)*spec;
 float crease=crossSection+.025+sin(vUV.x*24.-uTime*9.)*.008;
 float ridge=exp(-pow(crease/.012,2.))*crest;
 blood+=vec3(.52,.22,.17)*ridge*(.55+.45*rough);
 float meniscus=(1.-smoothstep(.005,.014,abs(stain.x+.007)))*coverage;
 blood+=vec3(.22,.012,.016)*meniscus;
 // Thin, stationary factual-range centerline; paint never changes its location.
 float lineAA=max(fwidth(p.y),.0015);
 float line=1.-smoothstep(.009,.009+lineAA,abs(p.y));
 float lineRidge=1.-smoothstep(.002,.002+lineAA,abs(p.y+.003));
 vec3 lineColor=vec3(.48,.018,.032)+vec3(.2,.033,.024)*lineRidge;
 float a=max(coverage*.94+soaked*.16,line*.76);
 vec3 color=mix(lineColor,blood,coverage);
 color=mix(vec3(.12,.002,.007),color,clamp(coverage+line,0.,1.));
 a*=1.-smoothstep(.80,1.,abs(vUV.y));
 finalColor=vec4(color*a,a)*vColor;
}`;

/** Local analytic blood material; no textures, filters or scene-light assumptions. */
export function createValkyrieBloodShader(perimeter: number): Shader {
    return new Shader({
        glProgram: GlProgram.from({ name: "valkyrie-blood-aura", vertex, fragment }),
        resources: {
            aura: {
                uTime: { value: 0, type: "f32" },
                uPerimeter: { value: perimeter, type: "f32" },
                uPulseSpeed: { value: BLOOD_PULSE_SPEED, type: "f32" },
            },
        },
    });
}
