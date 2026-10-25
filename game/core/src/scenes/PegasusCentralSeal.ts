import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { GlProgram, Mesh, MeshGeometry, Shader, Texture } from "pixi.js";
import { rotatingAuraProjection } from "./RotatingAuraProjection";

export const PEGASUS_CENTRAL_SEAL_KEY = "vfx_pegasus_central_winged_seal_v6";

/** A fixed two-cell floor insignia, independent of aura reach and creature facing. */
export function pegasusSealProjection(center: HoCMath.XY, gs: GridSettings, narrowing: number) {
    return rotatingAuraProjection(
        { x: center.x, y: center.y - gs.getCellSize() * 0.1 },
        gs.getCellSize(),
        gs.getCellSize() * 0.5,
        0,
        gs,
        narrowing,
        1,
        0.5,
    );
}

export function createPegasusCentralSeal(
    texture: Texture,
    projection: NonNullable<ReturnType<typeof pegasusSealProjection>>,
) {
    const geometry = new MeshGeometry(projection);
    const shader = new Shader({
        glProgram: GlProgram.from({
            name: "pegasus-central-floor-seal",
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
uniform sampler2D uSeal;
uniform float uTime;
uniform float uStraightAlpha;
void main(){
    vec4 c=texture(uSeal,vUV);
    c.rgb*=mix(1.,c.a,uStraightAlpha);
    float sweep=pow(max(0.,sin(vUV.x*4.+vUV.y*2.-uTime*.65)),16.);
    c.rgb+=vec3(1.,.72,.30)*c.a*sweep*.14;
    finalColor=c*vColor;
}`,
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
    const mesh = new Mesh({ geometry, shader });
    mesh.label = "pegasus-central-floor-seal";
    mesh.eventMode = "none";
    mesh.once("destroyed", () => {
        shader.destroy();
        geometry.destroy(true);
    });
    return mesh;
}
