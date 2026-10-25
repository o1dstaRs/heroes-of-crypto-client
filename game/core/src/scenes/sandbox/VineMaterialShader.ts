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
    vUV=aUV; vColor=uColor*uWorldColorAlpha;
    gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);
}`;

const bark = /* glsl */ `#version 300 es
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform sampler2D uVine;
uniform float uTime;
uniform float uLife;
uniform float uStraightAlpha;
uniform vec2 uTexel;
float relief(vec2 uv){vec4 c=texture(uVine,uv);return dot(c.rgb,vec3(.25,.55,.20));}
void main(){
    vec4 art=texture(uVine,vUV);
    vec3 straight=art.rgb/max(art.a,.001);
    straight=mix(straight,art.rgb,uStraightAlpha);
    // Illuminate only the painted warm cracks; transparent pixels and moss stay intact.
    float ember=smoothstep(.06,.30,straight.r-max(straight.g,straight.b))
               *smoothstep(.18,.60,straight.r);
    // Image-space relief stays attached to the painted bark, never swims with a world noise map.
    vec2 gradient=vec2(relief(vUV+vec2(uTexel.x,0.))-relief(vUV-vec2(uTexel.x,0.)),
                       relief(vUV+vec2(0.,uTexel.y))-relief(vUV-vec2(0.,uTexel.y)));
    vec3 normal=normalize(vec3(-gradient*1.8,1.));
    float diffuse=dot(normal,normalize(vec3(-.35,.45,1.)));
    float slow=sin(uTime*.91-vUV.x*4.7+sin(vUV.x*13.)*.8);
    float breath=.30+.16*slow+.10*sin(uTime*1.37+vUV.x*17.);
    float sap=pow(max(0.,sin(vUV.x*6.3-uTime*.85+sin(vUV.x*11.)*.3)),14.);
    vec3 color=straight*vColor.rgb*(.88+diffuse*.15);
    color+=vec3(1.,.24,.045)*ember*(breath+sap*.75)*uLife;
    // Broad, low-energy grazing highlights; no glitter or metallic white edges.
    float rim=pow(max(0.,dot(normal,normalize(vec3(.22,.26,1.)))),24.);
    color+=vec3(.14,.105,.065)*rim*(.5+.5*slow)*straight*(1.-ember)*uLife;
    finalColor=vec4(color*art.a,art.a)*vColor.a;
}`;

const particle = /* glsl */ `#version 300 es
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uAge;
uniform float uSeed;
uniform float uKind;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float field(vec2 p){return noise(p)*.68+noise(p*2.07+8.)*.32;}
void main(){
    vec2 p=vUV*2.-1.; float r=length(p);
    if(r>=1.) discard;
    float a; vec3 color;
    if(uKind<.5){
        // Coherent rising lobes, soft finite edges and local density shading. Ordinary alpha soil.
        vec2 q=p*2.8+vec2(uSeed,uSeed*.37-uAge*.8);
        float n=field(q);
        float density=smoothstep(.14,.76,n)*(1.-smoothstep(.22,1.,r));
        float shade=clamp(.48+(field(q+vec2(-.18,.24))-n)*2.7+p.y*.13,.1,.9);
        color=mix(vec3(.075,.047,.025),vec3(.65,.49,.29),shade);
        a=(1.-exp(-density*2.5))*sin(min(1.,uAge*5.)*1.5708)*pow(1.-uAge,1.4)*.76;
    }else if(uKind<1.5){
        float edge=max(abs(p.x)*.85+abs(p.y)*.45,abs(p.y)*.88- p.x*.20);
        a=1.-smoothstep(.66,.78,edge);
        color=mix(vec3(.075,.041,.018),vec3(.33,.23,.115),clamp(.46+p.y*.35-p.x*.22,0.,1.));
        a*=1.-smoothstep(.55,1.,uAge);
    }else if(uKind<2.5){
        float core=exp(-r*r*100.);
        float halo=exp(-r*r*9.)*.24;
        a=(core+halo)*sin(uAge*3.14159);
        color=mix(vec3(1.,.27,.045),vec3(1.,.77,.32),core);
    }else if(uKind<3.5){
        // Sparse smolder curls, not the birth's expanding soil puffs. Continuous domain advection.
        float curl=.26*sin(p.y*5.-uAge*3.+uSeed)+.12*sin(p.y*9.+uAge*2.+uSeed*.3);
        vec2 q=vec2((p.x+curl)*3.8,p.y*2.4-uAge*1.5)+uSeed;
        float broad=field(q);
        float torn=field(q*1.9+vec2(broad*.8,uAge*.4));
        float taper=exp(-pow((p.x+curl)*2.5,2.));
        float envelope=(1.-smoothstep(.25,1.,r))*pow(sin(uAge*3.14159),1.3);
        float density=smoothstep(.25,.78,broad)*(.5+.5*torn)*taper;
        float shade=clamp(.52+(field(q+vec2(-.16,.2))-broad)*2.,.15,.85);
        color=mix(vec3(.14,.155,.13),vec3(.72,.70,.58),shade);
        // Ember-lit base cools to neutral smoke as it rises; smoke uses ordinary alpha.
        color+=vec3(.26,.07,.012)*(1.-uAge)*(1.-smoothstep(-.7,.4,p.y))*.4;
        a=density*envelope*.78;
    }else{
        // Restricted local reflected glow, fixed to its ground contact. No full-screen bloom.
        float grain=.8+.2*field(p*3.+uSeed);
        a=exp(-r*r*5.5)*(1.-smoothstep(.65,1.,r))*pow(sin(uAge*3.14159),2.)*.16*grain;
        color=vec3(1.,.27,.035);
    }
    a*=vColor.a;
    finalColor=vec4(color*vColor.rgb*a,a);
}`;

export function createVineMaterialShader(texture: Texture): Shader {
    return new Shader({
        glProgram: GlProgram.from({ name: "trent-living-bark", vertex, fragment: bark }),
        resources: {
            uVine: texture.source,
            uVineSampler: texture.source.style,
            vine: {
                uTime: { value: 0, type: "f32" },
                uLife: { value: 1, type: "f32" },
                uTexel: { value: new Float32Array([1 / texture.width, 1 / texture.height]), type: "vec2<f32>" },
                uStraightAlpha: { value: texture.source.alphaMode === "no-premultiply-alpha" ? 1 : 0, type: "f32" },
            },
        },
    });
}

export function createVineParticleShader(): Shader {
    return new Shader({
        glProgram: GlProgram.from({ name: "trent-earth-and-spores", vertex, fragment: particle }),
        resources: {
            particle: {
                uAge: { value: 0, type: "f32" },
                uSeed: { value: 0, type: "f32" },
                uKind: { value: 0, type: "f32" },
            },
        },
    });
}
