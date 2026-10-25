import { GlProgram, Shader, type Texture } from "pixi.js";

/** Shared authored light for moving arrows across the entire aura, including beneath its owner. */
export function createArrowAuraShader(texture: Texture, single: boolean): Shader {
    return new Shader({
        glProgram: GlProgram.from({
            name: "shared-arrow-aura",
            vertex: /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec4 uColor;
void main() {
    vUV = aUV;
    vColor = uColor * uWorldColorAlpha;
    gl_Position = vec4((uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.)).xy, 0., 1.);
}`,
            fragment: /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform sampler2D uArrows;
uniform vec2 uFieldCells;
uniform float uSingle;
void main() {
    vec2 field = fract(vUV * 8.);
    float spacing = 512. / 6.;
    if (uSingle < .5) {
        finalColor = texture(uArrows, vUV) * vColor;
        return;
    }
    vec2 cel = floor(vUV * 8.);
    float phase = (cel.y * 8. + cel.x) / 64.;
    // Wolf Rider advances one cell per 3.2 seconds, with the same adjacent-frame crossfade.
    vec2 local = (fract(field * uFieldCells - vec2(phase, 0.)) - .5) * spacing / 1.4 + vec2(22., 25.);
    // Sample an interior sprite of frame zero, away from its baked boundary fade.
    vec2 origin = floor(vec2(2.5 * spacing - 36., 2.5 * spacing - 25.) + .5);
    vec2 sampleUV = (origin + local) / 4096.;
    // The gap follows both sloping arms; a vertical cut would amputate the first tip.
    float divider = 42. - abs(local.y - 25.) * .88;
    float keep = uSingle > .5 ? 1. - smoothstep(divider - 1., divider + 1., local.x) : 1.;
    vec2 edge = min(field, 1. - field) * 512.;
    float boundaryFade = smoothstep(3., 27., min(edge.x, edge.y));
    finalColor = texture(uArrows, sampleUV) * keep * boundaryFade * vColor;
}`,
        }),
        resources: {
            uArrows: texture.source,
            arrowGrid: {
                uFieldCells: { value: new Float32Array([6, 5]), type: "vec2<f32>" },
                uSingle: { value: single ? 1 : 0, type: "f32" },
            },
        },
    });
}
