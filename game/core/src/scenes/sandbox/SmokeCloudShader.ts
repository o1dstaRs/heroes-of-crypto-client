import { BufferImageSource, GlProgram, Shader } from "pixi.js";

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
    vUV=aUV; vColor=uColor*uWorldColorAlpha;
    gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);
}`;

/** Local volume integration: extinction, directional self-shadow, pale edge scattering and soot. */
export const SMOKE_CLOUD_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform sampler3D uNoise;
uniform float uTime;
uniform float uSeed;
uniform float uPresence;
float noise3(vec3 p){return texture(uNoise,p/32.).r;}
float field(vec3 p){
    float angle=uSeed*2.39996;
    p.xy=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.xy;
    vec3 q=p*3.4+vec3(uSeed,uSeed*.73,uSeed*.31)+vec3(-.18,-.25,.11)*uTime;
    // Independent low-frequency displacement axes roll the whole billow.
    // Avoid periodic sine ridges, which read as parallel ribbons at gameplay scale.
    vec3 flow=vec3(noise3(q*.47+11.),noise3(q*.47-7.),noise3(q*.47+19.))-.5;
    q+=flow*1.65;
    return .56*noise3(q)+.26*noise3(q*2.03+11.)+.11*noise3(q*4.11-7.)+.07*noise3(q*8.17+19.);
}
float density(vec3 p){
    // Preserve the reference's cell-sized, softly overlapping envelope.
    float n=field(p);
    float body=1.-length(p*vec3(1.06,1.12,1.12));
    float envelope=smoothstep(-.10,.30,body+(n-.5)*.95);
    float billow=smoothstep(.23,.76,n);
    // Continuous soot within the lobe, with porous edges instead of hollow wispy stripes.
    float core=.12+1.48*pow(billow,1.40);
    float edgeErosion=mix(smoothstep(.19,.53,n),1.,smoothstep(.0,.40,body));
    return envelope*core*edgeErosion;
}
float hash(float x){return fract(sin(x*127.1+uSeed*311.7)*43758.5453);}
void main(){
    vec2 xy=(vUV*2.-1.)*1.24;
    vec3 rgb=vec3(0.);float trans=1.;float depthMoment=0.;
    const float stepSize=2.2/20.;
    // Shared midpoint samples keep reconstructed depth smooth across neighbouring pixels.
    const float jitter=.5;
    for(int i=0;i<20;i++){
        vec3 p=vec3(xy,1.1-(float(i)+jitter)*stepSize);
        float d=density(p);
        if(d>.005){
            float nearLight=density(p+vec3(-.14,.22,.18));
            float farLight=density(p+vec3(-.42,.62,.48));
            float opticalDepth=(nearLight*.65+farLight*.35)*4.5;
            float light=exp(-opticalDepth);
            // One neutral grey palette for absorbing cores, scattered light and lit shoulders.
            vec3 color=mix(vec3(.0345),vec3(.505),light);
            float shoulder=smoothstep(.0,.30,d-nearLight);
            color+=vec3(.046)*shoulder*exp(-farLight*1.8);
            color+=vec3(.026)*(1.-min(d,1.));
            color*=mix(.78,1.05,smoothstep(-.65,.75,p.z));
            float a=1.-exp(-d*stepSize*5.2*uPresence);
            depthMoment+=trans*a*p.z;
            rgb+=trans*a*color;trans*=1.-a;
            if(trans<.015)break;
        }
    }
    // Shade the actual density around the integrated front depth. Wide central differences
    // retain broad billow curvature without magnifying pixel-scale detail into grain.
    float volumeA=1.-trans;
    float meanDepth=depthMoment/max(volumeA,.001);
    vec3 surface=vec3(xy,meanDepth);
    const float e=.18;
    vec3 gradient=vec3(
        density(surface-vec3(e,0.,0.))-density(surface+vec3(e,0.,0.)),
        density(surface-vec3(0.,e,0.))-density(surface+vec3(0.,e,0.)),
        density(surface-vec3(0.,0.,e))-density(surface+vec3(0.,0.,e)));
    vec3 normal=normalize(vec3(gradient.xy,max(.08,gradient.z)));
    float key=max(0.,dot(normal,normalize(vec3(-.45,.62,.70))));
    float relief=smoothstep(.08,.55,volumeA);
    rgb*=mix(1.,.58+.58*key,relief);
    rgb+=vec3(.034)*volumeA*relief*pow(key,3.);
    // Reduce smoke opacity by 15%, then another 10%; match premultiplied colour.
    const float smokeOpacity=.90*.85*.90;
    rgb*=smokeOpacity;float smokeA=volumeA*smokeOpacity;
    vec3 ashRGB=vec3(0.);float ashA=0.;
    // Sparse broad charcoal flakes, medium ash and suspended fines have separate scales.
    // Each trajectory is stable; no frame-random flashes or sprite-sheet popping.
    float pixelWidth=max(length(dFdx(xy)),length(dFdy(xy)));
    for(int i=0;i<36;i++){
        float id=float(i),kind=mod(id,8.);
        float speed=mix(.065,.13,hash(id+4.));
        float phase=fract(uTime*speed+hash(id));
        float swirl=phase*5.5+hash(id+8.)*6.283;
        float lift=-.78+phase*1.78;
        vec2 pos=vec2((hash(id+9.)-.5)*1.3+sin(swirl)*.15+phase*.20,
            lift+cos(swirl*.83)*.07);
        float radius=kind<1.?mix(.075,.125,hash(id+19.)):
            kind<4.?mix(.030,.055,hash(id+19.)):mix(.008,.018,hash(id+19.));
        radius/=3.;
        vec2 delta=xy-pos;
        // Conservative particle bounds avoid surface shading work outside each small flake.
        if(max(abs(delta.x),abs(delta.y))>radius*1.65+pixelWidth*2.)continue;
        float spin=uTime*(.45+hash(id+25.)*.8)+id*2.4;
        float tumble=sin(uTime*(.8+hash(id+27.)*.65)+id);
        delta=mat2(cos(spin),-sin(spin),sin(spin),cos(spin))*delta;
        vec2 local=delta/(radius*vec2(.22+.78*abs(tumble),1.));
        float polar=atan(local.y,local.x);
        float contour=1.+.16*sin(polar*3.+id)+.09*sin(polar*7.-id);
        float sd=length(local*vec2(.85,1.18))-contour;
        // Pixel-footprint antialiasing preserves fine ash without hard sparkling dots.
        float aa=clamp(pixelWidth/radius,.06,.85);
        float coverage=1.-smoothstep(-aa,aa,sd);
        float face=abs(tumble);
        float fold=smoothstep(-.18,.15,local.x+.28*local.y);
        float pores=noise3(vec3(local*5.+id*3.,id+7.));
        float chip=smoothstep(.18,.35,pores+.22*(1.-length(local)));
        float lighting=.34+.46*face+.20*fold;
        vec3 charcoal=mix(vec3(.10,.085,.07),vec3(.76,.72,.64),hash(id+30.));
        vec3 color=charcoal*lighting*(.62+.55*pores);
        // An ash crust and curled edge catch the light; hot fissures occur on very few flakes.
        color+=vec3(.25,.24,.21)*pow(clamp(1.-abs(sd)*4.,0.,1.),2.)*face;
        float ember=1.-step(1.,mod(id,13.));
        float crack=(1.-smoothstep(.025,.13,abs(local.x+.16*sin(local.y*9.+id))))*
            smoothstep(.22,.6,pores)*ember;
        color+=vec3(.84,.23,.035)*crack*(.65+.35*sin(phase*5.));
        float lifetime=smoothstep(0.,.12,phase)*(1.-smoothstep(.72,1.,phase));
        // Distant fragments disappear into the volume; foreground ones stay materially sharp.
        float depth=hash(id+42.);
        float attenuation=exp(-density(vec3(pos,.4))*2.0*(1.-depth));
        float a=coverage*chip*lifetime*uPresence*mix(.48,.96,depth)*attenuation;
        ashRGB=ashRGB*(1.-a)+color*a;ashA=ashA+(1.-ashA)*a;
    }
    finalColor=vec4(rgb*(1.-ashA)+ashRGB,smokeA*(1.-ashA)+ashA)*vColor;

}`;

export function createSmokeCloudShader(noise: BufferImageSource): Shader {
    return new Shader({
        glProgram: GlProgram.from({
            name: "smoke-spell-volume",
            vertex,
            fragment: SMOKE_CLOUD_FRAGMENT,
            preferredFragmentPrecision: "highp",
        }),
        resources: {
            uNoise: noise,
            uNoiseSampler: noise.style,
            smoke: {
                uTime: { value: 0, type: "f32" },
                uSeed: { value: 0, type: "f32" },
                uPresence: { value: 0, type: "f32" },
            },
        },
    });
}
