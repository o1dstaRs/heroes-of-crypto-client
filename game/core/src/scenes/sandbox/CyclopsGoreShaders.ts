const transforms = `
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;
`;
const hash = `float hash(float p) { return fract(sin(p * 127.1 + 311.7) * 43758.5453); }`;

export const GORE_VERTEX = `
precision highp float;
in vec2 aPosition;
in vec2 aCenter;
in vec2 aCorner;
in float aSeed;
out vec2 vUV;
out vec2 vCenterUV;
out vec2 vCorner;
out float vRelease;
out float vFade;
out float vSeed;
uniform vec2 uBody;
uniform vec2 uAnchor;
uniform vec2 uDirection;
uniform vec2 uUvOrigin;
uniform vec2 uUvX;
uniform vec2 uUvY;
uniform float uTime;
uniform float uCell;
uniform float uFloor;
uniform float uSeed;
${transforms}
${hash}
void main() {
 float seed=aSeed+uSeed;
 float delay=.012+hash(seed+1.0)*.105+hash(seed+2.0)*.025;
 float t=max(0.0,uTime-delay);
 float release=smoothstep(0.0,.045,t);
 vec2 center=(aCenter-uAnchor)*uBody;
 vec2 intact=(aPosition-uAnchor)*uBody;
 vec2 radial=normalize(vec2(center.x,center.y-uFloor-abs(uBody.y)*.42)+vec2(.01));
 float vx=(uDirection.x*(.8+hash(seed+3.0)*1.3)+radial.x*(.35+hash(seed+4.0)*1.7))*uCell;
 float vy=(.8+hash(seed+5.0)*2.8+uDirection.y*.35)*uCell;
 float gravity=uCell*8.4;
 float landing=(vy+sqrt(vy*vy+2.0*gravity*max(0.0,center.y-uFloor)))/gravity;
 float air=min(t,landing),ground=max(0.0,t-landing);
 vec2 point=center+vec2(vx*(1.0-exp(-air*2.0))*.5,vy*air-gravity*air*air*.5);
 point.x+=vx*.10*(1.0-exp(-ground*5.0));
 point.y=max(uFloor,point.y)+sin(min(1.0,ground/.18)*3.14159)*uCell*.075*exp(-ground*5.0);
 float material=hash(seed+6.0);
 float radius=uCell*(material<.78 ? .004+hash(seed+7.0)*.009 : .012+hash(seed+7.0)*.020);
 vec2 shape=vec2(radius,radius*(material>.96 ? 2.8 : .65+hash(seed+8.0)*.65));
 shape.y*=mix(1.0,.35,smoothstep(0.0,.06,ground));
 float angle=hash(seed+9.0)*6.28318+t*(hash(seed+10.0)-.5)*9.0;
 mat2 rotation=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
 vec2 position=mix(intact,point+rotation*(aCorner*shape),release);
 vUV=uUvOrigin+aPosition.x*uUvX+aPosition.y*uUvY;
 vCenterUV=uUvOrigin+aCenter.x*uUvX+aCenter.y*uUvY;
 vCorner=aCorner;vRelease=release;vSeed=seed;
 float life=.72+hash(seed+11.0)*.80;
 vFade=1.0-smoothstep(life*.58,life,t);
 vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(position,1.0);
 gl_Position=vec4(p.xy,0.0,1.0);
}`;

export const GORE_FRAGMENT = `
precision highp float;
in vec2 vUV;
in vec2 vCenterUV;
in vec2 vCorner;
in float vRelease;
in float vFade;
in float vSeed;
out vec4 finalColor;
uniform sampler2D uFigure;
uniform vec4 uColor;
uniform float uTime;
${hash}
void main() {
 vec4 art=texture(uFigure,vUV);
 float sourceAlpha=mix(art.a,texture(uFigure,vCenterUV).a,vRelease);
 float edge=1.0-smoothstep(.65,1.04,length(vCorner*vec2(1.0,.88))+.12*sin(vCorner.x*8.0+vSeed));
 float alpha=sourceAlpha*mix(1.0,edge,vRelease)*vFade*uColor.a;
 if(alpha<.004) discard;
 vec3 original=art.rgb/max(art.a,.001);
 vec3 flesh=mix(vec3(.23,.004,.018),vec3(.65,.025,.070),hash(vSeed+31.0));
 float light=sqrt(max(0.0,1.0-dot(vCorner*.72,vCorner*.72)));
 flesh*=.48+light*.78;
 float wet=pow(max(0.0,1.0-length(vCorner-vec2(-.26,.32))),13.0)*.35;
 flesh+=vec3(.72,.30,.24)*wet;
 float crush=exp(-uTime*28.0)*.28;
 vec3 color=mix(original,mix(flesh,vec3(.65,.035,.055),crush),vRelease);
 finalColor=vec4(color*uColor.rgb*alpha,alpha);
}`;

export const GORE_MIST_VERTEX = `
precision highp float;
in vec2 aPosition;
in vec2 aUV;
out vec2 vPoint;
${transforms}
void main() {
 vPoint=aUV;
 vec3 p=uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0);
 gl_Position=vec4(p.xy,0.0,1.0);
}`;

export const GORE_MIST_FRAGMENT = `
precision highp float;
in vec2 vPoint;
out vec4 finalColor;
uniform vec4 uColor;
uniform float uTime;
uniform float uSeed;
${hash}
float noise(vec2 p) {
 vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(hash(dot(i,vec2(17.0,53.0))),hash(dot(i+vec2(1,0),vec2(17,53))),f.x),
 mix(hash(dot(i+vec2(0,1),vec2(17,53))),hash(dot(i+vec2(1,1),vec2(17,53))),f.x),f.y);
}
void main() {
 float t=uTime;
 vec2 p=vPoint;
 float density=0.0;
 for(int i=0;i<7;i++) {
  float k=float(i),angle=k*2.39996+uSeed;
  vec2 center=vec2(cos(angle),sin(angle)*.62)*(.09+.6*(1.0-exp(-t*7.0)));
  vec2 q=(p-center-vec2(0,t*.16))/vec2(.16+t*.23,.20+t*.19);
  float cloud=exp(-dot(q,q)*2.1);
  float grain=noise(p*17.0+vec2(k*8.0-uSeed,t*-3.0));
  density+=cloud*smoothstep(.12,.78,grain);
 }
 float fade=smoothstep(0.0,.035,t)*(1.0-smoothstep(.22,.80,t));
 float alpha=(1.0-exp(-density*1.7))*.42*fade*uColor.a;
 vec3 blood=mix(vec3(.17,.003,.016),vec3(.43,.015,.035),noise(p*8.0+uSeed));
 finalColor=vec4(blood*uColor.rgb*alpha,alpha);
}`;
