import { GlProgram, Mesh, MeshGeometry, Shader, type Texture } from "pixi.js";

const vertex = `#version 300 es
in vec2 aPosition; in vec2 aUV;
out vec2 vUV; out vec4 vColor;
uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha; uniform vec4 uColor;
void main() {
    vUV = aUV; vColor = uColor * uWorldColorAlpha;
    gl_Position = vec4((uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.)).xy, 0., 1.);
}`;
const fragment = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vColor; out vec4 finalColor;
uniform sampler2D uArt;
uniform vec4 uFrom; uniform vec4 uTo;
uniform float uBlend; uniform float uStraight;
vec4 cel(vec4 rect) {
    vec4 c = texture(uArt, rect.xy + vUV * rect.zw);
    c.rgb *= mix(1., c.a, uStraight);
    return c;
}
void main() {
    finalColor = mix(cel(uFrom), cel(uTo), uBlend) * vColor;
}`;

/** Two atlas samples, blended before compositing so translucent fire does not dim between cels. */
export class InterpolatedFlagCel extends Mesh<MeshGeometry, Shader> {
    public constructor(
        private readonly frames: readonly Texture[],
        size: number,
    ) {
        const geometry = new MeshGeometry({
            positions: new Float32Array([-size / 2, -size, size / 2, -size, size / 2, 0, -size / 2, 0]),
            uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
            indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
        });
        const source = frames[0].source;
        const shader = new Shader({
            glProgram: GlProgram.from({ name: "interpolated-flag-cel", vertex, fragment }),
            resources: {
                uArt: source,
                uArtSampler: source.style,
                cels: {
                    uFrom: { value: new Float32Array(4), type: "vec4<f32>" },
                    uTo: { value: new Float32Array(4), type: "vec4<f32>" },
                    uBlend: { value: 0, type: "f32" },
                    uStraight: { value: source.alphaMode === "no-premultiply-alpha" ? 1 : 0, type: "f32" },
                },
            },
        });
        super({ geometry, shader });
        this.label = "blind-fury-interpolated-cels";
        this.eventMode = "none";
        this.once("destroyed", () => {
            shader.destroy();
            geometry.destroy(true);
        });
        this.setCel(0, 0);
    }
    public setCel(frame: number, blend: number): void {
        const uniforms = this.shader!.resources.cels.uniforms;
        this.setRect(uniforms.uFrom, this.frames[frame]);
        this.setRect(uniforms.uTo, this.frames[Math.min(frame + 1, this.frames.length - 1)]);
        uniforms.uBlend = Math.max(0, Math.min(1, blend));
    }
    private setRect(rect: Float32Array, texture: Texture): void {
        // Half-texel inset prevents neighboring atlas cells leaking through linear filtering.
        const { frame, source } = texture;
        rect[0] = (frame.x + 0.5) / source.width;
        rect[1] = (frame.y + 0.5) / source.height;
        rect[2] = (frame.width - 1) / source.width;
        rect[3] = (frame.height - 1) / source.height;
    }
}
