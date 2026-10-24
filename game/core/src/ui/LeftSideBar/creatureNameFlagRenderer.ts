import { createCreatureFlagMesh } from "./creatureNameFlagMesh";
import type { CreatureFlagPalette } from "./creatureNameFlagPalette";

// Static cloth silhouette. Only depletion changes require another frame.
const VERTEX = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
    vUv = aPosition;
    float screenY = 0.5 + (aPosition.y - 0.5) * 0.73;
    gl_Position = vec4(aPosition.x * 2.0 - 1.0, 1.0 - screenY * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uCloth;
uniform float uFill;

uniform vec3 uShadowColor;
uniform vec3 uLightColor;
float materialValue(vec4 texel) {
    // Mips filter premultiplied texels. Recover the fabric value without a dark fringe at torn threads.
    return clamp(texel.r / max(texel.a, 0.001), 0.0, 1.0);
}
void main() {
    // Trim the bottom 1% upward without scaling or shifting the top edge or the title.
    if (vUv.y > 0.99) discard;
    vec4 cloth = texture2D(uCloth, vUv);
    float material = materialValue(cloth);
    vec3 empty = vec3(material * 0.15 + 0.028);
    // Keep the full dim silhouette; only the coloured fill has a vertical cutoff.
    float aliveMask = step(vUv.x, uFill) * step(0.0001, uFill);
    // Same horizontal edge / center / edge gradient as battlefield count flags.
    float edgeWeight = abs(vUv.x * 2.0 - 1.0);
    // Preserve the approved cloth's fold contrast instead of flattening its lit ridges.
    // The fallback applies the same material curve, then doubles the coloured cloth only.
    vec3 teamCloth = mix(uShadowColor, uLightColor, edgeWeight) * (2.0 * min(1.0, 1.35 * material));
    vec3 albedo = mix(empty, teamCloth, aliveMask);

    // Preserve the gold hem painted into the source; do not trace or dilate its silhouette.
    float goldMask = smoothstep(0.30, 0.55, cloth.g / max(cloth.r, 0.001));
    vec3 paintedGold = cloth.rgb / max(cloth.a, 0.001);
    albedo = mix(albedo, paintedGold, goldMask);

    gl_FragColor = vec4(albedo, cloth.a);
}`;

export interface CreatureNameFlagRenderer {
    draw(fill: number, palette: CreatureFlagPalette): void;
    dispose(): void;
}

export function createCreatureNameFlagRenderer(
    canvas: HTMLCanvasElement,
    image: HTMLImageElement,
): CreatureNameFlagRenderer | undefined {
    const gl = canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: false,
        antialias: true,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
    });
    if (!gl) return undefined;
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let texture: WebGLTexture | null = null;
    let indexBuffer: WebGLBuffer | null = null;
    const dispose = () => {
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (indexBuffer) gl.deleteBuffer(indexBuffer);
        if (program) gl.deleteProgram(program);
        shaders.forEach((shader) => gl.deleteShader(shader));
    };
    try {
        const compile = (type: number, source: string) => {
            const shader = gl.createShader(type);
            if (!shader) throw new Error("Could not create flag shader");
            shaders.push(shader);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(gl.getShaderInfoLog(shader) ?? "Flag shader compile failed");
            }
            return shader;
        };
        program = gl.createProgram();
        if (!program) throw new Error("Could not create flag program");
        gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Flag shader link failed");
        gl.useProgram(program);
        buffer = gl.createBuffer();
        indexBuffer = gl.createBuffer();
        texture = gl.createTexture();
        if (!buffer || !texture || !indexBuffer) throw new Error("Could not allocate flag resources");
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const mesh = createCreatureFlagMesh();
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "aPosition");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        const isPowerOfTwo = (value: number) => value > 0 && (value & (value - 1)) === 0;
        const mipmapped = isPowerOfTwo(image.naturalWidth) && isPowerOfTwo(image.naturalHeight);
        if (mipmapped) gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        const anisotropy = gl.getExtension("EXT_texture_filter_anisotropic");
        if (anisotropy && mipmapped) {
            gl.texParameterf(
                gl.TEXTURE_2D,
                anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
                Math.min(8, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)),
            );
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(gl.getUniformLocation(program, "uCloth"), 0);
        const fillUniform = gl.getUniformLocation(program, "uFill");
        const shadowUniform = gl.getUniformLocation(program, "uShadowColor");
        const lightUniform = gl.getUniformLocation(program, "uLightColor");
        return {
            draw(fill, palette) {
                gl.viewport(0, 0, canvas.width, canvas.height);
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.uniform1f(fillUniform, fill);
                gl.uniform3f(shadowUniform, ...palette.shadow);
                gl.uniform3f(lightUniform, ...palette.light);
                gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
            },
            dispose() {
                dispose();
                // Selection panels can be mounted repeatedly; release the context as well as its objects.
                gl.getExtension("WEBGL_lose_context")?.loseContext();
            },
        };
    } catch (error) {
        dispose();
        console.warn("Creature flag uses its static fallback:", error);
        return undefined;
    }
}
