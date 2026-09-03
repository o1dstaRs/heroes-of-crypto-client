import { Filter } from "pixi.js";

const UNITS_WITH_AUTHORED_ALPHA_CRACKS = new Set(["Peasant", "Harpy", "Elf", "Valkyrie"]);

/** These authored frames contain small transparent cracks inside otherwise opaque body regions. */
export const shouldFillBattlefieldAlphaHoles = (unitName: string): boolean =>
    UNITS_WITH_AUTHORED_ALPHA_CRACKS.has(unitName);

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

const FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vTexelSize;
out vec4 finalColor;

uniform sampler2D uTexture;

void main(void) {
    vec4 source = texture(uTexture, vTextureCoord);
    vec4 left = texture(uTexture, vTextureCoord - vec2(vTexelSize.x, 0.0));
    vec4 right = texture(uTexture, vTextureCoord + vec2(vTexelSize.x, 0.0));
    vec4 up = texture(uTexture, vTextureCoord - vec2(0.0, vTexelSize.y));
    vec4 down = texture(uTexture, vTextureCoord + vec2(0.0, vTexelSize.y));
    vec4 upLeft = texture(uTexture, vTextureCoord - vTexelSize);
    vec4 downRight = texture(uTexture, vTextureCoord + vTexelSize);
    vec4 upRight = texture(uTexture, vTextureCoord + vec2(vTexelSize.x, -vTexelSize.y));
    vec4 downLeft = texture(uTexture, vTextureCoord + vec2(-vTexelSize.x, vTexelSize.y));

    // Only bridge a transparent texel when opaque artwork exists on two opposing sides. This closes the
    // thin authored cracks while preserving open gaps between limbs, weapons, feathers and clothing.
    float bridge = max(
        max(min(left.a, right.a), min(up.a, down.a)),
        max(min(upLeft.a, downRight.a), min(upRight.a, downLeft.a))
    );
    float fillAlpha = bridge * step(0.42, bridge) * (1.0 - source.a);

    vec4 neighbours = left + right + up + down + upLeft + upRight + downLeft + downRight;
    float neighbourAlpha = max(0.0001, left.a + right.a + up.a + down.a + upLeft.a + upRight.a + downLeft.a + downRight.a);
    vec3 fillColor = neighbours.rgb / neighbourAlpha;

    finalColor = vec4(source.rgb + fillColor * fillAlpha, source.a + fillAlpha);
}
`;

let sharedFilter: Filter | null | undefined;

/** Shared immutable bridge filter; unsupported/headless renderers simply retain the original texture. */
export const getBattlefieldAlphaHoleFillFilter = (): Filter | undefined => {
    if (sharedFilter !== undefined) return sharedFilter ?? undefined;
    try {
        sharedFilter = Filter.from({ gl: { vertex: VERTEX, fragment: FRAGMENT }, resources: {} });
        // Match the renderer's capped resolution instead of allocating a 2x intermediate surface for
        // every repaired creature on large Retina displays.
        sharedFilter.resolution = "inherit";
        sharedFilter.padding = 1;
    } catch {
        sharedFilter = null;
    }
    return sharedFilter ?? undefined;
};
