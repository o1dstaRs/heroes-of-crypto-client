import { GlProgram, Shader } from "pixi.js";
const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
in vec2 aGround;
in float aSpider;
out vec2 vUV;
out vec2 vGround;
flat out float vSpider;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec4 uColor;
void main() {
    vUV = aUV; vGround = aGround; vSpider = aSpider; vColor = uColor * uWorldColorAlpha;
    gl_Position = vec4((uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.)).xy, 0., 1.);
}`;
const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
in vec2 vGround;
flat in float vSpider;
in vec4 vColor;
out vec4 finalColor;
uniform float uTime;
uniform float uReveal;
uniform vec4 uBounds;
uniform vec4 uJoints[128];
uniform vec4 uBody[8];
uniform vec4 uAbdomen[8];
// Analytic rounded limb segments and ellipsoids provide surface normals as
// well as silhouettes. The same joint coordinates drive all three leg bones.
vec3 surfaceNormal;
float surfaceAlong;
float surfacePart;
vec2 surfaceUV;
void limb(vec2 p, vec2 a, vec2 b, float ra, float rb, inout float dist) {
    vec2 ab=b-a;
    float t=clamp(dot(p-a,ab)/dot(ab,ab),0.,1.);
    vec2 v=p-a-ab*t;
    float radius=mix(ra,rb,t);
    float d=length(v)-radius;
    if(d<dist) {
        dist=d;
        vec2 xy=v/radius;
        surfaceNormal=normalize(vec3(xy,sqrt(max(.03,1.-dot(xy,xy)))));
        surfaceAlong=t;
        surfacePart=0.;
    }
}
void shell(vec2 p,vec2 center,vec2 size,float part,inout float dist) {
    vec2 q=(p-center)/size;
    float d=(length(q)-1.)*min(size.x,size.y);
    if(d<dist) {
        dist=d;
        surfaceNormal=normalize(vec3(q,sqrt(max(.02,1.-dot(q,q)))));
        surfacePart=part;
        surfaceUV=p+(part<1.5?vec2(0.,.035):vec2(0.));
        surfaceAlong=p.y;
    }
}
float anatomy(vec2 p) {
    surfaceNormal=vec3(0.,0.,1.); surfaceAlong=0.; surfacePart=0.;
    int spider=int(vSpider);
    vec4 motion=uBody[spider];
    vec4 abdomen=uAbdomen[spider];
    float d=10.;
    for(int leg=0;leg<8;leg++) {
        vec4 upper=uJoints[spider*16+leg*2];
        vec4 lower=uJoints[spider*16+leg*2+1];
        limb(p,upper.xy,upper.zw,.037,.027,d);
        limb(p,upper.zw,lower.xy,.024,.014,d);
        limb(p,lower.xy,lower.zw,.014,.004,d);
    }
    float c=cos(motion.z),s=sin(motion.z);
    vec2 torso=mat2(c,-s,s,c)*(p-motion.xy);
    limb(torso,vec2(-.055,-.235),vec2(-.095,-.35),.026,.012,d);
    limb(torso,vec2(.055,-.235),vec2(.095,-.35),.026,.012,d);
    // The abdomen follows through at the pedicel; it never floats off the torso.
    vec2 pivot=motion.xy+mat2(c,s,-s,c)*vec2(0.,.035);
    float ac=cos(abdomen.y),as=sin(abdomen.y);
    vec2 belly=mat2(ac,-as,as,ac)*(p-pivot);
    belly.x-=abdomen.x*.20*smoothstep(0.,.40,belly.y);
    shell(belly,vec2(0.,.155),vec2(.257*cos(motion.w),.31),1.,d);
    shell(torso,vec2(0.,-.13),vec2(.155*cos(motion.w),.18),2.,d);
    return d;
}
void main() {
    if(vGround.x<uBounds.x||vGround.y<uBounds.y||vGround.x>uBounds.z||vGround.y>uBounds.w) discard;
    vec2 p=vUV;

    float aa=max(length(fwidth(p))*.5,.006);
    float shadow=(1.-smoothstep(-aa,aa*2.5,anatomy(p-vec2(.045,.065))))*.38;
    float d=anatomy(p);
    vec3 n=surfaceNormal;
    float tilt=uBody[int(vSpider)].w;
    if(surfacePart>.5) n=vec3(n.x*cos(tilt)+n.z*sin(tilt),n.y,n.z*cos(tilt)-n.x*sin(tilt));
    float part=surfacePart, along=surfaceAlong;
    vec2 materialUV=part>.5?surfaceUV:p;
    // Fine bristles roughen the silhouette without detaching from the limbs.
    float bristle=pow(.5+.5*sin(p.x*617.+sin(p.y*397.)*3.),6.)*.008;
    float body=1.-smoothstep(-aa,aa,d-bristle);
    vec3 light=normalize(vec3(-.6,-.7,1.1));
    float diffuse=max(0.,dot(n,light));
    float spec=pow(max(0.,dot(n,normalize(light+vec3(0.,0.,1.)))),24.);
    float bands=.67+.33*smoothstep(.1,.6,abs(sin(along*13.)));
    vec3 albedo=vec3(.29,.20,.105)*bands;
    if(part>.5) {
        float chevron=pow(.5+.5*cos((materialUV.y+abs(materialUV.x)*.65)*57.),4.);
        float stripe=exp(-pow(materialUV.x/.052,2.));
        albedo=mix(vec3(.095,.060,.029),vec3(.45,.31,.16),chevron*.28+stripe*.18);
        if(part>1.5) albedo=vec3(.17,.115,.065)*(1.-.32*stripe);
    }
    float hair=.5+.5*sin(p.y*361.+sin(p.x*283.)*2.);
    vec3 chitin=albedo*(.4+diffuse*1.4)+vec3(.48,.46,.38)*spec;
    chitin+=vec3(.16,.135,.09)*hair*pow(1.-max(0.,n.z),3.)*.28;
    // Tiny paired glassy eyes, lit by the same upper-left source as the silk.
    float eyes=exp(-dot((materialUV-vec2(-.046,-.237))*110.,(materialUV-vec2(-.046,-.237))*110.))
              +exp(-dot((materialUV-vec2(.046,-.237))*110.,(materialUV-vec2(.046,-.237))*110.));
    chitin+=eyes*step(1.5,part)*vec3(.55,.51,.40);
    vec3 rgb=chitin*body+vec3(.015,.012,.01)*shadow*(1.-body);
    float alpha=body+shadow*(1.-body);
    finalColor=vec4(rgb,alpha)*smoothstep(.45,1.,uReveal)*vColor;
}`;
export function createArachnaWebSpiderShader(): Shader {
    return new Shader({
        glProgram: GlProgram.from({ name: "arachna-running-spiders", vertex, fragment }),
        resources: {
            silk: {
                uTime: { value: 0, type: "f32" },
                uReveal: { value: 0, type: "f32" },
                uBounds: { value: new Float32Array(4), type: "vec4<f32>" },
                uJoints: { value: new Float32Array(512), type: "vec4<f32>", size: 128 },
                uBody: { value: new Float32Array(32), type: "vec4<f32>", size: 8 },
                uAbdomen: { value: new Float32Array(32), type: "vec4<f32>", size: 8 },
            },
        },
    });
}
