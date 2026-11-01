import { GlProgram, Shader, Texture } from "pixi.js";

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

const common = /* glsl */ `
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uTime;
const float TAU=6.28318530718;
float hash(vec3 p){
    p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);
}
float noise(vec3 p){
    vec3 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
                   mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                   mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){return noise(p)*.64+noise(p*2.03+13.4)*.26+noise(p*4.11+31.7)*.10;}
float envelope(float h){return smoothstep(0.,.12,h)*(1.-smoothstep(.84,1.,h));}
`;

// Golden light and feather streams projected entirely onto the battlefield floor.
const wind = /* glsl */ `#version 300 es
${common}
void main(){
    float angle=vUV.x*TAU,h=vUV.y;
    float flow=angle+uTime*.26-h*1.6;
    vec3 field=vec3(cos(flow)*2.7,sin(flow)*2.7,h*4.-uTime*.09);
    float broad=fbm(field),fine=fbm(field*1.8+vec3(0.,0.,uTime*.12));
    float fade=smoothstep(0.,.045,h)*(1.-smoothstep(.79,1.,h));
    float cloud=smoothstep(.30,.75,broad)*(.6+.4*fine);
    // Low-opacity warm scattering leaves the stone and individual feather silhouettes readable.
    // Continuous illumination spans the whole annulus; currents only sculpt its surface.
    float density=(.06+cloud*.075)*fade;
    vec3 color=mix(vec3(.65,.24,.045),vec3(1.,.69,.32),fine);
    // One connected current with uneven shoulders: no periodic concentric contours.
    // Integer angular harmonics preserve the seam while noise folds the light into the mist.
    float drift=angle+uTime*.16;
    float meander=.085*sin(drift*3.+.8*sin(drift*2.))
                 +.035*sin(drift*7.-uTime*.11)+.25*(broad-.5);
    float center=.51+meander;
    float width=.14+.09*cloud+.025*sin(drift*4.+fine*3.);
    float offset=h-center;
    float body=exp(-pow(offset/width,2.));
    float mist=exp(-pow(offset/(width*1.9),2.));
    float folded=offset+.055*sin(drift*5.+fine*6.)+.11*(fine-.5);
    float sheen=exp(-pow(folded/(width*.48),2.));
    float current=(body*(.36+.40*cloud)+sheen*(.16+.18*fine))*fade;
    float veil=mist*(.46+.54*fine)*fade;
    float spill=(.14+.075*(1.-h))*(.82+.18*broad)*fade;
    vec3 light=vec3(1.,.72,.38)*current*.26+vec3(1.,.47,.16)*veil*.10;
    light+=vec3(1.,.66,.29)*spill;
    // A soft release every 3.8 seconds travels across the whole floor aura.
    float cycle=uTime/3.8;
    float pulse=pow(.5+.5*cos(cycle*TAU),3.);
    float front=fract(cycle)*1.65-.22;
    float waveOffset=h-front+.065*(broad-.5)+.025*sin(angle*5.+uTime*.3);
    float crest=exp(-pow(waveOffset/.075,2.));
    float halo=exp(-pow(waveOffset/.22,2.));
    float waveFade=smoothstep(-.20,.04,front)*(1.-smoothstep(.96,1.40,front));
    float energy=(crest*.24+halo*.14)*waveFade*fade*(.75+.25*fine);
    // Broad rotating gleams sit inside the luminous field, not above the floor.
    float gleam=pow(.5+.5*sin(angle*7.+h*5.-uTime*.35+broad*3.),8.);
    light=(color*density+light)*(.46+.44*pulse);
    light+=vec3(1.,.76,.36)*energy;
    light+=vec3(1.,.88,.57)*gleam*halo*waveFade*fade*.10;
    float peak=max(light.r,max(light.g,light.b));
    finalColor=vec4(light,min(.96,peak))*vColor;
}`;

