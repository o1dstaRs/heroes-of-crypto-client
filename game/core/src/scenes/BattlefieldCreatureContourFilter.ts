import { Filter } from "pixi.js";

import { staticBattlefieldTextureNameForUnit } from "@/pixi/PixiUnitsFactory";

/** Warm charcoal sampled from the dungeon's central stone tiles. */
export const BATTLEFIELD_CREATURE_CONTOUR_COLOR = 0x241f19;
/** Furnace-adjacent rows render the rim at 60%, i.e. forty percent more transparent. */
export const BATTLEFIELD_CREATURE_CONTOUR_FURNACE_OPACITY = 0.6;

/**
 * Level-three battlefield cutouts already contain the approved two-pixel outer rim. Every other field
 * sprite receives the same treatment at render time so static art and every animation frame stay
 * visually consistent without duplicating the baked pass on the approved level-three set.
 */
export function shouldApplyRuntimeBattlefieldContour(
    unitName: string,
    footprintWidth: number,
    footprintHeight: number = footprintWidth,
): boolean {
    // The footprint, not a scalar size: the approved cutout set is keyed by the ART TIER a body resolves to,
    // and a rectangle resolves to the two-cell tier on either axis. Passing one number would ask about a
    // square the unit is not, and silently double the rim on art that already bakes it.
    return staticBattlefieldTextureNameForUnit(unitName, footprintWidth, footprintHeight) === undefined;
}

const VERTEX = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vTexelSize;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
    vTexelSize = uInputSize.zw;
}
`;

const fragmentForOpacity = (contourOpacity: number): string => /* glsl */ `
in vec2 vTextureCoord;
in vec2 vTexelSize;
out vec4 finalColor;

uniform sampler2D uTexture;

const vec3 OUTLINE_COLOR = vec3(0.14117647, 0.12156863, 0.09803922);
const float OUTLINE_OPACITY = ${contourOpacity.toFixed(8)};

float maximumRingAlpha(vec2 uv, vec2 pixelStep) {
    float value = 0.0;
    value = max(value, texture(uTexture, uv + vec2( pixelStep.x, 0.0)).a);
    value = max(value, texture(uTexture, uv + vec2(-pixelStep.x, 0.0)).a);
    value = max(value, texture(uTexture, uv + vec2(0.0,  pixelStep.y)).a);
    value = max(value, texture(uTexture, uv + vec2(0.0, -pixelStep.y)).a);
    value = max(value, texture(uTexture, uv + vec2( pixelStep.x,  pixelStep.y)).a);
    value = max(value, texture(uTexture, uv + vec2(-pixelStep.x,  pixelStep.y)).a);
    value = max(value, texture(uTexture, uv + vec2( pixelStep.x, -pixelStep.y)).a);
    value = max(value, texture(uTexture, uv + vec2(-pixelStep.x, -pixelStep.y)).a);
    return value;
}

void main(void) {
    vec4 source = texture(uTexture, vTextureCoord);
    float alpha = source.a;

    vec2 ring1 = vTexelSize;
    vec2 ring2 = vTexelSize * 2.0;

    // Match the baked level-three rim: 220 alpha on the first pixel, 120 on the second.
    float outerNear = maximumRingAlpha(vTextureCoord, ring1) * 0.86274510;
    float outerFar = maximumRingAlpha(vTextureCoord, ring2) * 0.47058824;
    float outlineAlpha = max(outerNear, outerFar);

    // Preserve every original source pixel byte-for-byte in the foreground. Only fill transparent
    // pixels around the silhouette, matching the original Arachna Queen treatment without tinting,
    // darkening, or otherwise changing details such as Medusa's hair.
    float addedOutlineAlpha = outlineAlpha * (1.0 - alpha) * OUTLINE_OPACITY;

    finalColor = vec4(
        source.rgb + OUTLINE_COLOR * addedOutlineAlpha,
        alpha + addedOutlineAlpha
    );
}
`;

const sharedContourFilters = new Map<number, Filter | null>();

/** One immutable shader instance per approved opacity is safe to share across creature sprites. */
export function getBattlefieldCreatureContourFilter(contourOpacity = 1): Filter | undefined {
    const safeOpacity = Math.max(0, Math.min(1, contourOpacity));
    const cachedFilter = sharedContourFilters.get(safeOpacity);
    if (cachedFilter !== undefined) return cachedFilter ?? undefined;
    try {
        const filter = Filter.from({
            gl: { vertex: VERTEX, fragment: fragmentForOpacity(safeOpacity) },
            resources: {},
        });
        filter.resolution = Math.min(globalThis.devicePixelRatio || 1, 2);
        filter.padding = 3;
        sharedContourFilters.set(safeOpacity, filter);
    } catch {
        // Headless tests and unsupported renderers keep the original art rather than failing gameplay.
        sharedContourFilters.set(safeOpacity, null);
    }
    return sharedContourFilters.get(safeOpacity) ?? undefined;
}
