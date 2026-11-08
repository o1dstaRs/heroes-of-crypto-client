import { ColorMatrixFilter, Filter, GlProgram } from "pixi.js";

import {
    CHAOS_PORTRAIT_BACKGROUND_MATRIX,
    HYDRA_PORTRAIT_NON_EMISSIVE_MASK,
    HYDRA_PORTRAIT_SCALE_MATRIX,
    HYDRA_PORTRAIT_WARM_MASK,
} from "../ui/creaturePortraitPalette";

export const createChaosPortraitBackgroundFilter = (): ColorMatrixFilter => {
    const filter = new ColorMatrixFilter();
    filter.matrix = [...CHAOS_PORTRAIT_BACKGROUND_MATRIX];
    return filter;
};

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

const vector = (values: readonly number[]) => `vec3(${values.map((value) => value.toFixed(4)).join(", ")})`;
const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
void main() {
    vec4 source = texture(uTexture, vTextureCoord);
    vec3 rgb = source.rgb / max(source.a, 0.00001);
    float warm = clamp(dot(rgb, ${vector(HYDRA_PORTRAIT_WARM_MASK)}), 0.0, 1.0);
    float nonEmissive = clamp(dot(rgb, ${vector(HYDRA_PORTRAIT_NON_EMISSIVE_MASK.slice(0, 3))}) + ${HYDRA_PORTRAIT_NON_EMISSIVE_MASK[4].toFixed(4)}, 0.0, 1.0);
    vec3 olive = vec3(
        dot(rgb, ${vector(HYDRA_PORTRAIT_SCALE_MATRIX.slice(0, 3))}),
        dot(rgb, ${vector(HYDRA_PORTRAIT_SCALE_MATRIX.slice(5, 8))}),
        dot(rgb, ${vector(HYDRA_PORTRAIT_SCALE_MATRIX.slice(10, 13))})
    );
    finalColor = vec4(mix(rgb, clamp(olive, 0.0, 1.0), (1.0 - warm) * nonEmissive) * source.a, source.a);
}`;

/** Same material masks as the SVG renderer, with premultiplied alpha restored before compositing. */
export const createHydraPortraitFilter = (): Filter =>
    new Filter({
        glProgram: GlProgram.from({ name: "hydra-portrait-palette", vertex, fragment }),
    });
