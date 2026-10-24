import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Geometry, GlProgram, Mesh, Shader } from "pixi.js";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

export const SYLVAN_STAR_COUNT = 32;
const fract = (n: number) => n - Math.floor(n);
export type SylvanStarPlacement = {
    center: HoCMath.XY;
    rx: number;
    ry: number;
    cell: number;
    gs: GridSettings;
    narrowing: number;
};

export function createSylvanStarMesh(): Mesh<Geometry, Shader> {
    const uv: number[] = [],
        indices: number[] = [];
    for (let i = 0; i < SYLVAN_STAR_COUNT; i++) {
        uv.push(-1, -1, 1, -1, 1, 1, -1, 1);
        const k = i * 4;
        indices.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    const geometry = new Geometry({
        attributes: {
            aPosition: { buffer: new Float32Array(SYLVAN_STAR_COUNT * 8), format: "float32x2" },
            aUV: { buffer: new Float32Array(uv), format: "float32x2" },
            aState: { buffer: new Float32Array(SYLVAN_STAR_COUNT * 8), format: "float32x2" },
            aOptics: { buffer: new Float32Array(SYLVAN_STAR_COUNT * 8), format: "float32x2" },
        },
        indexBuffer: new Uint16Array(indices),
    });
    const shader = new Shader({
        glProgram: GlProgram.from({
            name: "satyr-sylvan-stars",
            vertex: `#version 300 es
in vec2 aPosition; in vec2 aUV; in vec2 aState; in vec2 aOptics;
out vec2 vUV;out vec2 vState;out vec2 vOptics;out vec4 vColor;
uniform mat3 uProjectionMatrix,uWorldTransformMatrix,uTransformMatrix;
uniform vec4 uWorldColorAlpha,uColor;
void main(){vUV=aUV;vState=aState;vOptics=aOptics;vColor=uColor*uWorldColorAlpha;
 gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);}`,
            fragment: `#version 300 es
precision highp float;
in vec2 vUV;in vec2 vState;in vec2 vOptics;in vec4 vColor;out vec4 finalColor;
float ray(vec2 p,float angle,float lengthScale,float width){
 vec2 axis=vec2(cos(angle),sin(angle));
 float along=abs(dot(p,axis)),across=abs(dot(p,vec2(-axis.y,axis.x)));
 return exp(-across*across/(width*width))*exp(-along*lengthScale)*(1.-smoothstep(.65,.96,along));
}
void main(){
 vec2 p=vUV;float r=length(p),aa=max(fwidth(r),.018);
 // A compact round emitter and multi-scale scattering lead; spikes are a subtle optical accent.
 float core=exp(-r*r/(.0018+aa*aa*.35));
 float inner=exp(-r*r*65.);
 float halo=exp(-r*r*8.)*.10+exp(-r*5.)*.055;
 float width=max(.025,aa*.58);
 float rays=ray(p,vOptics.x,3.2,width);
 rays+=ray(p,vOptics.x+1.0472,5.4,width*.8)*.50;
 rays+=ray(p,vOptics.x-1.0472,4.6,width*.8)*.65;
 rays*=vState.y*(.18+.50*vOptics.y);
 float fade=(1.-smoothstep(.78,1.,r))*vState.x;
 vec3 light=vec3(.12,.85,.39)*halo+vec3(.4,1.,.63)*(inner*.24+rays);
 light+=vec3(.91,1.,.83)*core*1.25;
 light*=fade;
 finalColor=vec4(light,min(1.,dot(light,vec3(.2,.65,.15))))*vColor;
}`,
        }),
    });
    const mesh = new Mesh({ geometry, shader });
    mesh.label = "satyr-sylvan-stars";
    mesh.eventMode = "none";
    mesh.blendMode = "add";
    mesh.once("destroyed", () => {
        shader.destroy();
        geometry.destroy(true);
    });
    return mesh;
}

/** Reuses all buffers and scratch points; each star belongs to exactly one depth half. */
export function updateSylvanStars(
    mesh: Mesh<Geometry, Shader>,
    placement: SylvanStarPlacement,
    time: number,
    front: boolean,
    scratch: HoCMath.XY,
    projected: HoCMath.XY,
    axisRatio: number,
    screenScale: number,
): void {
    const positions = mesh.geometry.getBuffer("aPosition").data;
    const states = mesh.geometry.getBuffer("aState").data;
    const optics = mesh.geometry.getBuffer("aOptics").data;
    const { center, rx, ry, cell, gs, narrowing } = placement;
    const inset = Math.max(0, narrowing) * cell;
    for (let i = 0; i < SYLVAN_STAR_COUNT; i++) {
        const seed = fract(Math.sin(i * 127.1 + 19.3) * 43758.5453);
        const major = i < 8;
        const angle = i * 2.39996 + time * (major ? 0.085 : 0.14);
        const radius = major ? 0.52 + seed * 0.32 : 0.12 + seed * 0.73;
        const life = fract(time * (0.13 + seed * 0.06) + seed);
        scratch.x = center.x + Math.cos(angle) * rx * radius;
        scratch.y = center.y + Math.sin(angle) * ry * radius;
        const allowed =
            Math.sin(angle) < 0 === front &&
            scratch.x >= gs.getMinX() + inset &&
            scratch.x <= gs.getMaxX() - inset &&
            scratch.y >= gs.getMinY() + inset &&
            scratch.y <= gs.getMaxY() - inset;
        projectBattlefieldPoint(scratch, gs, projected);
        // Project the floor once, then add altitude. Counter camera compression for round star halos.
        const altitude = cell * (major ? 0.22 + Math.sin(time * 0.7 + i) * 0.12 : 0.05 + life * 0.8);
        const size = Math.max(
            cell * (major ? 0.3 + seed * 0.14 : 0.055 + seed * 0.035),
            (major ? 5 : 0.9) / Math.max(0.01, screenScale),
        );
        const brightness = allowed
            ? major
                ? 0.38 + 0.62 * Math.pow(0.5 + 0.5 * Math.sin(time * (0.8 + seed * 0.7) + i * 2.3), 4)
                : Math.sin(life * Math.PI) ** 2 * 0.6
            : 0;
        for (let k = 0; k < 4; k++) {
            const n = i * 8 + k * 2;
            // Invisible half uses degenerate geometry instead of drawing transparent overlapping quads.
            const scale = allowed ? size : 0;
            positions[n] = projected.x + (k === 0 || k === 3 ? -scale : scale);
            positions[n + 1] = projected.y + altitude + (k < 2 ? -scale : scale) * axisRatio;
            states[n] = brightness;
            states[n + 1] = major ? 1 : 0;
            optics[n] = seed * Math.PI + Math.sin(time * 0.16 + seed * 7) * 0.1;
            optics[n + 1] = brightness;
        }
    }
    mesh.geometry.getBuffer("aPosition").update();
    mesh.geometry.getBuffer("aState").update();
    mesh.geometry.getBuffer("aOptics").update();
}
