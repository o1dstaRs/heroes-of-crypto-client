import { waterShieldSprayFunctions } from "./WaterShieldSprayShader";

/** Transparent liquid shell; a separate local filter refracts the actual scene behind it. */
export const waterShieldVertex = /* glsl */ `#version 300 es
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

/** Shared optical surface: geometry and background displacement must use the same waves. */
export const waterSurfaceFunctions = /* glsl */ `
vec2 waterPoint(vec2 uv,float radius){return (uv-vec2(.48,.515))/vec2(radius,.495);}
vec3 waterWaves(vec2 p,float t){
    float a=dot(p,vec2(4.3,3.1))-t*1.14;
    float b=dot(p,vec2(-3.4,5.2))+t*.89;
    float c=dot(p,vec2(10.2,-7.6))-t*1.72;
    float d=dot(p,vec2(15.3,12.1))+t*2.05;
    float height=sin(a)*.017+sin(b)*.012+sin(c)*.004+sin(d)*.003;
    vec2 slope=vec2(4.3,3.1)*cos(a)*.017+vec2(-3.4,5.2)*cos(b)*.012
        +vec2(10.2,-7.6)*cos(c)*.004+vec2(15.3,12.1)*cos(d)*.003;
    return vec3(height,slope);
}
// A growing opening retracts the wet film; the same cutout gates real scene refraction.
float waterTear(vec2 p,float age){
    vec2 q=p-vec2(.30,-.28);
    float angle=atan(q.y,q.x);
    float opening=max(0.,age-.025)*7.4;
    return length(q)-opening+sin(angle*3.+age*12.)*.035+sin(angle*5.-age*9.)*.018;
}
float waterRemaining(vec2 p,float age){
    if(age<0.)return 1.;
    float tear=waterTear(p,age);
    return smoothstep(-.025,.025,tear)*(1.-smoothstep(.20,.40,age));
}`;

export const waterShieldFragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uTime;
uniform float uRadiusX;
uniform float uFront;
uniform float uBurst;
uniform float uGroundY;

${waterSurfaceFunctions}
${waterShieldSprayFunctions}
float sq(float x){return x*x;}
void main(){
    float t=uTime;
    // An enclosed ellipsoid, independent of the creature silhouette. The cap stays below the flag.
    vec2 p=waterPoint(vUV,uRadiusX);
    // Once the shell is gone, avoid evaluating its material or retaining a scene-color copy.
    if(uBurst>=.40){finalColor=waterSpray(p,uBurst,uGroundY,uFront)*vColor;return;}
    vec3 waves=waterWaves(p,t);
    float wave=waves.x;
    vec2 slope=waves.yz;
    float b=dot(p,vec2(-3.4,5.2))+t*.89;
    float r=length(p);
    float surface=r-wave;
    float aa=max(fwidth(surface),.002);
    float mask=1.-smoothstep(1.-aa,1.+aa,surface);
    if(mask<.001 && uBurst<0.){finalColor=vec4(0.);return;}
    float z=sqrt(max(.0001,1.-sq(min(surface,.9999))));
    vec3 n=normalize(vec3(p-slope*1.8,z));
    vec3 view=vec3(0.,0.,1.);
    vec3 reflected=reflect(-view,n);
    float fresnel=.0204+.9796*pow(1.-max(n.z,0.),5.);

    // Broad softbox and warm opposing environment lobes give the clear surface curved volume.
    float key=exp(-sq((reflected.x+.56)/.32)-sq((reflected.y+.49)/.72));
    float strip=exp(-sq((reflected.x+.72+sin(reflected.y*4.+t*.4)*.045)/.085)-sq((reflected.y+.1)/.78));
    float fill=exp(-sq((reflected.x-.68)/.24)-sq((reflected.y-.34)/.65));
    float crown=exp(-sq((p.y+.81+wave*1.8)/.075)-sq((p.x+.15)/.57));
    float lip=exp(-sq((surface-.968)/max(.024,aa*.7)));
    float innerLip=exp(-sq((surface-.926)/.025));
    float edgeLight=clamp(.38-p.x*.28-p.y*.36,0.,1.);
    float folds=sin(p.x*7.3+p.y*5.6-t*1.45+sin(b)*.6)+sin(p.x*-4.8+p.y*8.1-t*2.10);
    float caustic=exp(-sq(folds/max(.24,fwidth(folds)*.8)))*(.2+.8*sq(1.-z));
    float lower=exp(-sq((p.y-.82)/.14)-sq(p.x/.65));

    // Continuous downward advection replaces the old reversing/pendulum sheet motion.
    // Broad water folds and their offset lips travel together along the sides, leaving the center clear.
    float flowPhase=p.y*4.4+.65*sin(p.x*3.4-t*.45)-t*1.45;
    float sheet=pow(.5+.5*cos(flowPhase),8.)*smoothstep(.24,.82,abs(p.x));
    float sheetLip=exp(-sq(sin((flowPhase+.32)*.5)/max(.09,fwidth(flowPhase)*.25)))
        *smoothstep(.32,.88,abs(p.x));
    float cap=exp(-sq((p.y+.77+wave*2.)/.12)-sq((p.x+.10)/.66));
    float foot=exp(-sq((p.y-.84-wave)/.075)-sq(p.x/.50));
    // A bounded set of buoyant microbubbles. Finite fades hide recycle and no CPU particles are allocated.
    float beads=0.,beadLight=0.;
    for(int i=0;i<7;i++){
        float seed=float(i);
        float life=fract(t*(.12+seed*.006)+seed*.618034);
        float y=.82-life*1.60;
        float side=mod(seed,2.)*2.-1.;
        float x=side*(.44+.12*sin(seed*2.4+t*.45))*sqrt(max(.05,1.-y*y));
        vec2 delta=(p-vec2(x,y))/vec2(.029,.022);
        float d=length(delta);
        float fade=smoothstep(0.,.16,life)*(1.-smoothstep(.78,1.,life));
        float edge=exp(-sq((d-.70)/.30))*fade;
        float highlight=exp(-dot(delta-vec2(-.27,-.33),delta-vec2(-.27,-.33))*5.)*fade;
        beads+=edge;
        beadLight+=highlight;
    }

    float base=.018+.045*(1.-z)+innerLip*.035+lower*.035;
    float reflection=key*.34+strip*.65+fill*.20+crown*.30;
    float flowing=sheet*.16+sheetLip*.27+cap*.13+foot*.22;
    float opacity=base+fresnel*.43+lip*(.13+.31*edgeLight)+reflection+caustic*.15+flowing;
    vec3 water=mix(vec3(.025,.19,.22),vec3(.10,.58,.66),1.-z);
    vec3 light=vec3(.78,.95,1.)*(key*.34+strip*.65+crown*.30)
        +vec3(.54,.70,.67)*fill*.20+vec3(.35,.84,.91)*(lip*.40*edgeLight+caustic*.15)
        +vec3(.33,.85,.94)*(sheet*.16+cap*.13)+vec3(.78,.97,1.)*(sheetLip*.27+foot*.22);
    vec3 color=(water*base+light+vec3(.23,.72,.82)*fresnel*.43)/max(opacity,.001);
    // Rear hemisphere is subdued and fully occluded by the real sprite.
    opacity*=mix(.14,.62,uFront);
    opacity=clamp(opacity,0.,.84);
    vec3 rgb=color*opacity;
    float beadOpacity=clamp((beads*.26+beadLight*.79)*uFront,0.,.62);
    rgb=rgb*(1.-beadOpacity)+vec3(.69,.95,1.)*beadOpacity;
    opacity=opacity+(1.-opacity)*beadOpacity;
    // A clear viewing window across the face and torso, with the original wet edge left intact.
    float clarity=mix(.06,1.,smoothstep(.55,.91,surface));
    rgb*=clarity;
    opacity*=clarity;
    float remaining=waterRemaining(p,uBurst);
    vec4 film=vec4(rgb,opacity)*mask*remaining;
    if(uBurst>=0.){
        float age=uBurst;
        float tear=waterTear(p,age);
        float retract=exp(-sq(tear/max(.045,fwidth(tear))))*mask
            *(1.-smoothstep(.20,.38,age))*.56;
        float rimAlpha=retract*mix(.28,1.,uFront);
        film=vec4(vec3(.64,.91,.98)*rimAlpha,rimAlpha)+film*(1.-rimAlpha);
        vec4 spray=waterSpray(p,age,uGroundY,uFront);
        film=spray+film*(1.-spray.a);
    }
    finalColor=film*vColor;
}`;
