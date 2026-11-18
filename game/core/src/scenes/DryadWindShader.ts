import { GlProgram, Shader } from "pixi.js";

const vertex = `#version 300 es
in vec2 aPosition;in vec2 aUV;out vec2 vUV;out vec4 vColor;
uniform mat3 uProjectionMatrix,uWorldTransformMatrix,uTransformMatrix;
uniform vec4 uWorldColorAlpha,uColor;
void main(){vUV=aUV;vColor=uColor*uWorldColorAlpha;gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);}`;

const rim = `#version 300 es
precision highp float;
in vec2 vUV;in vec4 vColor;out vec4 finalColor;
uniform float uTime,uPerimeter,uAspect,uInward;
void main(){
 float y=vUV.y,aa=max(fwidth(y),.012);
 float line=1.-smoothstep(.018,.018+aa,abs(y));
 float halo=exp(-abs(y)*8.);
 float phase=6.2831853*(vUV.x/uPerimeter-uTime/3.2);
 float crest=pow(.5+.5*cos(phase),18.);
 float braid=sin(vUV.x*10.-uTime*3.)*.13;
 float thread=exp(-pow((y-braid)/max(.035,aa),2.));
 float secondary=exp(-pow((y+braid)/max(.025,aa),2.));
 float a=(line*.70+halo*.14+thread*(.18+.32*crest)+secondary*.12);
 a=clamp(a,0.,.86)*(1.-smoothstep(.65,1.,abs(y)));
 vec3 color=mix(vec3(.16,.58,.48),vec3(.97,.76,.32),clamp(line*.6+crest*.7,0.,1.));
 color+=vec3(.15,.16,.09)*crest*line;
 if(uInward>.5){
  // Ink-dark border with a subdued violet edge; no change to the range ribbon.
  color=mix(vec3(.025,.018,.038),vec3(.38,.27,.45),clamp(line*.32+thread*.55+crest*.35,0.,1.));
  a=clamp(line*.82+halo*.34+thread*.28+secondary*.16,0.,.94)
    *(1.-smoothstep(.65,1.,abs(y)));
 }
 finalColor=vec4(color*a,a)*vColor;
}`;

const field = `#version 300 es
precision highp float;
in vec2 vUV;in vec4 vColor;out vec4 finalColor;
uniform float uTime,uPerimeter,uAspect,uInward;
void main(){
 vec2 p=(vUV-.5)*2.;p.x*=uAspect;
 float radius=length(p), angle=atan(p.y,p.x);
 float coverage=1.-smoothstep(.89,1.,max(abs(vUV.x-.5),abs(vUV.y-.5))*2.);
 float light=0.,core=0.;
 // Peasant reverses only the painted radial travel; the range geometry stays fixed.
 for(int i=0;i<3;i++){
  float phase=fract(uTime/3.2+float(i)/3.);
  float travel=mix(phase,1.-phase,uInward);
  float r=.12+travel*1.36;
  float d=radius-r;
  float aa=max(fwidth(radius),.006);
  float veil=exp(-pow((d+mix(.025,-.025,uInward))/.065,2.));
  float thread=exp(-pow(d/max(.009,aa),2.));
  float sweep=.67+.33*sin(angle*3.-uTime*1.7+float(i)*2.);
  float fade=smoothstep(0.,.17,phase)*(1.-smoothstep(.65,1.,phase));
  light+=(veil*.17+thread*.43)*fade*sweep;
  core+=thread*fade*sweep;
 }
 float a=clamp(light,0.,.56)*coverage*smoothstep(.10,.26,radius);
 vec3 color=mix(vec3(.18,.65,.57),vec3(1.,.81,.40),clamp(core*.8,0.,1.));
 if(uInward>.5){
  vec2 q=(vUV-.5)*2.;
  float edge=max(abs(q.x),abs(q.y));
  // Twenty-four curved lanes start at the square perimeter and pull toward the owner.
  // The tail remains outside its travelling head, making the inward direction readable.
  float lanes=(atan(q.y,q.x)+3.14159265)*3.81971863;
  lanes+=(1.-edge)*1.3+sin(edge*7.-uTime*.8)*.10;
  float lane=floor(lanes),crossLane=fract(lanes)-.5;
  float seed=fract(sin(lane*127.1)*43758.5453);
  float phase=fract(uTime/1.85+seed);
  float head=.98-phase*.56;
  float along=edge-head;
  float fade=smoothstep(0.,.12,phase)*(1.-smoothstep(.76,1.,phase));
  float tail=smoothstep(-.025,.025,along)*(1.-smoothstep(.04,.30,along));
  float width=mix(.14,.30,clamp(along/.30,0.,1.));
  float stream=exp(-pow(crossLane/width,2.))*tail*fade;
  float glint=exp(-pow(crossLane/max(.085,fwidth(lanes)),2.))
    *exp(-pow(along/.055,2.))*fade;
  float innerCoverage=1.-smoothstep(.95,1.,edge);
  float darkWave=clamp(light*1.35,0.,.65)*coverage*smoothstep(.10,.26,radius);
  float ink=stream*.78*innerCoverage;
  float edgeLight=glint*.64*innerCoverage;
  a=clamp(darkWave+ink+edgeLight,0.,.80);
  vec3 waveColor=mix(vec3(.025,.018,.038),vec3(.32,.23,.39),clamp(core*.65,0.,1.));
  color=(waveColor*darkWave+vec3(.16,.095,.22)*ink+vec3(.55,.40,.64)*edgeLight)/max(a,.001);
 }
 finalColor=vec4(color*a,a)*vColor;
}`;

/** Two local analytic materials, premultiplied output; no textures or screen filters. */
export function createDryadWindShader(perimeter: number, aspect: number, isField: boolean): Shader {
    return new Shader({
        glProgram: GlProgram.from({
            name: isField ? "dryad-wind-waves" : "dryad-wind-perimeter",
            vertex,
            fragment: isField ? field : rim,
        }),
        resources: {
            aura: {
                uTime: { value: 0, type: "f32" },
                uPerimeter: { value: perimeter, type: "f32" },
                uAspect: { value: aspect, type: "f32" },
                uInward: { value: 0, type: "f32" },
            },
        },
    });
}
