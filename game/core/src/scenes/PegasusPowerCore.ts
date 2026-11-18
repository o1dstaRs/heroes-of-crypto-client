import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { GlProgram, Mesh, MeshGeometry, Shader } from "pixi.js";
import { rotatingAuraProjection } from "./RotatingAuraProjection";

/** A procedural source of power projected onto the floor, independent of gameplay reach. */
export function pegasusCoreProjection(center: HoCMath.XY, gs: GridSettings, narrowing: number) {
    return rotatingAuraProjection(
        { x: center.x, y: center.y - gs.getCellSize() * 0.1 },
        gs.getCellSize() * 1.85,
        gs.getCellSize() * 1.25,
        0,
        gs,
        narrowing,
        1,
        0.5,
    );
}

export function createPegasusPowerCore(projection: NonNullable<ReturnType<typeof pegasusCoreProjection>>) {
    const geometry = new MeshGeometry(projection);
    const shader = new Shader({
        glProgram: GlProgram.from({
            name: "pegasus-power-core",
            vertex: `#version 300 es
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
}`,
            fragment: `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uTime;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p); f=f*f*f*(f*(f*6.-15.)+10.);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){
    float v=0.,w=.57;
    mat2 turn=mat2(.8,-.6,.6,.8);
    for(int i=0;i<4;i++){v+=w*noise(p);p=turn*p*2.03+vec2(17.1,9.2);w*=.48;}
    return v;
}
void main(){
    vec2 p=(vUV-.5)*2.;
    float r=length(p),t=uTime;
    float edge=1.-smoothstep(.58,.98,r);
    if(edge<=0.){finalColor=vec4(0.);return;}
    // A continuous luminous bed, with low-contrast material motion instead of isolated ridges.
    vec2 flow=p*2.2+vec2(t*.035,-t*.025);
    float broad=fbm(flow);
    float drift=fbm(flow*1.24+vec2(7.4-t*.018,3.2+t*.022));
    float phase=t*1.65346982;
    float pulse=pow(.5+.5*cos(phase),3.);
    // A restrained charge releases into the outer floor wave without a bright flash.
    float release=pow(.5+.5*cos(phase-r*1.6),3.);
    float spread=1.+.14*release;
    vec2 warped=p+vec2(broad-.5,drift-.5)*.045;
    float d=dot(warped,warped)/(spread*spread);
    float material=.94+.06*broad;
    float pool=exp(-d*2.8)*material*(.30+.55*release);
    float source=exp(-d*7.)*(.23+.65*pulse);
    float satin=.5+.5*sin(p.x*3.2-p.y*2.1+broad*2.+t*.16);
    float sheen=(.45+.55*drift)*(.75+.25*satin)*exp(-d*4.);
    vec3 amber=vec3(1.,.48,.16);
    vec3 champagne=vec3(1.,.80,.48);
    vec3 color=mix(amber,champagne,.50+.08*broad);
    vec3 light=color*pool*.64;
    light+=vec3(1.,.88,.64)*source*.53;
    light+=champagne*sheen*.065;
    // The low-frequency halo brightens with the same energy pulse and joins the outer aura.
    light+=amber*exp(-d*1.5)*(.07+.13*release);
    // A shared luminance shoulder retains warm colour at the peak instead of clipping to white.
    light/=1.+max(light.r,max(light.g,light.b))*.55;
    light*=edge*.85;
    // Coverage remains nonzero for the camera's premultiplied composite; opacity is applied once.
    finalColor=vec4(light,min(.96,max(light.r,max(light.g,light.b))))*vColor;
}`,
        }),
        resources: {
            aura: {
                uTime: { value: 0, type: "f32" },
            },
        },
    });
    const mesh = new Mesh({ geometry, shader });
    mesh.label = "pegasus-power-core";
    mesh.eventMode = "none";
    mesh.blendMode = "add";
    mesh.once("destroyed", () => {
        shader.destroy();
        geometry.destroy(true);
    });
    return mesh;
}
