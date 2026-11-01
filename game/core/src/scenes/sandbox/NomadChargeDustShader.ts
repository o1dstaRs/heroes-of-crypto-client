import { BufferImageSource, GlProgram, Shader } from "pixi.js";

/** One owned 32³ periodic density field, shared by all billows and debris. */
export function createChargeNoise(): BufferImageSource {
    const size = 32;
    const data = new Uint8Array(size ** 3 * 4);
    let seed = 912781;
    for (let i = 0; i < data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = data[i + 1] = data[i + 2] = seed >>> 24;
        data[i + 3] = 255;
    }
    return new BufferImageSource({
        resource: data,
        width: size,
        height: size,
        depth: size,
        format: "rgba8unorm",
        addressMode: "repeat",
        scaleMode: "linear",
        alphaMode: "no-premultiply-alpha",
    });
}

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

// Twelve front-to-back volume samples; three density octaves and two light probes.
// Normal premultiplied absorption/scattering, deliberately no additive glow.
const fragment = /* glsl */ `#version 300 es
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform sampler3D uNoise;
uniform float uAge;
uniform float uSeed;
float field(vec3 p){
    vec3 q=p*3.4+vec3(uSeed,uSeed*.73,uSeed*.37)+vec3(.1,-.65,.27)*uAge;
    return .57*texture(uNoise,q/32.).r+.29*texture(uNoise,(q*2.07+13.)/32.).r
        +.14*texture(uNoise,(q*4.13-7.)/32.).r;
}
float density(vec3 p){
    // Offset lobes break the circular silhouette; coherent advection preserves form.
    float n=field(p);
    float lobes=sin(p.x*5.+uSeed)*sin(p.y*4.-uSeed)*.065;
    float envelope=1.-length(p*vec3(1.,1.04,1.12))+lobes;
    return smoothstep(-.07,.34,envelope+(n-.5)*.65)*(.12+1.05*n);
}
void main(){
    vec2 xy=vUV*2.-1.;
    if(dot(xy,xy)>1.22) discard;
    float birth=smoothstep(0.,.055,uAge);
    float fade=pow(1.-uAge,1.6)*birth;
    vec3 rgb=vec3(0.); float transmittance=1.;
    const float stepSize=2.2/12.;
    for(int i=0;i<12;i++){
        vec3 p=vec3(xy,1.1-(float(i)+.5)*stepSize);
        float d=density(p);
        float lightDepth=density(p+vec3(-.20,.28,.22))*.65
            +density(p+vec3(-.43,.60,.48))*.35;
        float light=exp(-lightDepth*2.8);
        vec3 color=mix(vec3(.245,.213,.166),vec3(.69,.625,.51),light);
        // Ambient fill and forward scatter make thin edges lighter than the core.
        color+=vec3(.095,.087,.07)*(1.-d);
        float a=1.-exp(-d*stepSize*2.6*fade);
        rgb+=transmittance*a*color;
        transmittance*=1.-a;
    }
    finalColor=vec4(rgb,1.-transmittance)*vColor;
}`;

export function createNomadChargeDustShader(noise: BufferImageSource): Shader {
    return new Shader({
        glProgram: GlProgram.from({
            name: "nomad-charge-volume",
            vertex,
            fragment,
            preferredFragmentPrecision: "highp",
        }),
        resources: {
            uNoise: noise,
            uNoiseSampler: noise.style,
            dust: { uAge: { value: 0, type: "f32" }, uSeed: { value: 0, type: "f32" } },
        },
    });
}

const earthVertex = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
in vec3 aNormal;
out vec3 vNormal;
out vec3 vPoint;
out vec3 vObjectNormal;
out vec3 vLight;
out vec3 vView;
out vec4 vColor;
uniform vec3 uAngles;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec4 uColor;
void main(){
    vec3 s=sin(uAngles),c=cos(uAngles);
    mat3 rx=mat3(1,0,0,0,c.x,s.x,0,-s.x,c.x);
    mat3 ry=mat3(c.y,0,-s.y,0,1,0,s.y,0,c.y);
    mat3 rz=mat3(c.z,s.z,0,-s.z,c.z,0,0,0,1);
    mat3 r=rz*ry*rx;
    vec3 p=r*vec3(aPosition,aUV.x);
    vNormal=r*aNormal; vPoint=vec3(aPosition,aUV.x); vColor=uColor*uWorldColorAlpha;
    vObjectNormal=aNormal; vLight=transpose(r)*normalize(vec3(-.45,.8,.55)); vView=transpose(r)*vec3(0,0,1);
    gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(p.xy,1.)).xy,0.,1.);
}`;
const earthFragment = /* glsl */ `#version 300 es
in vec3 vNormal;
in vec3 vPoint;
in vec3 vObjectNormal;
in vec3 vLight;
in vec3 vView;
in vec4 vColor;
out vec4 finalColor;
uniform sampler3D uNoise;
float relief(vec3 p){return texture(uNoise,(p*8.+5.)/32.).r;}
void main(){
    if(vNormal.z<0.) discard;
    float coarse=texture(uNoise,(vPoint*3.+11.)/32.).r;
    float grain=relief(vPoint);
    float fine=texture(uNoise,(vPoint*26.+17.)/32.).r;
    // Suppress subpixel detail rather than turning rotating grit into sparkling noise.
    float detail=1.-smoothstep(.12,.55,length(fwidth(vPoint)));
    const float e=.035;
    vec3 gradient=vec3(relief(vPoint+vec3(e,0,0))-relief(vPoint-vec3(e,0,0)),
        relief(vPoint+vec3(0,e,0))-relief(vPoint-vec3(0,e,0)),
        relief(vPoint+vec3(0,0,e))-relief(vPoint-vec3(0,0,e)))/(2.*e);
    vec3 n=normalize(vObjectNormal);
    n=normalize(n-(gradient-n*dot(n,gradient))*.16*detail);
    float vein=abs(sin(dot(vPoint,vec3(4.,7.,-3.))+(coarse-.5)*6.));
    float crack=1.-smoothstep(.025,.065+fwidth(vein),vein);
    vec3 earth=mix(vec3(.20,.175,.135),vec3(.49,.435,.33),coarse*.7+grain*.3);
    earth*=1.-crack*.48*detail;
    earth*=.86+.28*mix(.5,fine,detail);
    float light=.27+.73*max(0.,dot(n,normalize(vLight)));
    float roughness=.72+.23*grain;
    float highlight=pow(max(0.,dot(n,normalize(vLight+vView))),mix(24.,5.,roughness));
    vec3 color=earth*(.45+light*.8)+vec3(.055,.05,.042)*highlight*(1.-crack);
    finalColor=vec4(color,1.)*vColor;
}`;
export function createChargeEarthShader(noise: BufferImageSource): Shader {
    return new Shader({
        glProgram: GlProgram.from({ name: "nomad-charge-clods", vertex: earthVertex, fragment: earthFragment }),
        resources: {
            uNoise: noise,
            uNoiseSampler: noise.style,
            earth: { uAngles: { value: new Float32Array(3), type: "vec3<f32>" } },
        },
    });
}
