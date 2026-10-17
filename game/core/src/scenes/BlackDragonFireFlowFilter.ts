import { Filter, GlProgram, Matrix, Texture, type Sprite } from "pixi.js";
import { BLACK_DRAGON_FIRE_START_MS, BLACK_DRAGON_FIRE_SPEED } from "./BlackDragonFireTiming";
const vertex = `
in vec2 aPosition;out vec2 vLocal;out vec2 vTextureCoord;uniform highp vec4 uInputSize,uOutputFrame,uOutputTexture;uniform mat3 uSpriteMatrix;
void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*2.0/uOutputTexture.x-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0.,1.);vTextureCoord=aPosition*uOutputFrame.zw*uInputSize.zw;vLocal=(uSpriteMatrix*vec3(vTextureCoord,1.)).xy;}`;
const fragment = `
in vec2 vLocal,vTextureCoord;out vec4 finalColor;uniform sampler2D uFlame,uBackTexture;uniform highp vec4 uInputSize,uInputClamp;uniform float uFrame,uTime,uAlpha,uProcedural;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
vec4 cel(vec2 p,float frame){float inside=step(0.,p.x)*step(p.x,1.)*step(0.,p.y)*step(p.y,1.);vec2 cell=vec2(mod(frame,4.),floor(frame/4.));return texture(uFlame,(cell+clamp(p,vec2(.0015625),vec2(.9984375)))/4.)*inside;}
// Advected density rolls at three scales; the nozzle remains pinned to the mouth.
float density(vec2 p){return (noise(p)+.5*noise(p*2.03+vec2(9.2,3.7))+.25*noise(p*4.11))/1.75;}
vec4 flame(vec2 p){
 float k=smoothstep(.08,.72,p.x);
 float flowTime=(uTime-.3)*1.4+.3;
 vec2 flow=vec2(p.x*13.-flowTime*8.,p.y*18.+flowTime*.8);
 float roll=density(flow),fine=noise(flow*2.7-vec2(flowTime*3.,flowTime));
 p.y+=(roll-.5)*.052*k+(fine-.5)*.012*k;
 p.y+=.012*k*k; // Gentle buoyancy at the cooling plume tip.
 p.x+=(fine-.5)*.014*k;
 float f=clamp(uFrame,0.,15.);
 vec4 c=mix(cel(p,floor(f)),cel(p,min(15.,floor(f)+1.)),smoothstep(0.,1.,fract(f)));
 // Continuous turbulent density breaks up the edge without replacing the painted volume.
 c*=mix(1.,.9+.18*fine,k);
 return c;
}
vec4 embers(vec2 p){
 float gate=smoothstep(.3,.42,uTime)*(1.-smoothstep(1.05,1.3,uTime));
 vec3 rgb=vec3(0.);float alpha=0.;
 for(int i=0;i<12;i++){
  float seed=float(i);float age=fract((uTime-.3)*1.4*1.7+seed*.137);
  float spread=(hash(vec2(seed,7.))-.5)*2.;
  vec2 at=vec2(.08+age*.84,.5+spread*(.018+age*age*.24)-.025*sin(age*7.+seed));
  vec2 delta=(p-at)/vec2(.006,.009);
  float a=exp(-dot(delta,delta)*2.)*sin(age*3.14159)*gate*.42;
  rgb+=vec3(1.,mix(.58,.13,age),.025)*a;alpha+=a;
 }
 return vec4(rgb,min(1.,alpha));
}
// A short volume integration through advected burning gas. The plume is made of
// folded reaction sheets and entrained pockets, rather than a solid radial core.
float noise3(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 vec2 uv=i.xy+vec2(37.,17.)*i.z;
 float a=mix(mix(hash(uv),hash(uv+vec2(1,0)),f.x),mix(hash(uv+vec2(0,1)),hash(uv+vec2(1,1)),f.x),f.y);
 uv+=vec2(37.,17.);
 float b=mix(mix(hash(uv),hash(uv+vec2(1,0)),f.x),mix(hash(uv+vec2(0,1)),hash(uv+vec2(1,1)),f.x),f.y);
 return mix(a,b,f.z);
}
float gas(vec3 q){return noise3(q)*.57+noise3(q*2.07+vec3(11,7,3))*.28+noise3(q*4.13+vec3(3,19,7))*.15;}
vec4 combustion(vec2 p){
 float t=uTime-.3;
 // Accelerate gas motion only; the exhale envelope stays synchronized to the jaw.
 float flowTime=t*1.4;
 float x=(p.x-.08)/.78;
 if(x<0. || x>1.38) return vec4(0.);
 float age=t-x*.22;
 float gate=smoothstep(0.,.055,age)*(1.-smoothstep(.76,.98,age))*(1.-smoothstep(.90,1.,t));
 if(gate<.001) return vec4(0.);
 // Work in isotropic plume space: circular eddies stay round along the jet.
 float y=(p.y-.5)/.78;
 float flow=x*9.-flowTime*15.;
 float roll=noise(vec2(flow*.65,5.3+flowTime*.4));
 float center=-.025*x*x+sin(flow*.95)*.022*x+(roll-.5)*.10*x;
 float radius=(.017+.21*pow(x,.72))*(.78+.35*roll);
 float tip=1.-smoothstep(.82,1.34,x);
 float breakup=smoothstep(.58,.88,x);
 float radial=abs(y-center)/max(radius,.012);
 if(radial>1.7) return embers(p)*gate;
 vec3 rgb=vec3(0.);float alpha=0.;
 for(int i=0;i<7;i++){
  float z=(float(i)-3.)/3.;
  vec3 q=vec3(x*22.-flowTime*29.,(y-center)*22.,z*2.3);
  vec3 curl=vec3(noise3(q*.59+vec3(7,0,3)),noise3(q*.59+vec3(2,9,1)),noise3(q*.59+vec3(8,1,11)))-.5;
  q+=curl*(1.2+1.7*x);
  float n=gas(q);
  float fine=noise3(q*5.2+vec3(0,flowTime*.7,0));
  float envelope=1.-sqrt(radial*radial+z*z*.76);
  // One connected volume carries the tip. Curl and fuel noise roughen its rim
  // without separate off-axis lobes splitting the breath into three prongs.
  float flutter=sin(x*15.-flowTime*10.+z*2.)*.018+curl.y*.038;
  float tipCenter=center+flutter*breakup*.65;
  float tipRadius=radius*mix(1.,.18,smoothstep(.72,1.32,x));
  float tipEnvelope=1.-length(vec2((y-tipCenter)/max(tipRadius,.012),z*.85));
  envelope=mix(envelope,tipEnvelope,breakup);
  // Fuel pockets erode through the entire cross section, including the centre.
  float fuel=envelope+(n-.52)*mix(1.9+1.1*x,1.45,breakup);
  float tornTip=mix(1.-smoothstep(.71,1.06,x+(n-.5)*.42),1.-smoothstep(1.16,1.38,x+(n-.5)*.12),breakup);
  float matter=smoothstep(-.10,.27,fuel)*tornTip;
  float sheet=pow(max(0.,1.-abs(n-.53)*4.5),1.3);
  float heat=clamp(sheet*.84+fine*.15+envelope*.10-x*.10-max(0.,x-.75)*.36,0.,1.);
  vec3 color=mix(vec3(.37,.018,.002),vec3(1.,.25,.008),smoothstep(.10,.43,heat));
  color=mix(color,vec3(1.,.65,.09),smoothstep(.40,.70,heat));
  color=mix(color,vec3(1.,.87,.40),smoothstep(.70,.96,heat));
  float opacity=(1.-exp(-matter*.60))*gate;
  rgb+=color*opacity*(1.-alpha);alpha+=opacity*(1.-alpha);
 }
 // Only the short nozzle is pale; no white stripe running the full jet length.
 float nozzle=exp(-pow(y/(.010+.035*x),2.)*2.)*(1.-smoothstep(.02,.17,x))*gate*.8;
 rgb=mix(rgb,vec3(1.,.89,.58),nozzle);alpha+=nozzle*(1.-alpha);
 float halo=exp(-radial*radial*2.5)*tip*gate*.055;
 rgb+=vec3(1.,.12,.003)*halo*(1.-alpha);alpha+=halo*(1.-alpha);
 vec4 sparks=embers(p);rgb+=sparks.rgb*(1.-alpha);alpha+=sparks.a*(1.-alpha);
 return vec4(min(rgb,vec3(alpha)),alpha);
}
// Cooling gas lifts off the single flame tip as translucent, irregular soot wisps.
vec4 coolingSmoke(vec2 p){
 float t=uTime-.3,x=(p.x-.08)/.78,y=(p.y-.5)/.78;
 float age=t-x*.18;
 float gate=smoothstep(.04,.20,age)*(1.-smoothstep(.72,1.,t));
 float trail=smoothstep(.42,.85,x)*(1.-smoothstep(1.18,1.52,x));
 float curl=density(vec2(x*7.-t*6.,y*9.+t*2.));
 float center=-.055-.12*x*x+(curl-.5)*.13;
 float radius=.09+.10*x;
 float profile=exp(-pow((y-center)/radius,2.)*1.6);
 float n=gas(vec3(x*12.-t*10.,y*15.+t*3.,t*.6));
 float wisps=smoothstep(.32,.71,n);
 float a=profile*wisps*trail*gate*.38;
 vec3 color=mix(vec3(.075,.069,.063),vec3(.27,.25,.22),n);
 // Warm scattering on the flame-facing side, fading into neutral grey.
 color+=vec3(.23,.065,.012)*exp(-abs(y+.02)*12.)*(1.-smoothstep(.7,1.3,x));
 return vec4(color*a,a);
}
vec4 refractedScene(vec2 p){
 float t=uTime-.3,x=(p.x-.08)/.78,y=(p.y-.5)/.78;
 float gate=smoothstep(0.,.08,t)*(1.-smoothstep(.83,1.,t));
 float region=smoothstep(.04,.25,x)*(1.-smoothstep(1.22,1.52,x));
 float hot=exp(-pow((y+.04*x*x)/(.09+.20*max(x,0.)),2.)*1.5)*region*gate*uAlpha;
 vec2 q=vec2(x*14.-t*17.,y*19.+t*4.);
 vec2 bend=vec2(density(q+vec2(9,2)),density(q+vec2(2,17)))-.5;
 // Refract the actual backdrop by at most ~2 screen pixels; never move the body sprite.
 vec2 offset=bend*3.6*hot*uInputSize.zw;
 return texture(uBackTexture,clamp(vTextureCoord+offset,uInputClamp.xy,uInputClamp.zw));
}
void main(){
 vec4 c;
 if(uProcedural>.5){vec4 fire=combustion(vLocal);vec4 smoke=coolingSmoke(vLocal);c=fire+smoke*(1.-fire.a);}
 else{c=flame(vLocal);vec4 sparks=embers(vLocal);c+=sparks*(1.-c.a);}
 c*=uAlpha;
 vec4 back=refractedScene(vLocal);
 finalColor=c+back*(1.-c.a);
}`;
/** GPU flame flow and volumetric upward breath, isolated from the creature silhouette. */
export class BlackDragonFireFlowFilter extends Filter {
    public constructor(
        private sprite: Sprite,
        texture: Texture,
    ) {
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            blendRequired: true,
            resolution: "inherit",
            antialias: "inherit",
            // Leave room beyond the texture quad for the curling plume tip.
            padding: 72,
            resources: {
                uFlame: texture.source,
                fire: {
                    uSpriteMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uFrame: { value: 0, type: "f32" },
                    uTime: { value: 0, type: "f32" },
                    uAlpha: { value: 1, type: "f32" },
                    uProcedural: { value: 0, type: "f32" },
                },
            },
        });
    }
    public update(timeMs: number, texture: Texture, procedural = false) {
        this.resources.uFlame = texture.source;
        Object.assign(this.resources.fire.uniforms, {
            uFrame: Math.min(15, (((timeMs - BLACK_DRAGON_FIRE_START_MS) * BLACK_DRAGON_FIRE_SPEED) / 1000) * 16),
            // Shader flow is expressed in the original exhale timeline, independent of anticipation.
            uTime: ((timeMs - BLACK_DRAGON_FIRE_START_MS) * BLACK_DRAGON_FIRE_SPEED + 300) / 1000,
            uProcedural: procedural ? 1 : 0,
        });
    }
    public override apply(...args: Parameters<Filter["apply"]>) {
        args[0].calculateSpriteMatrix(this.resources.fire.uniforms.uSpriteMatrix, this.sprite);
        this.resources.fire.uniforms.uAlpha = this.sprite.getGlobalAlpha();
        super.apply(...args);
    }
}
