import { GlProgram, Shader } from "pixi.js";

const vertex = `#version 300 es
in vec2 aPosition;in vec2 aUV;out vec2 vUV;out vec4 vColor;
uniform mat3 uProjectionMatrix,uWorldTransformMatrix,uTransformMatrix;
uniform vec4 uWorldColorAlpha,uColor;
void main(){vUV=aUV;vColor=uColor*uWorldColorAlpha;gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);}`;

const fragment = `#version 300 es
precision highp float;
in vec2 vUV;in vec4 vColor;out vec4 finalColor;
uniform float uTime,uPerimeter;
float bell(float x,float w){return exp(-x*x/(w*w));}
// A pair of lobes and a tapered base form each heart-shaped leaflet.
float leaf(vec2 p){
 float lobes=min(length(p-vec2(.044,.122)),length(p-vec2(-.044,.122)))-.058;
 float base=max(abs(p.x)*.74-p.y*.67,-p.y);
 base=max(base,p.y-.122);
 return min(lobes,base);
}
float clover(vec2 p){
 return min(min(leaf(p),leaf(-p)),min(leaf(vec2(p.y,-p.x)),leaf(vec2(-p.y,p.x))));
}
void main(){
 float count=max(4.,uPerimeter);
 float spacing=1.;
 float id=floor(vUV.x/spacing);
 vec2 p=vec2((fract(vUV.x/spacing)-.5)*spacing,vUV.y*.42);
 float angle=.17*sin(uTime*1.25+id*1.7);
 p=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p/(.56*1.23);
 float d=clover(p);
 float aa=max(fwidth(d),.0025);
 float mask=1.-smoothstep(-aa,aa,d);
 float phase=6.2831853*(id/count-uTime/4.6);
 float crest=pow(.5+.5*cos(phase),12.);
 float edge=bell(d,.012);
 float vein=bell(min(abs(p.x),abs(p.y)),.007)*mask;
 float facet=clamp(.50+p.y*2.2-p.x*1.6,0.,1.);
 vec3 jade=mix(vec3(.045,.28,.08),vec3(.38,.86,.28),facet);
 jade+=vec3(.27,.35,.12)*vein;
 vec3 gold=vec3(.96,.79,.33);
 vec3 color=mix(jade,gold,clamp(edge*(.60+.32*crest),0.,.92));
 float gleam=bell(p.x+p.y-.28*sin(uTime*.9-id*.7),.016)*mask*(.12+.5*crest);
 color+=gold*gleam;
 float halo=bell(max(d,0.),.055)*(1.-mask)*(.10+.18*crest);
 // Continuous, restrained twin filaments and travelling glints stay inside the ribbon.
 float flow=sin(vUV.x*7.-uTime*2.)*.15;
 float thread=bell(vUV.y-flow,.026)*(.11+.15*crest);
 float thread2=bell(vUV.y+flow,.018)*.08;
 vec2 spark=vec2((fract(vUV.x/spacing-uTime*.32+id*.13)-.5)*spacing,
                vUV.y*.42-.27*sin(id*2.3+uTime*.8));
 float point=exp(-dot(spark,spark)/.00015);
 float rays=bell(spark.x,.005)*bell(spark.y,.043)+bell(spark.y,.004)*bell(spark.x,.034);
 float glint=(point+rays*.30)*(.4+.6*pow(.5+.5*sin(id*3.7+uTime*2.6),4.));
 float a=mask*.88+halo+thread+thread2+glint*.7;
 vec3 rgb=color*mask*.88+vec3(.28,.75,.25)*halo+gold*(thread+thread2+glint*.7);
 float fade=1.-smoothstep(.76,1.,abs(vUV.y));
 finalColor=vec4(rgb*fade,min(a,.98)*fade)*vColor;
}`;

const glowFragment = `#version 300 es
precision highp float;
in vec2 vUV;in vec4 vColor;out vec4 finalColor;
void main(){
 // Constant translucent green fill, feathered only at the perimeter. No visual clock.
 float coverage=smoothstep(0.,.055,vUV.y);
 float a=.10*coverage;
 finalColor=vec4(vec3(.09,.65,.20)*a,a)*vColor;
}`;

/** Local premultiplied material: no texture taps, particle allocations or screen filter. */
export function createLeprechaunCloverShader(perimeter: number, glow = false): Shader {
    return new Shader({
        glProgram: GlProgram.from({
            name: glow ? "leprechaun-inner-glow" : "leprechaun-clover-perimeter",
            vertex,
            fragment: glow ? glowFragment : fragment,
        }),
        resources: {
            aura: {
                uTime: { value: 0, type: "f32" },
                uPerimeter: { value: perimeter, type: "f32" },
            },
        },
    });
}
