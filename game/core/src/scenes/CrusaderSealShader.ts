import { GlProgram, Shader, type Texture } from "pixi.js";

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
    vUV=aUV;
    vColor=uColor*uWorldColorAlpha;
    gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);
}`;

const fragment = /* glsl */ `#version 300 es
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform sampler2D uSeal;
uniform float uStraightAlpha;
uniform float uTime;
vec4 seal(vec2 uv){
    vec4 s=texture(uSeal,clamp(uv,vec2(.001),vec2(.999)));
    s.rgb*=mix(1.,s.a,uStraightAlpha);
    return s;
}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);
    f=f*f*f*(f*(f*6.-15.)+10.);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void main(){
    vec4 source=seal(vUV);
    vec2 p=(vUV-.5)*2.;
    float r=length(p),angle=atan(p.y,p.x);
    float aa=max(length(fwidth(p))*.6,.0015);
    float inside=1.-smoothstep(.79,.88,r);
    // Local, two-scale emission halo. No scene-wide filter or terrain sampling.
    vec3 halo=vec3(0);
    for(int i=0;i<8;i++){
        float a=float(i)*.785398163;
        vec2 d=vec2(cos(a),sin(a));
        vec3 nearLight=seal(vUV+d*.004).rgb;
        vec3 farLight=seal(vUV+d*.012).rgb;
        halo+=max(nearLight-vec3(.14,.045,.01),vec3(0))*.013;
        halo+=max(farLight-vec3(.16,.05,.01),vec3(0))*.007;
    }
    // 1. A narrow highlight travels along the existing blade only.
    float blade=1.-smoothstep(.085,.15,abs(p.x));
    float sweep=fract(uTime*.14)*2.4-1.2;
    float glint=exp(-pow((p.y+p.x*.25-sweep)/.055,2.))*blade;
    vec3 light=halo+source.rgb*glint*.19;
    // 2. A slowly travelling highlight follows the existing circle texture.
    float rim=smoothstep(.80,.84,r)*(1.-smoothstep(.86,.90,r));
    float orbit=pow(max(0.,cos(angle-uTime*.42)),24.);
    light+=source.rgb*rim*orbit*.16;
    // 3. Two coherent low-frequency layers give the light a soft moving haze.
    float haze=noise(p*4.2+vec2(uTime*.038,-uTime*.026))*.65
              +noise(p*8.1+vec2(-uTime*.022,uTime*.031))*.35;
    light+=vec3(1.,.24,.025)*pow(haze,3.)*inside*.045*(1.-blade*.65);
    // 4. Sparse embers with a soft lifetime and short tangential trails.
    float sparks=0.;
    for(int i=0;i<14;i++){
        float seed=float(i);
        float age=fract(uTime*(.12+hash(vec2(seed,2))*.06)+hash(vec2(seed,9)));
        float a=seed*2.399963+uTime*.07;
        vec2 dir=vec2(cos(a),sin(a)),tangent=vec2(-dir.y,dir.x);
        vec2 delta=p-dir*(.28+hash(vec2(seed,5))*.40+age*.13);
        float width=max(.0025,aa);
        float across=dot(delta,dir)/width;
        float along=dot(delta,tangent);
        float core=exp(-dot(delta,delta)/(width*width));
        float trail=exp(-across*across-pow((along+.011)/.016,2.))*.24;
        float life=pow(sin(age*3.14159265),2.);
        sparks+=(core+trail)*life;
    }
    light+=vec3(1.,.50,.12)*sparks*.38*inside;
    // 5. A broad, faint wave passes through the existing field, never its boundary.
    float phase=fract(uTime*.10);
    float wave=exp(-pow((r-(.12+phase*.70))/.045,2.))*sin(phase*3.14159265);
    light+=source.rgb*wave*.065*inside;
    // 6. Broad rotating illumination crosses the whole field, preserving its art.
    vec2 flow=vec2(cos(uTime*.18),sin(uTime*.18));
    float wash=exp(-pow((dot(p,flow)-.24*sin(uTime*.31))/.32,2.));
    light+=(source.rgb+halo)*wash*.045*inside;
    // 7. Soft ambient spill extends through the existing transparent margin.
    // Its radius is fixed: neither painted geometry nor gameplay reach expands.
    float spill=exp(-pow((r-.835)/.075,2.))*(1.-smoothstep(.91,.98,r));
    light+=vec3(1.,.27,.035)*spill*(.014+.006*haze);
    // Limit added radiance without recolouring the approved master. vColor applies
    // the shared mesh opacity AFTER all present and future effect layers.
    light=light/(vec3(1.)+light*.7);
    // 8. Slow coherent breathing modulates the entire seal, including all effects.
    // Dimming only: the peak never cancels the user's accumulated transparency.
    float breath=.975+.025*sin(uTime*.785398163);
    float coverage=max(source.a,max(light.r,max(light.g,light.b)));
    finalColor=vec4(source.rgb+light,coverage)*vColor*breath;
}`;

/** Source cutout plus local light; rotation is handled only by projected mesh UVs. */
export function createCrusaderSealShader(texture: Texture): Shader {
    return new Shader({
        glProgram: GlProgram.from({
            name: "crusader-single-runic-seal",
            vertex,
            fragment,
            preferredFragmentPrecision: "highp",
        }),
        resources: {
            uSeal: texture.source,
            uSealSampler: texture.source.style,
            aura: {
                uTime: { value: 0, type: "f32" },
                uStraightAlpha: { value: texture.source.alphaMode === "no-premultiply-alpha" ? 1 : 0, type: "f32" },
            },
        },
    });
}