const feathers = /* glsl */ `#version 300 es
${common}
uniform sampler2D uFeathers;
uniform float uReady;
uniform float uStraightAlpha;
// Real feather artwork replaces analytic leaf shapes; deformation stays within the floor plane.
vec4 feather(vec2 p,float seed,float flutter){
    // Preserve the textured barbs: mild rolling changes the light, not a thick luminous outline.
    float roll=.84+.16*sin(flutter+seed*TAU);
    float tilt=.10*(seed-.5)+.15*sin(flutter*.53+seed*17.);
    p=mat2(cos(tilt),-sin(tilt),sin(tilt),cos(tilt))*p;
    p/=.76+.24*seed;
    p.y/=roll;
    p.y+=.038*sin(p.x*5.+flutter)*smoothstep(-.4,.4,p.x);
    vec2 q=p/vec2(.94,.46)+.5;
    float inside=step(0.,q.x)*step(q.x,1.)*step(0.,q.y)*step(q.y,1.);
    float variant=floor(seed*3.999);
    vec2 tile=vec2(mod(variant,2.),floor(variant/2.));
    vec2 uv=(tile+clamp(q,vec2(.002),vec2(.998)))*.5;
    vec4 c=texture(uFeathers,uv);
    c.rgb*=mix(1.,c.a,uStraightAlpha);
    float gleam=pow(max(0.,sin(q.x*3.8-flutter*.7+seed*TAU)),12.);
    c.rgb*=vec3(1.10,1.03,.90)*(.84+.16*sin(flutter*.6+seed*11.));
    c.rgb+=vec3(1.,.87,.61)*gleam*c.a*.14;
    // Small alpha taps make a soft champagne edge, without blurring away the barbs.
    float halo=(texture(uFeathers,uv+vec2(0.,.0025)).a+texture(uFeathers,uv-vec2(0.,.0025)).a)*.5;
    c.rgb+=vec3(1.,.73,.38)*max(0.,halo-c.a)*.15;
    return c*inside;
}
vec4 featherLane(float count,float rows,float speed,float z,float density){
    float h=vUV.y;
    // Shared slow eddies keep the small feathers in one current; lane speeds supply gentle shear.
    float eddy=.007*sin(vUV.x*TAU*3.+uTime*.43+z);
    vec2 uv=vec2((vUV.x+uTime*speed+h*.13+z*.17+eddy)*count,
                 h*rows+.045*sin(vUV.x*TAU*2.-uTime*.6+z));
    vec2 cell=floor(uv),local=fract(uv)-.5;
    vec4 result=vec4(0.);
    // Small bounded neighbour search avoids popping when a feather flutters across a cell edge.
    for(int i=-1;i<=1;i++){
        vec2 id=cell+vec2(float(i),0.);
        float seed=hash(vec3(mod(id.x,count),id.y,z));
        vec2 jitter=vec2(seed-.5,hash(vec3(mod(id.x,count),id.y,z+9.))-.5)*vec2(.40,.22);
        float life=.90+.10*sin(uTime*.47+seed*TAU);
        vec2 p=(local-vec2(float(i),0.)-jitter);
        p.y-=.035*sin(uTime*(1.1+seed*.5)+seed*TAU);
        vec4 f=feather(p,seed,uTime*(1.1+seed*.55)+z)*step(1.-density,seed)*life;
        result=f+result*(1.-f.a);
    }
    return result*envelope(h);
}
void main(){
    if(uReady<.5){finalColor=vec4(0.);return;}
    vec4 large=featherLane(36.,5.,.062,1.,.65);
    vec4 small=featherLane(54.,7.,.076,3.,.25)*.88;
    vec4 feathers=large+small*(1.-min(1.,large.a));
    // Free golden dust, separate from feather motion, with finite soft lifetimes.
    vec2 uv=vec2(fract(vUV.x+uTime*.12+vUV.y*.22)*81.,vUV.y*27.);
    vec2 id=floor(uv),d=fract(uv)-.5;
    float seed=hash(vec3(id,6.));
    float pulse=pow(max(0.,sin(uTime*1.25+seed*TAU)),4.)*step(.60,seed);
    float size=max(.055,length(fwidth(uv))*.33);
    float mote=exp(-dot(d,d)/(size*size));
    float trail=exp(-abs(d.y)*29.-abs(d.x)*7.)*.24;
    float spark=(mote+trail)*pulse*envelope(vUV.y)*.86;
    float star=(exp(-abs(d.x)*65.-abs(d.y)*8.)+exp(-abs(d.y)*65.-abs(d.x)*8.))*pow(pulse,2.)*step(.94,seed)*envelope(vUV.y)*.18;
    vec3 light=mix(vec3(1.,.50,.12),vec3(1.,.89,.61),seed)*spark+vec3(1.,.93,.72)*star;
    finalColor=vec4(feathers.rgb+light,min(.98,feathers.a+spark*.55))*vColor;
}`;

function makeShader(name: string, fragment: string): Shader {
    return new Shader({
        glProgram: GlProgram.from({ name, vertex, fragment }),
        resources: { aura: { uTime: { value: 0, type: "f32" } } },
    });
}
export function createPegasusWindShader(): Shader {
    return makeShader("pegasus-golden-wind", wind);
}
export function createPegasusFeatherShader(texture: Texture = Texture.EMPTY): Shader {
    return new Shader({
        glProgram: GlProgram.from({ name: "pegasus-detailed-feathers-v7", vertex, fragment: feathers }),
        resources: {
            uFeathers: texture.source,
            uFeathersSampler: texture.source.style,
            aura: {
                uTime: { value: 0, type: "f32" },
                uReady: { value: texture === Texture.EMPTY ? 0 : 1, type: "f32" },
                uStraightAlpha: { value: texture.source.alphaMode === "no-premultiply-alpha" ? 1 : 0, type: "f32" },
            },
        },
    });
}
