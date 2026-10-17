/** Mesh transforms supplied by Pixi's MeshPipe, including the world's y-up projection. */
const transforms = `
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;
`;
const noise = `
float hash(vec3 p) { p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z); }
float noise3(vec3 p) {
 vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) { float n=0.0,a=0.55;for(int i=0;i<4;i++){n+=a*noise3(p);p=p*2.07+vec3(7.1,3.8,2.3);a*=0.48;}return n; }
`;
export const STONE_VERTEX = `
in vec2 aPosition;
in vec3 aNormal;
in vec3 aStone;
in vec3 aBary;
out vec3 vNormal;
out vec3 vStone;
out vec3 vBary;
${transforms}
void main(){vNormal=aNormal;vStone=aStone;vBary=aBary;vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);gl_Position=vec4(p.xy,0,1);}
`;
export const STONE_FRAGMENT = `
in vec3 vNormal;
in vec3 vStone;
in vec3 vBary;
out vec4 finalColor;
uniform vec4 uColor;
uniform float uFade;
${noise}
void main(){
 vec3 p=vStone*7.0;
 float mineral=fbm(p*2.0),grain=noise3(p*29.0);
 float fissure=1.0-smoothstep(0.015,0.065,abs(noise3(p*5.0)-0.49));
 // Warm brown body and pale beige mineral fractures from cyclops_lab_boulder.webp.
 vec3 rock=mix(vec3(.28,.20,.14),vec3(.73,.61,.49),mineral);
 rock*=0.80+grain*0.38; rock*=1.0-fissure*.25;
 float fleck=smoothstep(.71,.87,grain)*.32;
 rock=mix(rock,vec3(.84,.75,.65),fleck);
 // Static object-space microrelief travels with the rotating fragment.
 vec3 n=normalize(vNormal+0.14*vec3(noise3(p*14.0)-.5,noise3(p*14.0+13.0)-.5,noise3(p*14.0+29.0)-.5));
 vec3 light=normalize(vec3(-.48,-.42,.82));vec3 eye=normalize(vec3(0,-.85,.55));
 float diffuse=max(0.0,dot(n,light));
 float spec=pow(max(0.0,dot(n,normalize(light+eye))),18.0)*.12;
 float edge=min(vBary.x,min(vBary.y,vBary.z));
 float bevel=1.0-smoothstep(0.0,.035,edge);
 vec3 color=rock*(.47+diffuse*1.2)+vec3(spec)+vec3(.14,.115,.09)*bevel*(.3+diffuse);
 float alpha=uFade*uColor.a;
 finalColor=vec4(color*uColor.rgb*alpha,alpha);
}`;
export const DUST_VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vPoint;
${transforms}
void main(){vPoint=aUV;vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);gl_Position=vec4(p.xy,0,1);}
`;
export const DUST_FRAGMENT = `
in vec2 vPoint;
out vec4 finalColor;
uniform vec4 uColor;
uniform float uTime;
uniform float uSeed;
uniform float uFront;
${noise}
void main(){
 vec2 p=vPoint;
 float t=uTime;
 float density=0.0,lit=0.0;
 // Independent rolling plumes with a turbulent edge, no scaled smoke photograph.
 for(int i=0;i<14;i++){
  float k=float(i),angle=k*2.399963+uSeed;
  float r=(.12+1.02*(1.0-exp(-t*4.4)))*(0.72+hash(vec3(k,uSeed,3))*.28);
  vec2 center=vec2(cos(angle)*r,sin(angle)*r*.55+.05+t*.20);
  center.x+=sin(t*2.0+k)*t*.07;
  vec2 d=(p-center)/vec2(.14+t*.23,.09+t*.18);
  float falloff=exp(-dot(d,d)*1.8);
  if(falloff>.006){
   vec3 q=vec3(p*8.0-vec2(t*.32,t*.6),k*.73+uSeed);
   float warp=fbm(q+vec3(fbm(q*0.7),t*.18,0));
   float puff=falloff*smoothstep(.21,.71,warp)*2.0;
   density+=puff;lit+=puff*(.58+.42*warp+.13*d.y-.10*d.x);
  }
 }
 float core=exp(-dot((p-vec2(.04,t*.2))/vec2(.24+t*.22,.13+t*.15),(p-vec2(.04,t*.2))/vec2(.24+t*.22,.13+t*.15))*2.0);
 float coreNoise=fbm(vec3(p*10.0-vec2(t*.4,t*.7),uSeed));
 density+=core*coreNoise*1.7;lit+=core*coreNoise*1.25;
 float start=smoothstep(0.0,.065,t),end=1.0-smoothstep(.52,1.75,t);
 float mask=1.0-smoothstep(1.32,1.5,length(vec2(p.x,p.y/0.85)));
 float alpha=(1.0-exp(-density*1.6))*start*end*mask*(uFront>.5?.44:.78);
 vec3 color=mix(vec3(.27,.20,.15),vec3(.64,.53,.43),clamp(lit/max(density,.001),0.0,1.0));
 // Short mineral compression plume, no fire or luminous magic ring.
 float crush=exp(-dot(p/vec2(.36,.16),p/vec2(.36,.16))*2.0)*exp(-t*23.0);
 alpha=clamp(alpha+crush*.45,0.0,.88)*uColor.a;
 finalColor=vec4(color*alpha*uColor.rgb,alpha);
}`;
