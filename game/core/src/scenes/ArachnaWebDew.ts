import { Geometry, GlProgram, Shader } from "pixi.js";
import { ARACHNA_WEB_DESIGN } from "./ArachnaWebDesign";
import { type ArachnaContactField, type SilkContact } from "./ArachnaWebContacts";
import { type WebPlacement } from "./ArachnaWebGeometry";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

/** Sparse permanent beads, seated on real capture silk away from the opening/anchors. */
export const ARACHNA_WEB_DEW = [164, 227, 293, 351, 406, 469, 513, 574, 601].map((strand, i) => {
    const path = ARACHNA_WEB_DESIGN.strands[strand].points;
    const k = (5 + (i % 4)) * 2;
    return { x: path[k], y: path[k + 1], radius: 1.5 + (i % 3) * 0.55, phase: i * 2.17 };
});
export const arachnaDewLoads: readonly SilkContact[] = ARACHNA_WEB_DEW.map((drop) => ({
    x: drop.x,
    y: drop.y,
    load: drop.radius * 0.035,
    age: 0,
    strength: 0,
}));
export function arachnaDewPose(index: number, time: number, field: ArachnaContactField) {
    const drop = ARACHNA_WEB_DEW[index];
    const motion = field.motion(drop.x, drop.y, time);
    const before = field.motion(drop.x, drop.y, time - 40);
    const after = field.motion(drop.x, drop.y, time + 40);
    // A bounded pendulum response to support acceleration, with a weak secondary mode.
    const acceleration = (before.x + after.x - 2 * motion.x) * 75;
    const swing = Math.max(-0.65, Math.min(0.65, -acceleration + Math.sin(time * 0.0023 + drop.phase) * 0.12));
    return {
        x: drop.x + motion.x + swing * drop.radius * 0.3,
        y: drop.y + motion.y + drop.radius * 0.48,
        height: motion.height,
        radius: drop.radius,
    };
}
export function createArachnaDewGeometry(): Geometry {
    const positions = new Float32Array(ARACHNA_WEB_DEW.length * 8);
    const uv: number[] = [],
        indices: number[] = [];
    for (let i = 0; i < ARACHNA_WEB_DEW.length; i++) {
        uv.push(-1.35, -1.35, 1.35, -1.35, 1.35, 1.35, -1.35, 1.35);
        const n = i * 4;
        indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
    }
    return new Geometry({
        attributes: {
            aPosition: { buffer: positions, format: "float32x2" },
            aUV: { buffer: new Float32Array(uv), format: "float32x2" },
            aGround: { buffer: new Float32Array(positions.length), format: "float32x2" },
        },
        indexBuffer: new Uint16Array(indices),
    });
}
export function updateArachnaDew(
    geometry: Geometry,
    placement: WebPlacement,
    time: number,
    field: ArachnaContactField,
) {
    const positions = geometry.getBuffer("aPosition").data,
        uv = geometry.getBuffer("aUV").data,
        ground = geometry.getBuffer("aGround").data;
    for (let i = 0; i < ARACHNA_WEB_DEW.length; i++) {
        const drop = arachnaDewPose(i, time, field);
        for (let k = 0; k < 4; k++) {
            const n = i * 8 + k * 2;
            const x = placement.center.x + ((drop.x + uv[n] * drop.radius) / 640 - 0.5) * placement.width;
            const y = placement.center.y + (0.5 - (drop.y + uv[n + 1] * drop.radius) / 640) * placement.height;
            const point = projectBattlefieldPoint({ x, y }, placement.gs);
            positions[n] = point.x;
            positions[n + 1] = point.y;
            ground[n] = x;
            ground[n + 1] = y;
        }
    }
    geometry.getBuffer("aPosition").update();
    geometry.getBuffer("aGround").update();
}
const vertex = `#version 300 es
in vec2 aPosition; in vec2 aUV; in vec2 aGround;
uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha; uniform vec4 uColor;
out vec2 vUV; out vec2 vGround; out vec2 vCanvas; out vec4 vColor;
void main(){vec3 p=uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.);vCanvas=p.xy;vUV=aUV;vGround=aGround;vColor=uWorldColorAlpha*uColor;gl_Position=vec4((uProjectionMatrix*p).xy,0.,1.);}`;
const fragment = `#version 300 es
precision highp float;
in vec2 vUV;in vec2 vGround;in vec2 vCanvas;in vec4 vColor;out vec4 finalColor;
uniform float uReveal;uniform vec4 uBounds;uniform vec4 uPlacement;uniform vec4 uTorches[5];
void main(){
 if(vGround.x<uBounds.x||vGround.y<uBounds.y||vGround.x>uBounds.z||vGround.y>uBounds.w)discard;
 vec2 q=vec2(vUV.x,vUV.y*.92);float d=length(q);float aa=max(fwidth(d),.035);
 float mask=1.-smoothstep(1.-aa,1.+aa,d);
 float z=sqrt(max(0.,1.-min(1.,d*d)));vec3 N=normalize(vec3(q,z));
 float resolved=1.-smoothstep(.2,1.1,aa);float rim=pow(1.-z,3.);
 float glint=pow(max(0.,dot(N,normalize(vec3(-.45,-.6,1.)))),mix(8.,45.,resolved))*mix(.18,1.,resolved);
 float caustic=exp(-dot(q-vec2(.25,.47),q-vec2(.25,.47))*28.);
 vec3 col=vec3(.16,.22,.25)+vec3(.46,.40,.27)*rim+vec3(1.,.91,.71)*glint+vec3(.37,.43,.40)*caustic;
 for(int i=0;i<5;i++){
   if(uTorches[i].w<=.001) continue;
   vec2 delta=uTorches[i].xy-vCanvas;float h=max(1.,uTorches[i].z);
   vec3 H=normalize(normalize(vec3(delta,h))+vec3(0.,0.,1.));
   col+=vec3(1.,.58,.22)*pow(max(0.,dot(N,H)),mix(7.,32.,resolved))*mix(.22,1.,resolved)*uTorches[i].w/(1.+dot(delta,delta)/(h*h*9.));
 }
 float alpha=mask*(.075+.48*rim+.70*glint+.18*caustic);
 float shadow=(1.-smoothstep(.1,.8,length((q-vec2(.16,.55))*vec2(1.,1.8))))*.12*(1.-mask);
 vec2 uv=(vGround-uPlacement.xy)/uPlacement.zw+.5;
 float distance=max(abs(uv.x-.5),abs(uv.y-.5))*2.;
 float reveal=1.-smoothstep(uReveal*1.18-.18,uReveal*1.18,distance);
 finalColor=vec4(col*alpha+vec3(.02)*shadow,alpha+shadow)*vColor*reveal;
}`;
export function createArachnaDewShader(): Shader {
    return new Shader({
        glProgram: GlProgram.from({ name: "arachna-silk-dew", vertex, fragment }),
        resources: {
            silk: {
                uTime: { value: 0, type: "f32" },
                uReveal: { value: 0, type: "f32" },
                uBounds: { value: new Float32Array(4), type: "vec4<f32>" },
                uPlacement: { value: new Float32Array(4), type: "vec4<f32>" },
                uTorches: { value: new Float32Array(20), type: "vec4<f32>", size: 5 },
            },
        },
    });
}
