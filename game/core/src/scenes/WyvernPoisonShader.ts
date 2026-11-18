import { GlProgram, Shader } from "pixi.js";

const vertex = `#version 300 es
in vec2 aPosition; in vec2 aUV;
out vec2 vUV; out vec4 vColor;
uniform mat3 uProjectionMatrix, uWorldTransformMatrix, uTransformMatrix;
uniform vec4 uWorldColorAlpha, uColor;
void main(){vUV=aUV;vColor=uColor*uWorldColorAlpha;gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);}`;

const common = `
precision highp float;
in vec2 vUV; in vec4 vColor; out vec4 finalColor;
uniform float uTime, uSeed, uVent;
uniform vec4 uSource;
const float PI=3.14159265359;
const float TAU=6.28318530718;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c);}
float fbm(vec2 p){float v=0.,a=.55;for(int i=0;i<4;i++){v+=a*noise(p);p=mat2(.8,.6,-.6,.8)*p*2.03+7.13;a*=.48;}return v;}
float gaussian(float d,float w){return exp(-d*d/(w*w));}
vec4 over(vec4 back,vec4 front){return front+back*(1.-front.a);}
`;
const floor = `#version 300 es
${common}
float shape(vec2 p){
 float physicalRadius=length(p),a=atan(p.y,p.x),t=uTime;
 // Keep the expanded corner lobes, but fill the former eye continuously.
 float cornerReach=1.+.32*pow(sin(a*2.),2.);
 float progress=physicalRadius/cornerReach;
 float r=.42+.38*progress;
 // A drifting, frayed density boundary replaces the circular scissor edge.
 float outer=cornerReach+.05*sin(a*5.+t*.19)+.02*sin(a*11.-t*.27)
    +.04*(noise(p*8.5+vec2(t*.09,-t*.07))-.5);
 float fringe=1.-smoothstep(outer-.10,outer+.07,physicalRadius);
 float field=fringe;
 float d=0.;
 // Preserve the approved flowing filaments while widening only their radial placement.
 float radius=.66+.045*sin(a*3.-t*.30)+.025*sin(a*7.+t*.2);
 d=gaussian(r-radius,.11)+.36*gaussian(r-radius+.13,.065);
 return (d+.72*(1.-smoothstep(.20,.80,progress)))*field;
}
void main(){
 vec2 p=(vUV-.5)*2.;float r=length(p),t=uTime;
 if(r>1.52){finalColor=vec4(0);return;}
 vec2 flow=rot(t*.075)*p;
 vec2 warp=vec2(fbm(flow*3.7+vec2(t*.08,0.)),fbm(flow*3.7+vec2(7.,-t*.09)))-.5;
 vec2 q=p+warp*.085;
 float n=fbm(flow*13.+warp*3.-vec2(t*.12,t*.18));
 float fine=noise(flow*62.+warp*5.-t*.26);
 float form=shape(q);
 float wide=shape(q+vec2(.014,.015));
 // Two connected foot vents seed the field, while slow outward waves bind the whole aura.
 vec2 source=(p-uSource.xy)/uSource.zw;
 float sourceRadius=length(source*vec2(.82,1.));
 float core=exp(-sourceRadius*sourceRadius*2.2);
 float wave=.5+.5*sin(r*25.-t*2.2+warp.x*5.);
 wave=pow(wave,5.)*(1.-exp(-r*6.));
 float breathing=.92+.08*sin(t*.73+n*2.);
 float body=form*(.3+.85*smoothstep(.22,.77,n))*breathing;
 body+=form*.13*wave+core*(.28+.18*sin(t*1.8+n*5.));
 float filament=pow(max(0.,1.-abs(n-.50)*8.),5.)*form;
 float light=clamp(.60+(n-fbm(flow*13.+warp*3.+vec2(.08,.05)-vec2(t*.12,t*.18)))*5.,.1,1.);
 vec3 dark=vec3(.045,.11,.016), olive=vec3(.29,.44,.058), sun=vec3(.74,.84,.24);
 vec3 col=mix(dark,olive,light);col=mix(col,sun,clamp(filament*.70+fine*body*.13,0.,.72));
 // Local glow sweeps and broken radial rivulets; no opaque disk or hard ring.
 float streams=pow(max(0.,sin(atan(source.y,source.x)*9.+n*7.-t*.38)),8.);
 float rivulets=streams*exp(-sourceRadius*.72)*(.3+.7*wave);
 col+=vec3(.16,.23,.025)*(wave*.32+core*.48+rivulets*.8);
 float a=clamp(1.-exp(-body*1.7),0.,.82);
 vec4 outc=vec4(col*a,a);
 // An offset local shadow grounds the material and separates its body from luminous rims.
 float shadow=wide*.19*(1.-a);outc.rgb+=vec3(.018,.027,.008)*shadow;outc.a+=shadow;
 // Soft low-intensity scattered light, bounded to the artwork, not the gameplay rectangle.
 float halo=shape(p+warp*.15)*.17;
 outc.rgb+=vec3(.18,.28,.025)*halo*(1.-outc.a);outc.a+=halo*.24*(1.-outc.a);
 // Wet beads: nearest 3x3 neighbourhood, variable radii and specular shading.
 vec2 cell=floor(p*20.),f=fract(p*20.);
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
   vec2 id=cell+vec2(x,y);float seed=hash(id+3.);
   vec2 at=vec2(x,y)+vec2(.25+.5*seed,.25+.5*hash(id+9.));
   at+=vec2(sin(t*.6+seed*19.),cos(t*.43+seed*27.))*.09;
   vec2 v=(f-at);float size=.035+seed*.095,dd=length(v)/size;
   float wet=(1.-smoothstep(.75,1.12,dd))*step(.52,seed)*shape((cell+at)/20.);
   float spec=gaussian(length(v/size-vec2(-.3,-.4)),.25);
   float rim=gaussian(dd-.78,.15);
   vec3 liquid=vec3(.12,.31,.015)+vec3(.47,.57,.14)*rim+vec3(.88,.91,.58)*spec;
   outc=over(outc,vec4(liquid*wet,wet));
 }
 // The vent has its own readable value hierarchy: dark wet collar, luminous churn,
 // then broken spirals that carry the poison outward. Coordinates are in board cells.
 vec2 basin=source*vec2(.78,1.08);
 float angle=atan(basin.y,basin.x);
 float br=length(basin);
 float churn=noise(rot(-t*.32)*basin*7.+warp*2.);
 float edgeRadius=.60+.07*sin(angle*3.+t*.48)+.09*(churn-.5);
 float collar=gaussian(br-edgeRadius-.13,.15)*.44;
 outc=over(outc,vec4(vec3(.025,.075,.008)*collar,collar));
 float pool=(1.-smoothstep(edgeRadius-.19,edgeRadius+.10,br));
 float veins=pow(max(0.,1.-abs(churn-.51)*5.),3.);
 vec3 acid=mix(vec3(.19,.38,.018),vec3(.67,.86,.16),veins);
 float poolAlpha=pool*(.42+.16*veins);
 outc=over(outc,vec4(acid*poolAlpha,poolAlpha));
 float crest=gaussian(br-edgeRadius,.035+.025*churn)*(.35+.65*churn);
 float spiral=pow(max(0.,sin(angle*3.-br*10.+t*1.6+churn*2.)),10.);
 spiral*=smoothstep(.20,.44,br)*(1.-smoothstep(.65,1.45,br));
 float glow=(crest*.68+spiral*.48+pool*.16)*(.90+.10*sin(t*2.));
 outc.rgb+=vec3(.37,.60,.065)*glow;
 outc.a=clamp(outc.a+glow*.15,0.,1.);
 // Sparse bubble rims swell and break around the feet, rather than forming concentric rings.
 for(int i=0;i<5;i++){
   float seed=float(i)*1.71;
   vec2 at=vec2(sin(seed*5.),cos(seed*3.))*.38;
   float age=fract(t*.55+float(i)*.213);
   float rr=length(source-at+warp*.12);
   float ripple=gaussian(rr-(.035+age*.24),.018+age*.010);
   ripple*=sin(age*PI)*(1.-age)*(.45+.55*noise(source*12.+seed));
   float bubble=ripple*.76;
   outc=over(outc,vec4(vec3(.72,.89,.25)*bubble,bubble));
 }
 finalColor=outc*vColor;
}`;
const air = `#version 300 es
${common}
float hash3(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float cloud(vec3 p){float n=.57*noise3(p);p=p*2.03+7.1;n+=.28*noise3(p);p=p*2.03+3.7;return n+.14*noise3(p);}
float density(vec3 p){
 float t=uTime,s=uSeed;
 float h=p.y;
 p.x-=.19*sin(h*4.5-t*.55+s);
 p.z+=.12*cos(h*5.-t*.4+s);
 float width=.23+.27*(1.-h);
 float envelope=exp(-dot(p.xz,p.xz)/(width*width)*1.2);
 envelope*=smoothstep(-.05,.12,h)*(1.-smoothstep(.52,1.,h));
 vec3 q=p*vec3(4.,3.,4.)+vec3(s,-t*.23,s*.3);
 float curl=cloud(q*.65+vec3(t*.06,0,0));
 q+=vec3(curl,-curl*.6,curl)*1.3;
 return smoothstep(.27,.68,cloud(q))*envelope;
}
void main(){
 vec2 p=vec2((vUV.x-.5)*2.,vUV.y);
 if(abs(p.x)>.92){finalColor=vec4(0.);return;}
 vec3 radiance=vec3(0.);float transmittance=1.;
 // Twelve front-to-back samples of a 3D density field; Beer-Lambert extinction.
 for(int i=0;i<12;i++){
   float z=-.65+(float(i)+.5)*.1083;
   vec3 q=vec3(p.x,p.y+z*.22,z);
   float d=density(q);
   float pulse=.76+.24*sin(uTime*2.3+uSeed);
   float optical=d*(.40+uVent*.27*pulse);
   float a=1.-exp(-optical);
   float shadow=density(q+vec3(-.14,.12,-.12));
   float light=exp(-shadow*2.8);
   vec3 col=mix(vec3(.075,.13,.035),vec3(.57,.65,.29),light);
   col+=uVent*vec3(.25,.37,.035)*exp(-p.y*3.);
   radiance+=transmittance*a*col;
   transmittance*=1.-a;
 }
 // Fade the billboard itself too: the density ray can enter below h=0,
 // otherwise its cut bottom edge becomes a visible horizontal rectangle.
 float edge=smoothstep(0.,.12,vUV.y)*(1.-smoothstep(.82,1.,vUV.y));
 edge*=1.-smoothstep(.72,.96,abs(p.x));
 vec4 mist=vec4(radiance,1.-transmittance)*edge;
 // Small acid drops rise briefly from each vent and fall back; they stay below the body.
 if(uVent>.5){
   for(int i=0;i<3;i++){
     float id=float(i)+uSeed;
     float age=fract(uTime*.64+id*.37);
     float side=sin(id*17.);
     vec2 at=vec2(side*(.05+age*.48),.10+sin(age*PI)*(.35+.12*cos(id*9.)));
     vec2 delta=(p-at)*vec2(1.,.60);
     float bead=1.-smoothstep(.012,.028,length(delta));
     bead*=smoothstep(0.,.12,age)*(1.-smoothstep(.72,1.,age));
     float bloom=exp(-dot(delta,delta)/.003)*bead*.2;
     mist=over(mist,vec4(vec3(.67,.83,.18)*bead,bead));
     mist.rgb+=vec3(.2,.32,.025)*bloom;
   }
 }
 finalColor=mist*vColor;
}`;
const trail = `#version 300 es
${common}
void main(){
 vec2 p=(vUV-.5)*2.;
 float age=uTime, r=length(p);
 vec2 q=rot(age*.16)*p;
 float n=fbm(q*4.+vec2(uSeed,-age*.32));
 float ribbons=pow(max(0.,1.-abs(n-.49)*7.),3.);
 float envelope=(1.-smoothstep(.30,.98,r))*smoothstep(.03,.18,age)*(1.-smoothstep(.6,1.8,age));
 float a=envelope*(.08+.22*n+.12*ribbons);
 vec3 col=mix(vec3(.10,.20,.025),vec3(.38,.49,.09),n);
 finalColor=vec4(col*a,a)*vColor;
}`;

/** Local premultiplied-alpha VFX; no shared textures or full-screen filters. */
export function createWyvernPoisonShader(kind: "floor" | "air" | "trail", seed = 0) {
    return new Shader({
        glProgram: GlProgram.from({
            name: `wyvern-poison-${kind}`,
            vertex,
            fragment: kind === "floor" ? floor : kind === "air" ? air : trail,
        }),
        resources: {
            poison: {
                uTime: { value: 6.4, type: "f32" },
                uSeed: { value: seed, type: "f32" },
                uSource: { value: new Float32Array([0.1, -0.02, 1 / 3, 0.4]), type: "vec4<f32>" },
                uVent: { value: 0, type: "f32" },
            },
        },
    });
}
